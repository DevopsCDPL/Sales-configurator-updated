const { Document, Project, Client, Estimate, EstimateItem, SalesOrder, WorkOrder, QualityRecord, User, Setting, RFQBundle, VendorPurchaseOrder, FileManagerFolder, Part } = require('../models');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const dayjs = require('dayjs');
const settingsService = require('./settingsService');
const documentNumberingService = require('./documentNumberingService');
const { generateDocumentName } = require('./documentNamingService');
const fileManagerService = require('./fileManagerService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildEstimateLineItems, buildDescription, buildStandardizedLineItems } = require('../utils/calculations');

// Resolve uploads root to an absolute path (consistent with index.js static serving)
const UPLOADS_ROOT = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', '..', 'uploads');

// Normalize file_path: strip leading 'uploads/' prefix left by legacy upload code
function resolveDocPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/?(uploads\/)+/, '');
  return path.join(UPLOADS_ROOT, normalized);
}

// Try multiple path strategies to find a document file on disk
async function findDocFile(filePath, altFileName, doc, opts = {}) {
  const fsSync = require('fs');
  // Strategy 1: resolve via resolveDocPath (strips uploads/ prefix)
  const primary = resolveDocPath(filePath);
  if (fsSync.existsSync(primary)) return primary;

  // Strategy 2: raw path.join with UPLOADS_ROOT (no stripping)
  const raw = path.join(UPLOADS_ROOT, filePath.replace(/\\/g, '/'));
  if (fsSync.existsSync(raw)) return raw;

  // Strategy 3: absolute path if filePath is already absolute
  if (path.isAbsolute(filePath) && fsSync.existsSync(filePath)) return filePath;

  // Strategy 4: search by filename in documents directory (flat + subdirs)
  const fileName = path.basename(filePath);
  const docsDir = path.join(UPLOADS_ROOT, 'documents');
  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    // Search flat files by exact name
    for (const e of entries) {
      if (!e.isDirectory() && e.name === fileName) {
        return path.join(docsDir, e.name);
      }
    }
    // Search subdirectories by exact name
    for (const e of entries) {
      if (e.isDirectory()) {
        const sub = path.join(docsDir, e.name, fileName);
        if (fsSync.existsSync(sub)) return sub;
      }
    }
    // Strategy 5: suffix match for multer-prefixed files (timestamp-random-originalname)
    const searchName = altFileName || fileName;
    const suffix = '-' + searchName;
    for (const e of entries) {
      if (!e.isDirectory() && e.name.endsWith(suffix)) {
        return path.join(docsDir, e.name);
      }
    }
    // Suffix match inside subdirectories
    for (const e of entries) {
      if (e.isDirectory()) {
        try {
          const subEntries = await fs.readdir(path.join(docsDir, e.name));
          for (const se of subEntries) {
            if (se === searchName || se.endsWith(suffix)) {
              return path.join(docsDir, e.name, se);
            }
          }
        } catch (_) { /* skip */ }
      }
    }
  } catch (_) { /* docsDir may not exist */ }

  // Strategy 6: search quality-reports directory
  const qualDir = path.join(UPLOADS_ROOT, 'quality-reports');
  try {
    const qEntries = await fs.readdir(qualDir);
    const qName = altFileName || fileName;
    for (const e of qEntries) {
      if (e === qName || e.endsWith('-' + qName)) {
        return path.join(qualDir, e);
      }
    }
  } catch (_) { /* qualDir may not exist */ }

  // Strategy 7: search root-level uploads/documents (legacy/alternate location)
  const rootUploads = path.join(__dirname, '..', '..', '..', 'uploads', 'documents');
  try {
    const rootEntries = await fs.readdir(rootUploads, { withFileTypes: true });
    const rName = altFileName || fileName;
    for (const e of rootEntries) {
      if (!e.isDirectory() && e.name === rName) return path.join(rootUploads, e.name);
    }
    for (const e of rootEntries) {
      if (e.isDirectory()) {
        const sub = path.join(rootUploads, e.name, rName);
        if (fsSync.existsSync(sub)) return sub;
      }
    }
  } catch (_) { /* rootUploads may not exist */ }

  // Strategy 8: Cloudflare R2 fallback — download to local cache
  const r2 = require('./r2StorageService');
  if (r2.isConfigured) {
    // Build list of R2 key candidates in priority order
    const keyCandidates = [];
    const fname = altFileName || path.basename(filePath);

    // 1. Stored r2_url key (explicitly set when uploading/generating)
    if (doc && doc.r2_url) keyCandidates.push(doc.r2_url);

    // 2. Hierarchical keys — two naming conventions in the codebase:
    //    a) unifiedFileService.buildStandardR2Key  → lowercase 'uploaded'/'generated'
    //    b) r2StorageService.syncBufferToR2         → capitalized 'Generated'/'Uploaded'
    if (doc && (doc.company_id || doc.project_id)) {
      try {
        const names = await r2.resolveNames(doc.company_id || null, doc.project_id || null);
        const { buildStandardR2Key } = require('./unifiedFileService');

        const companyName   = names.companyName   || null;
        const companyCode   = names.companyCode   || null;
        const projectName   = names.projectName   || null;
        const projectNumber = names.projectNumber || null;

        // a) unifiedFileService format (lowercase) — used for ALL user-uploaded files
        const baseOpts = {
          tenantId:      doc.company_id  || null,
          companyName,   companyCode,
          projectId:     doc.project_id  || null,
          projectName,   projectNumber,
          partId:        null,
          moduleType:    'project',
          section:       doc.document_type || 'documents',
          referenceId:   null,
          fileName:      fname,
        };
        keyCandidates.push(buildStandardR2Key({ ...baseOpts, isGenerated: false })); // uploaded
        keyCandidates.push(buildStandardR2Key({ ...baseOpts, isGenerated: true }));  // generated

        if (companyName || projectName) {
          const ids = {
            companyId:     doc.company_id  || null,
            companyCode:   companyCode     || null,
            projectId:     doc.project_id  || null,
            projectNumber: projectNumber   || null,
          };
          // b) r2StorageService format (capitalized) — used by savePdfDocument / syncBufferToR2
          keyCandidates.push(r2.buildR2Key(companyName, projectName, 'Generated', fname, ids));
          keyCandidates.push(r2.buildR2Key(companyName, projectName, 'Uploaded',  fname, ids));
          // Also without IDs (older format before Name_ID convention)
          keyCandidates.push(r2.buildR2Key(companyName, projectName, 'generated', fname, {}));
          keyCandidates.push(r2.buildR2Key(companyName, projectName, 'uploaded',  fname, {}));
        }
      } catch (_) { /* non-critical — fall through to legacy key */ }
    }

    // 3. Legacy flat key derived from DB path (e.g. "documents/timestamp-filename.pdf")
    const legacyKey = r2.keyFromDbPath(filePath);
    if (legacyKey) keyCandidates.push(legacyKey);
    const legacyFnameKey = r2.keyFromDbPath(fname);
    if (legacyFnameKey && legacyFnameKey !== legacyKey) keyCandidates.push(legacyFnameKey);

    for (const key of keyCandidates) {
      try {
        const { buffer } = await r2.download(key);
        // Validate the downloaded bytes are actually a PDF
        if (!buffer || buffer.length < 5 || buffer.indexOf(Buffer.from('%PDF')) === -1) {
          console.warn(`[R2] Key "${key}" returned non-PDF content (${buffer ? buffer.length : 0} bytes) — skipping`);
          continue;
        }
        console.log(`[R2] Found "${fname}" at key "${key}" (${buffer.length} bytes)`);

        // Backfill r2_url on the Document record so future lookups are instant
        if (doc && doc.id && (!doc.r2_url || doc.r2_url !== key)) {
          Document.update({ r2_url: key }, { where: { id: doc.id } }).catch(() => {});
        }

        // Cache locally for subsequent requests; fall back to os.tmpdir() if uploads dir is read-only
        let cachePath = primary;
        try {
          const saveDir = path.dirname(primary);
          fsSync.mkdirSync(saveDir, { recursive: true });
          fsSync.writeFileSync(primary, buffer);
        } catch {
          try {
            const os = require('os');
            const tmpPath = path.join(os.tmpdir(), path.basename(primary));
            fsSync.writeFileSync(tmpPath, buffer);
            cachePath = tmpPath;
          } catch {
            // Disk write completely failed — store buffer in module-level cache keyed by path
            _inMemoryCache.set(primary, buffer);
          }
        }
        return cachePath;
      } catch { /* not in R2 with this key */ }
    }

    // Strategy 9: R2 listing fallback — search by filename across company/project prefix and legacy flat prefix
    // This catches files stored in R2 under a key that wasn't guessed by the candidates above.
    // Skip during bulk merge to avoid listing the entire R2 bucket for each missing file (too slow).
    if (opts.skipListing) return primary;
    try {
      const listSearchKeys = [];
      const fname = altFileName || path.basename(filePath);
      // Strip multer timestamp prefix (e.g. "1234567890123-9876543210-original.pdf" → "original.pdf")
      const originalName = fname.replace(/^\d{10,}-\d+-/, '');

      // Cached R2 listing helper — reuses results across multiple findDocFile calls (e.g. during merge)
      const r2ListCache = opts.r2ListCache || null;
      const cachedListAllKeys = async (prefix) => {
        if (!r2ListCache) return r2.listAllKeys(prefix);
        const cacheKey = prefix || '__ROOT__';
        if (r2ListCache.has(cacheKey)) return r2ListCache.get(cacheKey);
        const promise = r2.listAllKeys(prefix);
        r2ListCache.set(cacheKey, promise);
        return promise;
      };

      // Sub-strategy 9a: search within company/project hierarchical prefix
      if (doc && (doc.company_id || doc.project_id)) {
        try {
          const names = await r2.resolveNames(doc.company_id || null, doc.project_id || null);
          if (names.companyName) {
            // Build a sample key to derive the company/project folder prefix
            const sampleKey = r2.buildR2Key(names.companyName, names.projectName, 'uploaded', '_placeholder_', {
              companyId: doc.company_id || null,
              companyCode: names.companyCode || null,
              projectId: doc.project_id || null,
              projectNumber: names.projectNumber || null,
            });
            const hierarchicalPrefix = sampleKey.replace(/\/_placeholder_$/, '/');
            const hierarchicalKeys = await cachedListAllKeys(hierarchicalPrefix);
            const matchKey = hierarchicalKeys.find(k => {
              const base = k.split('/').pop();
              return base === fname || base === originalName;
            });
            if (matchKey && !keyCandidates.includes(matchKey)) listSearchKeys.push(matchKey);
          }
        } catch (_) { /* non-critical */ }
      }

      // Sub-strategy 9b: search legacy flat 'documents/' prefix
      try {
        const legacyKeys = await cachedListAllKeys('documents/');
        const matchKey = legacyKeys.find(k => {
          const base = k.split('/').pop();
          return base === fname || base === originalName;
        });
        if (matchKey && !keyCandidates.includes(matchKey) && !listSearchKeys.includes(matchKey)) {
          listSearchKeys.push(matchKey);
        }
      } catch (_) { /* non-critical */ }

      for (const key of listSearchKeys) {
        try {
          const { buffer } = await r2.download(key);
          if (!buffer || buffer.length < 5 || buffer.indexOf(Buffer.from('%PDF')) === -1) continue;
          console.log(`[R2] Found "${fname}" via listing at key "${key}" (${buffer.length} bytes)`);
          // Backfill r2_url so future lookups are instant
          if (doc && doc.id) {
            Document.update({ r2_url: key }, { where: { id: doc.id } }).catch(() => {});
          }
          let cachePath = primary;
          try {
            const saveDir = path.dirname(primary);
            fsSync.mkdirSync(saveDir, { recursive: true });
            fsSync.writeFileSync(primary, buffer);
          } catch {
            try {
              const os = require('os');
              const tmpPath = path.join(os.tmpdir(), path.basename(primary));
              fsSync.writeFileSync(tmpPath, buffer);
              cachePath = tmpPath;
            } catch {
              _inMemoryCache.set(primary, buffer);
            }
          }
          return cachePath;
        } catch { /* not found with this key */ }
      }
    } catch (_) { /* non-critical — listing failed entirely */ }
  }

  // Return primary path (will fail at read time with a clear error)
  return primary;
}

// In-memory buffer cache for when all disk writes fail (ephemeral FS + full tmpdir)
const _inMemoryCache = new Map();

class DocumentService {
  // Expose the multi-strategy file finder for use by controllers
  async findDocFile(filePath, altFileName, doc, opts = {}) {
    return findDocFile(filePath, altFileName, doc, opts);
  }

  async getDocumentsByProjectId(projectId, filters = {}) {
    // Fetch project company_id for backfill creates
    const projectForTenant = await Project.findByPk(projectId, { attributes: ['id', 'company_id'] });
    const backfillCompanyId = projectForTenant?.company_id || null;

    // Migrate legacy quality docs that were saved with document_type='quality'
    // to 'inspection_report' so they show up in the Documents tab.
    try {
      await Document.update(
        { document_type: 'inspection_report' },
        { where: { project_id: projectId, document_type: 'quality' } }
      );
    } catch (_) { /* non-critical */ }

    // Backfill any quality report_files that don't yet have Document records
    try {
      const qr = await QualityRecord.findOne({ where: { project_id: projectId } });
      if (qr && Array.isArray(qr.report_files) && qr.report_files.length > 0) {
        const existingInspection = await Document.findAll({
          where: { project_id: projectId, document_type: 'inspection_report' },
          attributes: ['file_name'],
        });
        const existingNames = new Set(existingInspection.map(d => d.file_name));

        for (const rf of qr.report_files) {
          if (!rf.name || existingNames.has(rf.name)) continue;
          try {
            const relativePath = path.relative(UPLOADS_ROOT, rf.path).replace(/\\/g, '/');
            await Document.create({
              project_id: projectId,
              module_type: 'project',
              reference_id: projectId,
              document_type: 'inspection_report',
              version: 1,
              file_path: relativePath,
              file_name: rf.name,
              size: 0,
              status: 'final',
              generated_by: null,
              generated_at: rf.uploaded_at ? new Date(rf.uploaded_at) : new Date(),
              company_id: backfillCompanyId,
            });
          } catch (_) { /* skip duplicates */ }
        }
      }
    } catch (_) { /* non-critical --- continue with normal query */ }

    // Backfill estimate drawing files that don't yet have Document records.
    // Delegate to estimateService._syncDrawingsToDocuments which understands both
    // R2-stored Part Master drawings (auto-attach by parts_master_id) and
    // legacy local-disk uploads. This ensures Part Master drawings appear in the
    // Documents tab even for estimates saved before the part had a drawing.
    try {
      const estimateService = require('./estimateService');
      const estimates = await Estimate.findAll({ where: { project_id: projectId } });
      for (const est of estimates) {
        const parts = Array.isArray(est.custom_parts) ? est.custom_parts : [];
        if (parts.length === 0) continue;
        const mutated = await estimateService._syncDrawingsToDocuments(projectId, parts);
        if (mutated) {
          try { await est.update({ custom_parts: parts }); } catch (_) { /* non-critical */ }
        }
      }
    } catch (_) { /* non-critical */ }

    // (Legacy) extra fs-based backfill — kept for any drawing_file_name entries
    // that point at locally-stored files that estimateService didn't resolve.
    try {
      const estimates = await Estimate.findAll({ where: { project_id: projectId } });
      const existingDrawings = await Document.findAll({
        where: { project_id: projectId, document_type: 'drawing' },
        attributes: ['id', 'file_name'],
      });
      const existingDrawingIds = new Set(existingDrawings.map(d => d.id));
      const existingDrawingNames = new Set(existingDrawings.map(d => d.file_name));

      for (const est of estimates) {
        const parts = est.custom_parts || [];
        for (const part of parts) {
          if (!part.drawing_file_name) continue;

          // Parse "filename|docId" format (new) vs plain "filename" (legacy)
          const entries = part.drawing_file_name.split(',').map(s => s.trim()).filter(Boolean);
          for (const entry of entries) {
            const pipeIdx = entry.indexOf('|');
            const pureName = pipeIdx >= 0 ? entry.substring(0, pipeIdx) : entry;
            const docId = pipeIdx >= 0 ? entry.substring(pipeIdx + 1) : null;

            // If docId references an existing document, this drawing is already synced
            if (docId && existingDrawingIds.has(docId)) continue;
            // If the pure filename already has a document record, skip
            if (existingDrawingNames.has(pureName)) continue;

            try {
              // Strategy 1: search uploads/documents for the file
              const docDir = path.join(UPLOADS_ROOT, 'documents');
              const docFiles = await fs.readdir(docDir).catch(() => []);
              const suffix = '-' + pureName;
              let match = docFiles.find(f => f.endsWith(suffix) || f === pureName);
              let matchPath = match ? path.join('documents', match) : null;

              // Strategy 2: search project-specific document directories
              if (!match) {
                const projectDocDir = path.join(UPLOADS_ROOT, 'documents', projectId);
                const projFiles = await fs.readdir(projectDocDir).catch(() => []);
                match = projFiles.find(f => f.endsWith(suffix) || f === pureName);
                matchPath = match ? path.join('documents', projectId, match) : null;
              }

              // Strategy 3: search all subdirectories of uploads/documents
              if (!match) {
                const topFiles = await fs.readdir(path.join(UPLOADS_ROOT, 'documents'), { withFileTypes: true }).catch(() => []);
                for (const ent of topFiles) {
                  if (!ent.isDirectory()) continue;
                  const subDir = path.join(UPLOADS_ROOT, 'documents', ent.name);
                  const subFiles = await fs.readdir(subDir).catch(() => []);
                  match = subFiles.find(f => f.endsWith(suffix) || f === pureName);
                  if (match) {
                    matchPath = path.join('documents', ent.name, match);
                    break;
                  }
                }
              }

              // Strategy 4: check part master drawing_url if part has parts_master_id
              if (!match && part.parts_master_id) {
                try {
                  const partsMasterRecord = await Part.findByPk(part.parts_master_id, { attributes: ['drawing_url'] });
                  if (partsMasterRecord && partsMasterRecord.drawing_url) {
                    const drawingPath = partsMasterRecord.drawing_url.replace(/^\/uploads\//, '');
                    const fsSync = require('fs');
                    if (fsSync.existsSync(path.join(UPLOADS_ROOT, drawingPath))) {
                      match = pureName;
                      matchPath = drawingPath;
                    }
                  }
                } catch (_) { /* part lookup failed */ }
              }

              if (match && matchPath) {
                const fsSync = require('fs');
                let fileSize = 0;
                try {
                  const stat = fsSync.statSync(path.join(UPLOADS_ROOT, matchPath));
                  fileSize = stat.size || 0;
                } catch (_) { /* ignore */ }

                await Document.create({
                  project_id: projectId,
                  module_type: 'project',
                  reference_id: projectId,
                  document_type: 'drawing',
                  version: 1,
                  file_path: matchPath,
                  file_name: pureName,
                  size: fileSize,
                  description: `Drawing: ${pureName}`,
                  status: 'final',
                  file_type: 'uploaded',
                  generated_by: null,
                  generated_at: new Date(),
                  company_id: backfillCompanyId,
                });
                existingDrawingNames.add(pureName);
              }
            } catch (_) { /* skip duplicates */ }
          }
        }
      }
    } catch (_) { /* non-critical */ }

    const documents = await fileManagerService.getProjectDocuments(projectId, filters);
    return documents;
  }

  async getDocumentById(id) {
    const document = await Document.findByPk(id, {
      include: [
        { model: Project, as: 'project' },
        { model: User, as: 'generatedBy', attributes: ['id', 'name'] }
      ]
    });
    if (!document) {
      throw new Error('Document not found');
    }
    return document;
  }

  async generateQuotation(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    if (!project.estimate || (Array.isArray(project.estimate) && project.estimate.length === 0)) {
      throw new Error('Cannot generate quotation without approved estimate');
    }

    // Resolve the active estimate (approved one preferred, or use selected_revision)
    const estimates = Array.isArray(project.estimate) ? project.estimate : [project.estimate];
    const activeEstimate = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    // Attach as single object for _buildQuotationPdf compatibility
    project.activeEstimate = activeEstimate;

    const quotationRef = project.quotation_number || activeEstimate.quotation_number;
    const { fileName, version } = await generateDocumentName({
      documentType: 'quotation',
      projectName: project.project_name,
      reference: quotationRef,
      projectId,
    });
    const folder = await fileManagerService.resolveFolder('quotation', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    const buffer = await this._buildQuotationPdf(project, companySettings);
    await this.savePdfDocument(filePath, buffer, { companyId: project.company_id, projectId });

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'quotation',
      version,
      file_path: filePath,
      file_name: fileName,
      size: buffer.length,
      status: 'draft',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });
    return document;
  }

  async generateWorkOrderDocument(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    if (!project.workOrder) {
      throw new Error('Cannot generate work order document without work order');
    }

    const { fileName, version } = await generateDocumentName({
      documentType: 'work_order',
      projectName: project.project_name,
      reference: project.workOrder.work_order_number,
      projectId,
    });
    const folder = await fileManagerService.resolveFolder('work_order', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    const buffer = await this._buildWorkOrderPdf(project, companySettings);
    await this.savePdfDocument(filePath, buffer, { companyId: project.company_id, projectId });

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'work_order',
      version,
      file_path: filePath,
      file_name: fileName,
      size: buffer.length,
      status: 'draft',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });
    return document;
  }

  async generateProductionTraveller(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    if (!project.workOrder) {
      throw new Error('Cannot generate production traveller without work order');
    }

    // Ensure production traveler number exists (lazy-generate for older work orders)
    let ptNumber = project.workOrder.production_traveler_number;
    if (!ptNumber) {
      const workOrderService = require('./workOrderService');
      ptNumber = await workOrderService.generatePtNumber(project.company_id || null);
      await project.workOrder.update({ production_traveler_number: ptNumber });
    }

    const { fileName, version } = await generateDocumentName({
      documentType: 'production_traveller',
      projectName: project.project_name,
      reference: ptNumber,
      projectId,
    });
    const folder = await fileManagerService.resolveFolder('production_traveller', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    const buffer = await this._buildProductionTravellerPdf(project, companySettings);
    await this.savePdfDocument(filePath, buffer, { companyId: project.company_id, projectId });

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'production_traveller',
      version,
      file_path: filePath,
      file_name: fileName,
      size: buffer.length,
      status: 'draft',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });
    return document;
  }

  async generateCoC(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    if (!project.qualityRecord || !project.qualityRecord.coc_generated) {
      throw new Error('Cannot generate CoC without completing quality inspection');
    }

    // Use heat number or batch reference for CoC
    const cocRef = project.heat_number || project.batch_number || project.workOrder?.work_order_number || project.project_name;
    const { fileName, version } = await generateDocumentName({
      documentType: 'coc',
      projectName: project.project_name,
      reference: cocRef,
      projectId,
    });
    const folder = await fileManagerService.resolveFolder('coc', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    // Auto-generate a unique COC serial number
    const serialNumber = await this._getNextCoCSerial(project.company_id);

    const buffer = await this._buildCoCPdf(project, companySettings, serialNumber);
    await this.savePdfDocument(filePath, buffer, { companyId: project.company_id, projectId });

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'coc',
      version,
      file_path: filePath,
      file_name: fileName,
      size: buffer.length,
      status: 'final',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });
    return document;
  }

  async generatePackingList(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);
    
    if (project.status !== 'inspected' && project.status !== 'shipped') {
      throw new Error('Cannot generate packing list until project is inspected');
    }

    const plRef = project.po_number || project.project_name;
    const { fileName, version } = await generateDocumentName({
      documentType: 'packing_list',
      projectName: project.project_name,
      reference: plRef,
      projectId,
      extension: '.html',
    });
    const folder = await fileManagerService.resolveFolder('packing_list', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    const content = this.generatePackingListHTML(project, companySettings);
    await this.saveDocument(filePath, content);

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'packing_list',
      version,
      file_path: filePath,
      file_name: fileName,
      status: 'draft',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });

    return document;
  }

  async generatePackingListPdf(projectId, userId) {
    const project = await this.getFullProjectData(projectId);
    const companySettings = await settingsService.getCompanySettings(project.company_id);
    
    if (project.status !== 'inspected' && project.status !== 'shipped') {
      throw new Error('Cannot generate packing list until project is inspected');
    }

    // Get sender details from the user who is generating the PDF
    const generatingUser = await User.findByPk(userId, { attributes: ['name', 'email', 'position'] });
    const senderUser = {
      name: generatingUser?.name || generatingUser?.email || '',
      email: generatingUser?.email || '',
      position: generatingUser?.position || '',
    };

    const buffer = await this._buildPackingListPdf(project, companySettings, senderUser);

    // Save the PDF as a Document record
    const plRef = project.po_number || project.project_name;
    const { fileName, version } = await generateDocumentName({
      documentType: 'packing_list',
      projectName: project.project_name,
      reference: plRef,
      projectId,
    });
    const folder = await fileManagerService.resolveFolder('packing_list', projectId);
    const filePath = folder ? fileManagerService.getFilePath(folder, fileName) : path.join('documents', projectId, fileName);

    await this.savePdfDocument(filePath, buffer, { companyId: project.company_id, projectId });

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: 'packing_list',
      version,
      file_path: filePath,
      file_name: fileName,
      size: buffer.length,
      status: 'draft',
      file_type: 'generated',
      generated_by: userId,
      company_id: project.company_id || null,
    });
    return document;
  }

  /**
   * Save an externally-generated PDF buffer as a Document record.
   * Called by section-tab controllers (estimates, work orders, quality).
   * Uses the standardized naming from documentNamingService.
   * Re-uses the existing document record for the same project + type if found,
   * so repeated downloads do not create duplicate rows.
   *
   * @param {string} projectId
   * @param {string} userId
   * @param {string} documentType - internal type (e.g. 'quotation', 'rfq')
   * @param {Buffer} buffer
   * @param {string} standardizedFilename - Pre-built filename from naming service
   */
  async saveGeneratedPdf(projectId, userId, documentType, buffer, standardizedFilename, partId = null) {
    // Delegate to UnifiedFileService — single pipeline for ALL files
    const { processGeneratedPdf } = require('./unifiedFileService');
    const fileName = standardizedFilename.endsWith('.pdf') ? standardizedFilename : `${standardizedFilename}.pdf`;

    // Fetch project company_id for tenant tagging
    const projectForTenant = await Project.findByPk(projectId, { attributes: ['id', 'company_id'] });

    const result = await processGeneratedPdf({
      buffer,
      fileName,
      project_id: projectId,
      part_id: partId || null,
      section: documentType,
      userId: userId || null,
      companyId: projectForTenant?.company_id || null,
      description: `Generated ${documentType} - ${fileName}`,
    });

    return result.document;
  }

  // ------ Save a Buffer as a binary file (PDF) ------------------------------------------------------------------------------------------------------
  async savePdfDocument(filePath, buffer, opts = {}) {
    const fullPath = path.join(UPLOADS_ROOT, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    // Sync to R2 cloud storage and return the R2 key
    const r2 = require('./r2StorageService');
    try {
      const r2Key = await r2.syncBufferToR2(buffer, filePath, {
        companyId: opts.companyId,
        projectId: opts.projectId,
        section: opts.section || 'generated',
      });
      return r2Key;
    } catch (err) {
      console.error('[R2] PDF sync failed:', err.message);
      return null;
    }
  }

  // ------ Regenerate a system-doc PDF buffer when the file is missing from disk ---
  async _regenerateSystemPdfBuffer(doc) {
    const REGENERABLE_TYPES = ['quotation', 'work_order', 'production_traveller', 'coc', 'packing_list', 'rfq', 'vendor_po'];
    if (!REGENERABLE_TYPES.includes(doc.document_type)) return null;

    let buffer;

    // RFQ and Vendor PO are generated via vendorProcurementService using their entity IDs
    if (doc.document_type === 'rfq') {
      try {
        const vendorProcurementService = require('./vendorProcurementService');
        // Find RFQ bundle by project_id; try to match by number extracted from file_name
        const rfqBundles = await RFQBundle.findAll({ where: { project_id: doc.project_id }, order: [['created_at', 'DESC']] });
        if (!rfqBundles.length) return null;
        let bundle = rfqBundles[0]; // default to most recent
        if (rfqBundles.length > 1 && doc.file_name) {
          // Extract RFQ number from file_name (e.g. "RFQ-00024_2026-03-21_v1.pdf" → "RFQ-00024")
          const m = doc.file_name.match(/^(RFQ-\d+)/i);
          if (m) {
            const match = rfqBundles.find(b => b.rfq_number === m[1]);
            if (match) bundle = match;
          }
        }
        const result = await vendorProcurementService.generateRFQBundlePdf(bundle.id);
        buffer = result.buffer;
      } catch (e) {
        console.warn('  --- RFQ regeneration failed:', e.message);
        return null;
      }
    } else if (doc.document_type === 'vendor_po') {
      try {
        const vendorProcurementService = require('./vendorProcurementService');
        // Find VPO by project_id; try to match by number extracted from file_name
        const vpos = await VendorPurchaseOrder.findAll({ where: { project_id: doc.project_id }, order: [['created_at', 'DESC']] });
        if (!vpos.length) return null;
        let vpo = vpos[0]; // default to most recent
        if (vpos.length > 1 && doc.file_name) {
          // Extract PO number from file_name (e.g. "PO-00015_2026-03-21_v1.pdf" or "VPO-00015_...")
          const m = doc.file_name.match(/^(?:V?PO-\d+)/i);
          if (m) {
            const match = vpos.find(v => v.po_number === m[0]);
            if (match) vpo = match;
          }
        }
        const result = await vendorProcurementService.generateVendorPOPdf(vpo.id);
        buffer = result.buffer;
      } catch (e) {
        console.warn('  --- Vendor PO regeneration failed:', e.message);
        return null;
      }
    } else if (doc.document_type === 'quotation') {
      // Use the same generator as the Quotation tab (estimateService)
      try {
        const estimateService = require('./estimateService');
        const project = await this.getFullProjectData(doc.project_id);
        const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
        const activeEstimate = pickBestEstimate(estimates, project.selected_revision)
          || estimates[estimates.length - 1];
        if (!activeEstimate) return null;
        const result = await estimateService.generateQuotationPdf(activeEstimate.id);
        buffer = result.buffer;
      } catch (e) {
        console.warn('  --- Quotation regeneration via estimateService failed:', e.message);
        return null;
      }
    } else {
      // Standard project-based regeneration
      const project = await this.getFullProjectData(doc.project_id);
      const companySettings = await settingsService.getCompanySettings(project.company_id);

      switch (doc.document_type) {
        case 'work_order':
          if (!project.workOrder) return null;
          buffer = await this._buildWorkOrderPdf(project, companySettings);
          break;
        case 'production_traveller':
          if (!project.workOrder) return null;
          buffer = await this._buildProductionTravellerPdf(project, companySettings);
          break;
        case 'coc': {
          if (!project.qualityRecord) return null;
          const serialNumber = await this._getNextCoCSerial(project.company_id);
          buffer = await this._buildCoCPdf(project, companySettings, serialNumber);
          break;
        }
        case 'packing_list': {
          // Get user info for Prepared By section (designation/position)
          let plSenderUser = {};
          if (doc.generated_by) {
            const plUser = await User.findByPk(doc.generated_by, { attributes: ['name', 'email', 'position'] });
            if (plUser) {
              plSenderUser = { name: plUser.name || plUser.email || '', email: plUser.email || '', position: plUser.position || '' };
            }
          }
          buffer = await this._buildPackingListPdf(project, companySettings, plSenderUser);
          break;
        }
        default:
          return null;
      }
    }

    // Persist regenerated file to disk so subsequent reads work
    if (buffer && doc.file_path) {
      try { await this.savePdfDocument(doc.file_path, buffer, { companyId: doc.company_id, projectId: doc.project_id }); } catch (_) { /* best effort */ }
    }
    return buffer;
  }

  // Public wrapper for regenerating system PDFs (used by controller for download fallback)
  async regenerateSystemPdfBuffer(doc) {
    return this._regenerateSystemPdfBuffer(doc);
  }

  // ------ Helper: load a PDF buffer into pdf-lib, returning srcPdf or null ---------------
  async _loadPdfBuffer(PDFDocument, fileBuffer, docName) {
    if (!fileBuffer || fileBuffer.length === 0) return null;

    // Trim any bytes before the %PDF header (BOM / extra bytes confuse pdf-lib)
    let buf = fileBuffer;
    const pdfOffset = fileBuffer.indexOf(Buffer.from('%PDF'));
    if (pdfOffset > 0) {
      console.warn(`mergePdfs: trimmed ${pdfOffset} leading bytes before %PDF in "${docName}"`);
      buf = fileBuffer.slice(pdfOffset);
    }
    if (pdfOffset === -1) {
      console.warn(`mergePdfs: buffer for "${docName}" does not contain %PDF header — not a PDF`);
      return null;
    }

    // Attempt 1: most lenient — throwOnInvalidObject:false + capNumbers covers PDFKit 0.14+ output
    try {
      return await PDFDocument.load(buf, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        capNumbers: true,
      });
    } catch (_) { /* fall through */ }

    // Attempt 2: also disable metadata update (works around certain PDFKit cross-ref quirks)
    try {
      return await PDFDocument.load(buf, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        updateMetadata: false,
        capNumbers: true,
      });
    } catch (_) { /* fall through */ }

    // Attempt 3: strip everything after last %%EOF and retry (truncated/appended files)
    try {
      const eofIdx = buf.lastIndexOf(Buffer.from('%%EOF'));
      if (eofIdx !== -1 && eofIdx < buf.length - 10) {
        const trimmed = buf.slice(0, eofIdx + 5);
        return await PDFDocument.load(trimmed, {
          ignoreEncryption: true,
          throwOnInvalidObject: false,
          capNumbers: true,
        });
      }
    } catch (_) { /* fall through */ }

    console.warn('mergePdfs: pdf-lib could not parse "' + docName + '" after all attempts');
    return null;
  }

  // ------ Merge PDFs server-side using pdf-lib ---------------------------------------------------------------------------------------------------------
  async mergePdfs(documentIds) {
    const { PDFDocument } = require('pdf-lib');
    const mergedPdf = await PDFDocument.create();
    let merged = 0;
    let totalPages = 0;
    const skipped = [];
    const errors = [];
    // Structured list of missing/skipped docs for the UI (id + clean name)
    const missingDocs = [];

    console.log('--------- mergePdfs START ---------');
    console.log('mergePdfs: UPLOADS_ROOT =', UPLOADS_ROOT);
    console.log('mergePdfs: received', documentIds.length, 'document IDs:', documentIds);

    // Helper: race a promise against a hard timeout
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`timed out after ${ms}ms${label ? ': ' + label : ''}`)), ms)
        ),
      ]);

    // Shared R2 listing cache for this merge \u2014 avoids repeated full-bucket scans
    const r2ListCache = new Map();

    // Fetch DB record + file buffer for a single document
    // First pass uses skipListing:true (fast); second pass enables listing for missing files only.
    const self = this;
    const fetchDocBuffer = async (id, { allowListing = false } = {}) => {
      let doc;
      try {
        doc = await Document.findByPk(id);
      } catch (e) {
        return { id, doc: null, fileBuffer: null, fetchError: `DB error: ${e.message}` };
      }
      if (!doc) return { id, doc: null, fileBuffer: null, fetchError: `Document ID ${id} not found` };
      if (!doc.file_path) return { id, doc, fileBuffer: null, fetchError: 'no file_path' };

      let fileBuffer = null;

      // Try disk / direct R2 key lookup
      try {
        const fullPath = await withTimeout(
          findDocFile(doc.file_path, doc.file_name, doc, { skipListing: !allowListing, r2ListCache }),
          allowListing ? 25000 : 12000,
          doc.file_name
        );
        try {
          fileBuffer = await fs.readFile(fullPath);
          console.log(`  [fetch] "${doc.file_name}" from disk (${fileBuffer.length} bytes)`);
        } catch (_) {
          if (_inMemoryCache.has(fullPath)) {
            fileBuffer = _inMemoryCache.get(fullPath);
            _inMemoryCache.delete(fullPath);
            console.log(`  [fetch] "${doc.file_name}" from in-memory cache (${fileBuffer.length} bytes)`);
          }
        }
      } catch (e) {
        console.warn(`  [fetch] file lookup failed for "${doc.file_name}": ${e.message}`);
      }

      // Fallback: on-the-fly regeneration for system-generated docs
      if (!fileBuffer) {
        try {
          fileBuffer = await withTimeout(
            self._regenerateSystemPdfBuffer(doc),
            20000,
            `regen:${doc.file_name}`
          );
          if (fileBuffer) {
            console.log(`  [fetch] "${doc.file_name}" regenerated (${fileBuffer.length} bytes)`);
            try {
              const savePath = path.join(UPLOADS_ROOT, doc.file_path);
              await fs.mkdir(path.dirname(savePath), { recursive: true });
              await fs.writeFile(savePath, fileBuffer);
            } catch (_) { /* best effort persist */ }
          }
        } catch (e) {
          console.warn(`  [fetch] regen failed for "${doc.file_name}": ${e.message}`);
        }
      }

      return { id, doc, fileBuffer, fetchError: null };
    };

    // ------ Phase 1: Fetch all file buffers in PARALLEL (fast, no R2 listing) -----------------
    console.log(`mergePdfs: fetching ${documentIds.length} files in parallel...`);
    const fetchResults = await Promise.allSettled(documentIds.map(id => fetchDocBuffer(id)));
    console.log('mergePdfs: phase 1 complete');

    // ------ Phase 1.5: Retry missing files with R2 listing enabled (covers uploaded files
    //                   stored under non-standard R2 keys, e.g. estimation drawings) ----------
    const missingIndices = [];
    for (let i = 0; i < fetchResults.length; i++) {
      const r = fetchResults[i];
      if (r.status === 'fulfilled' && r.value.doc && !r.value.fileBuffer) {
        missingIndices.push(i);
      }
    }
    if (missingIndices.length > 0) {
      console.log(`mergePdfs: retrying ${missingIndices.length} missing file(s) with R2 listing enabled...`);
      const retryResults = await Promise.allSettled(
        missingIndices.map(i => fetchDocBuffer(documentIds[i], { allowListing: true }))
      );
      retryResults.forEach((r, k) => {
        const origIdx = missingIndices[k];
        if (r.status === 'fulfilled' && r.value.fileBuffer) {
          fetchResults[origIdx] = r;
          console.log(`  [retry] recovered "${r.value.doc.file_name}" via listing`);
        }
      });
    }

    console.log('mergePdfs: assembling PDF...');

    // Helper to compute a clean display name (strips multer timestamp prefix)
    const cleanName = (doc) => {
      const raw = doc.file_name || path.basename(doc.file_path || '') || `Document ${doc.id}`;
      return raw.replace(/^\d{10,}-\d+-/, '');
    };

    // ------ Phase 2: Assemble PDF sequentially (document order must be preserved) ----------
    for (let idx = 0; idx < fetchResults.length; idx++) {
      const id = documentIds[idx];
      console.log(`mergePdfs: [${idx + 1}/${documentIds.length}] assembling ID ${id}`);

      if (fetchResults[idx].status === 'rejected') {
        const reason = fetchResults[idx].reason?.message || 'unknown error';
        console.warn(`  --- fetch error for ID ${id}:`, reason);
        errors.push(`Document ${id} (fetch error)`);
        missingDocs.push({ id, name: `Document ${id}`, reason: 'fetch error' });
        continue;
      }

      const { doc, fileBuffer, fetchError } = fetchResults[idx].value;

      if (fetchError || !doc) {
        console.warn(`  --- skipped ID ${id}: ${fetchError}`);
        errors.push(fetchError || `Document ${id} not found`);
        missingDocs.push({ id, name: doc ? cleanName(doc) : `Document ${id}`, reason: fetchError || 'not found' });
        continue;
      }

      console.log(`  doc: "${doc.file_name}" type=${doc.document_type} path=${doc.file_path}`);

      if (!doc.file_path) {
        const dn = cleanName(doc);
        skipped.push(`${dn} (no file path)`);
        missingDocs.push({ id, name: dn, reason: 'no file path' });
        continue;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        console.warn('  --- SKIPPED --- no file data available');
        const dn = cleanName(doc);
        skipped.push(`${dn} (file not found)`);
        missingDocs.push({ id, name: dn, reason: 'file not found' });
        continue;
      }

      // ------ Detect type and merge -------------------------------------------------------
      const ext = path.extname(doc.file_name || '').toLowerCase();
      const isPdf = (fileBuffer.length >= 4 && fileBuffer.slice(0, 4).toString() === '%PDF') || ext === '.pdf';
      const isJpeg = (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8) || ['.jpg', '.jpeg'].includes(ext);
      const isPng = (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4E && fileBuffer[3] === 0x47) || ext === '.png';

      if (isPdf) {
        let srcPdf = await this._loadPdfBuffer(PDFDocument, fileBuffer, doc.file_name);

        // If pdf-lib can't parse the on-disk file, try regenerating a fresh copy
        if (!srcPdf) {
          console.log('  --- pdf-lib parse failed, trying regeneration---');
          try {
            const freshBuffer = await this._regenerateSystemPdfBuffer(doc);
            if (freshBuffer) {
              srcPdf = await this._loadPdfBuffer(PDFDocument, freshBuffer, doc.file_name + ' (regen)');
            }
          } catch (regenErr) {
            console.warn('  --- regen for parse-fix failed:', regenErr.message);
          }
        }

        if (!srcPdf) {
          console.warn('  --- SKIPPED --- PDF could not be parsed');
          skipped.push(`${doc.file_name} (corrupt or unsupported PDF)`);
          continue;
        }

        const pageCount = srcPdf.getPageCount();
        if (pageCount > 0) {
          const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
          pages.forEach((page) => mergedPdf.addPage(page));
          merged++;
          totalPages += pageCount;
          console.log(`  --- MERGED PDF "${doc.file_name}" --- ${pageCount} page(s) appended (running total: ${totalPages} pages)`);
        } else {
          skipped.push(`${doc.file_name} (empty PDF)`);
        }
      } else if (isJpeg || isPng) {
        try {
          const embedFn = isPng ? 'embedPng' : 'embedJpg';
          const img = await mergedPdf[embedFn](fileBuffer);
          const dims = img.scaleToFit(595.28, 841.89);
          const page = mergedPdf.addPage([595.28, 841.89]);
          page.drawImage(img, {
            x: (595.28 - dims.width) / 2,
            y: (841.89 - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
          merged++;
          totalPages++;
          console.log(`  --- MERGED image "${doc.file_name}" --- 1 page appended (running total: ${totalPages} pages)`);
        } catch (e) {
          console.warn('  --- image embed failed:', e.message);
          skipped.push(`${doc.file_name} (failed to process image)`);
        }
      } else if (['.docx', '.doc'].includes(ext)) {
        // Convert Word document to PDF pages via mammoth text extraction
        try {
          const mammoth = require('mammoth');
          const { rgb, StandardFonts } = require('pdf-lib');
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          const text = (result.value || '').trim();
          if (!text) {
            skipped.push(`${doc.file_name} (empty document)`);
            continue;
          }
          const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
          const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
          const fontSize = 11;
          const lineHeight = fontSize * 1.35;
          const pageW = 595.28, pageH = 841.89;
          const margin = { top: 60, bottom: 50, left: 50, right: 50 };
          const usableW = pageW - margin.left - margin.right;

          // Word-wrap helper
          const wrapLine = (line, fnt, sz, maxW) => {
            if (!line) return [''];
            const words = line.split(/\s+/);
            const lines = [];
            let cur = '';
            for (const w of words) {
              const test = cur ? cur + ' ' + w : w;
              if (fnt.widthOfTextAtSize(test, sz) > maxW && cur) {
                lines.push(cur);
                cur = w;
              } else {
                cur = test;
              }
            }
            if (cur) lines.push(cur);
            return lines.length ? lines : [''];
          };

          // Split text into wrapped lines
          const rawLines = text.split(/\r?\n/);
          const wrappedLines = [];
          for (const rl of rawLines) {
            const wl = wrapLine(rl, font, fontSize, usableW);
            wrappedLines.push(...wl);
          }

          // Render onto pages
          let docPages = 0;
          let y = pageH - margin.top;
          let page = mergedPdf.addPage([pageW, pageH]);
          // Draw file name as header on first page
          page.drawText(doc.file_name, { x: margin.left, y, size: 13, font: boldFont, color: rgb(0.12, 0.12, 0.12) });
          y -= lineHeight * 1.8;

          for (const line of wrappedLines) {
            if (y < margin.bottom) {
              docPages++;
              page = mergedPdf.addPage([pageW, pageH]);
              y = pageH - margin.top;
            }
            page.drawText(line, { x: margin.left, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
            y -= lineHeight;
          }
          docPages++; // count last page
          merged++;
          totalPages += docPages;
          console.log(`  --- MERGED DOCX "${doc.file_name}" --- ${docPages} page(s) appended (running total: ${totalPages} pages)`);
        } catch (e) {
          console.warn('  --- docx processing failed:', e.message);
          skipped.push(`${doc.file_name} (failed to process Word document)`);
        }
      } else {
        console.warn(`  --- SKIPPED --- unsupported format: ${ext || 'unknown'}`);
        skipped.push(`${doc.file_name} (unsupported format: ${ext || 'unknown'})`);
      }
    }

    // Deduplicate skipped list — same physical file may be referenced by multiple DB records
    const uniqueSkipped = [...new Set(skipped)];

    console.log('--------- mergePdfs SUMMARY ---------');
    console.log(`  Selected: ${documentIds.length} | Merged: ${merged} | Skipped: ${uniqueSkipped.length} | Errors: ${errors.length}`);
    console.log(`  Total pages in merged PDF: ${totalPages}`);
    if (uniqueSkipped.length > 0) console.log('  Skipped:', uniqueSkipped);
    if (errors.length > 0) console.log('  Errors:', errors);

    if (merged === 0) {
      const details = [...uniqueSkipped, ...errors];
      const msg = details.length
        ? `None of the selected documents could be merged.\nSkipped: ${details.join(', ')}`
        : 'No documents could be merged.';
      throw new Error(msg);
    }

    const mergedBytes = await mergedPdf.save();
    console.log(`  Output size: ${mergedBytes.length} bytes`);
    console.log('--------- mergePdfs END ---------');
    // Deduplicate missingDocs by id (same doc may appear via skipped + errors paths)
    const seen = new Set();
    const uniqueMissing = missingDocs.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    return { buffer: Buffer.from(mergedBytes), merged, skipped: uniqueSkipped, totalPages, missingDocs: uniqueMissing };
  }

  // ------ pdfkit helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  _pdfHeader(doc, title, companySettings) {
    const margin = 50;
    const pageW = doc.page.width;
    const cW = pageW - 2 * margin;
    let y = margin;
    const headerStartY = y;
    const LOGO_BOX_W = 280;
    const LOGO_BOX_H = 90;

    // Logo: prefer base64 data (DB, always company-specific) > file path
    let logoRendered = false;
    if (companySettings.logo_data) {
      try {
        const b64Match = companySettings.logo_data.match(/^data:[^;]+;base64,(.+)$/);
        if (b64Match) {
          doc.image(Buffer.from(b64Match[1], 'base64'), margin, y, {
            fit: [LOGO_BOX_W, LOGO_BOX_H], align: 'left', valign: 'center',
          });
          logoRendered = true;
        }
      } catch (e) { /* base64 logo unreadable — try file fallback */ }
    }
    if (!logoRendered) {
      const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);
      if (logoAbsPath) {
        try {
          doc.image(logoAbsPath, margin, y, { fit: [LOGO_BOX_W, LOGO_BOX_H], align: 'left', valign: 'center' });
          logoRendered = true;
        } catch (e) { /* logo file unreadable — skip */ }
      }
    }

    const infoX = margin + LOGO_BOX_W + 10;
    const infoW = cW - LOGO_BOX_W - 10;
    const infoLineH = 13;
    const addrLines = (companySettings.address || '').split(/\n/).filter(Boolean);
    const telFax = [
      companySettings.phone ? `Tel: ${companySettings.phone}` : null,
      companySettings.fax   ? `Fax: ${companySettings.fax}` : companySettings.tax_id ? `Fax: ${companySettings.tax_id}` : null,
    ].filter(Boolean).join(' | ');
    const infoLineCount = 1 + addrLines.length + (telFax ? 1 : 0) + (companySettings.website ? 1 : 0);
    const infoBlockH = 20 + (infoLineCount - 1) * infoLineH;
    let iy = headerStartY + Math.max(0, (LOGO_BOX_H - infoBlockH) / 2);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(companySettings.name || '', infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += 20;
    doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a');
    addrLines.forEach(line => {
      doc.text(line.trim(), infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    });
    if (telFax) {
      doc.text(telFax, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    }
    if (companySettings.website) {
      doc.text(companySettings.website, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    }

    y = Math.max(headerStartY + LOGO_BOX_H, iy) + 11;
    doc.lineWidth(1.5).moveTo(margin, y).lineTo(margin + cW, y).strokeColor('#000000').stroke();
    y += 17;
    doc.fillColor('#000000');
    doc.y = y;
  }

  _pdfKv(doc, label, value, opts = {}) {
    const x = opts.x || 50;
    const w = opts.w || 220;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#546e7a')
       .text(label, x, doc.y, { continued: true, width: w });
    doc.font('Helvetica').fillColor('#1a1a1a')
       .text(value || 'N/A', { width: w });
  }

  _pdfSectionTitle(doc, title) {
    doc.moveDown(0.5);
    doc.rect(50, doc.y, doc.page.width - 100, 18).fill(COLORS.TABLE_HEAD);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF')
       .text(title, 55, doc.y + 4, { width: doc.page.width - 110 });
    doc.moveDown(0.8);
  }

  _pdfCheckRow(doc, label, checked) {
    const mark = checked ? '\u2714' : '\u25A1';
    const color = checked ? '#2ecc71' : '#999';
    doc.fontSize(9).font('Helvetica').fillColor(color)
       .text(mark + '  ' + label, 60, doc.y, { width: 300 });
    doc.moveDown(0.3);
  }

  _buildQuotationPdf(project, companySettings) {
    return new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M        = 40;           // margin
      const pageW    = doc.page.width;   // 595
      const pageH    = doc.page.height;  // 842
      const cW       = pageW - 2 * M;   // 515
      const FOOTER_H = 22;
      let y = M;

      // ------ helpers ------------------------------------------------------------------------------------------------------------------------------------------------
      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - 8) { doc.addPage(); y = M; }
      };

      const logoPath = settingsService.getLogoAbsolutePath(companySettings.logo);

      const drawHRule = (lw = 0.5, col = '#CCCCCC') =>
        doc.lineWidth(lw).moveTo(M, y).lineTo(M + cW, y).strokeColor(col).stroke();

      const drawVDiv = (x, y1, y2, lw = 0.4, col = '#BBBBBB') =>
        doc.lineWidth(lw).moveTo(x, y1).lineTo(x, y2).strokeColor(col).stroke();

      // Section banner (dark gray header bar)
      const drawBanner = (text) => {
        checkPage(20);
        doc.rect(M, y, cW, 16).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.3).rect(M, y, cW, 16).strokeColor(COLORS.BORDER).stroke();
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
           .text(text, M + 6, y + 4, { width: cW - 12, lineBreak: false });
        y += 16;
      };

      // Table header row
      const drawTblHdr = (cols, hdrs, aligns) => {
        const H = 16;
        doc.rect(M, y, cW, H).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.3).rect(M, y, cW, H).strokeColor(COLORS.BORDER).stroke();
        let hx = M;
        hdrs.forEach((h, i) => {
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
             .text(h, hx + 3, y + 4, { width: cols[i] - 6, align: aligns?.[i] || 'left', lineBreak: false });
          if (i < hdrs.length - 1)
            drawVDiv(hx + cols[i], y, y + H, 0.3, COLORS.BORDER_MED);
          hx += cols[i];
        });
        y += H;
      };

      // Data row
      const drawRow = (cols, cells, rowH, bg, aligns, descColIdx = -1) => {
        checkPage(rowH);
        // Use white or light gray for rows
        const rowBg = bg || COLORS.ROW_WHITE;
        doc.rect(M, y, cW, rowH).fill(rowBg);
        doc.lineWidth(0.3).rect(M, y, cW, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
        let rx = M;
        cells.forEach((cell, i) => {
          const txt  = typeof cell === 'object' ? (cell.text || '') : String(cell ?? '');
          const fnt  = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
          const aln  = aligns?.[i] || (typeof cell === 'object' && cell.align) || 'left';
          if (i === descColIdx && txt.includes('\n')) {
            // Quotation-style two-part rendering: description + drawing/part number
            const parts = txt.split('\n');
            const descW = cols[i] - 12;
            doc.fontSize(8.5).font(fnt).fillColor(COLORS.TEXT_DARK);
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.text(parts[0], rx + 6, y + 4, { width: descW, lineBreak: true });
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
            doc.text(parts.slice(1).join('\n'), rx + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
          } else {
            doc.fontSize(7.5).font(fnt).fillColor(COLORS.TEXT_DARK)
               .text(txt, rx + 3, y + 3, { width: cols[i] - 6, align: aln, lineBreak: true, height: rowH - 6 });
          }
          if (i < cells.length - 1)
            drawVDiv(rx + cols[i], y, y + rowH, 0.3, COLORS.BORDER_LIGHT);
          rx += cols[i];
        });
        y += rowH;
      };

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  HEADER
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      y = drawGlobalHeader(doc, companySettings, 'Quotation');

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  TO  /  PREPARED BY --- two-column box
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      const halfW   = Math.floor(cW / 2);
      const client  = project.client   || {};
      const prepBy  = project.preparedBy || {};
      const lH = 10.5;
      const _tiTextW = halfW - 8;

      // Measure address heights for dynamic box sizing
      doc.fontSize(8).font('Helvetica');
      const _clientAddrH = client.address ? Math.max(doc.heightOfString(client.address, { width: _tiTextW }) + 4, lH) : lH;
      const _companyAddrH = companySettings.address ? Math.max(doc.heightOfString(companySettings.address, { width: _tiTextW }) + 4, lH) : lH;
      const _tiAddrRowH = Math.max(_clientAddrH, _companyAddrH);

      // Calculate dynamic TO_H based on content
      const _clientLineCount = 1 + (client.address ? 1 : 0) + 1 + 1 + (client.poc_phone ? 1 : 0);
      const _companyLineCount = 1 + 1 + (prepBy.email ? 1 : 0) + (prepBy.phone ? 1 : 0) + (companySettings.address ? 1 : 0);
      const TO_H = 16 + 13 + _tiAddrRowH + lH * (Math.max(_clientLineCount, _companyLineCount) - 2) + 6;

      doc.lineWidth(0.8).rect(M, y, cW, TO_H).strokeColor('#000000').stroke();
      drawVDiv(M + halfW, y, y + TO_H, 0.6, '#000000');

      // Sub-headers
      ['To', 'Prepared By'].forEach((lbl, side) => {
        const bx = M + side * halfW;
        doc.rect(bx, y, halfW, 13).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.3).rect(bx, y, halfW, 13).strokeColor(COLORS.BORDER).stroke();
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
           .text(lbl, bx + 5, y + 3, { width: halfW - 10, lineBreak: false });
      });

      // "To" content
      let toY = y + 16;
      doc.fontSize(8).font('Helvetica').fillColor('#000000');
      doc.text(client.client_name || '{Company Name}', M + 4, toY, { width: _tiTextW, lineBreak: true }); toY += lH;
      if (client.address)
        { doc.text(client.address, M + 4, toY, { width: _tiTextW, lineBreak: true }); toY += _tiAddrRowH; }
      doc.text(`POC: ${client.poc_name || '-'}${client.position ? ' | ' + client.position : ''}`,         M + 4, toY, { width: _tiTextW, lineBreak: true }); toY += lH;
      doc.text(`Email: ${client.poc_email || '-'}`,       M + 4, toY, { width: _tiTextW, lineBreak: true }); toY += lH;
      if (client.poc_phone)
        doc.text(`Phone: ${client.poc_phone}`,            M + 4, toY, { width: _tiTextW, lineBreak: false });

      // "Prepared By" content
      const pbX = M + halfW + 4;
      const pbW = halfW - 8;
      let pbY = y + 16;
      doc.text(companySettings.name || '', pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH;
      doc.font('Helvetica-Bold').text(`POC: ${prepBy.name || '-'}${prepBy.position ? ' | ' + prepBy.position : ''}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.TEXT_DARK);
      if (prepBy.email)
        { doc.text(`Email: ${prepBy.email}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH; }
      if (prepBy.phone)
        { doc.text(`Phone: ${prepBy.phone}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH; }
      if (companySettings.address)
        { doc.text(companySettings.address, pbX, pbY, { width: pbW, lineBreak: true }); }
      y += TO_H;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  QUOTATION INFO ROW --- 3 equal columns
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      const PROP_H = 24;
      const propCW = Math.floor(cW / 3);
      doc.lineWidth(0.8).rect(M, y, cW, PROP_H).strokeColor('#000000').stroke();
      [1, 2].forEach(i => drawVDiv(M + propCW * i, y, y + PROP_H, 0.5, '#000000'));

      const qNum      = project.quotation_number || `TPS/${(project.project_name || 'PROJ').replace(/\s+/g, '_').slice(0, 12)}`;
      const qDate     = dayjs().format('DD/MM/YYYY');
      const validThru = dayjs().add(30, 'day').format('DD/MM/YYYY');

      [
        { label: 'Quotation No:',   value: qNum },
        { label: 'Quotation Date:', value: qDate },
        { label: 'Valid Thru:',    value: `${validThru} (30 days from abv. date)` },
      ].forEach(({ label, value }, i) => {
        const px = M + propCW * i + 5;
        const pw = propCW - 10;
        doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
           .text(label + ' ', px, y + 4, { continued: true, width: pw });
        doc.font('Helvetica').fillColor(COLORS.TEXT_DARK).text(value);
      });
      y += PROP_H;

      // Project / Revision strip
      const PJ_H = 14;
      doc.rect(M, y, cW, PJ_H).fill(COLORS.GT_BG);
      doc.lineWidth(0.4).rect(M, y, cW, PJ_H).strokeColor(COLORS.BORDER_LIGHT).stroke();
      // Resolve the active estimate for this PDF (approved > selected > last)
      const _estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
      const _activeEst = pickBestEstimate(_estimates, project.selected_revision) || _estimates[_estimates.length - 1];
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text(
           `Project : ${project.project_name || '-'}   |   Revision: R${_activeEst?.revision ?? 0}   |   ${project.client?.client_name || ''}`,
           M + 5, y + 3, { width: cW - 10, lineBreak: true }
         );
      y += PJ_H + 8;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SECTION 1 --- SUMMARY
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawBanner('1. Summary');

      // Detect bulk order variable pricing from custom parts
      const _customPartsData = Array.isArray(_activeEst?.custom_parts) ? _activeEst.custom_parts : [];
      const _hasBulkPricing = _customPartsData.some(p =>
        p.bulk_order_variable_price && Array.isArray(p.pricing_tiers) && p.pricing_tiers.length > 0
      );

      if (_hasBulkPricing) {
        // ── BULK MODE: S.No | Description | Quantity | Price/EA | Total Price ──
        const B_COLS = [30, 0, 65, 82, 105];
        B_COLS[1] = cW - B_COLS[0] - B_COLS[2] - B_COLS[3] - B_COLS[4];
        drawTblHdr(B_COLS, ['S.No', 'Description', 'Quantity', 'Price/EA', 'Total Price'],
                           ['center', 'left', 'right', 'right', 'right']);

        let bRowNum = 0;
        let bGlobalIdx = 0;

        // Helper: build description + drawing display for a custom part
        const _buildPartDesc = (part) => {
          const { description, drawingDisplay } = buildDescription({
            job_description: part.job_description || '',
            part_name: part.part_name || '',
            material: part.material || part.material_category || '',
            material_grade: part.material_grade || '',
            condition: part.condition || '',
            drawing_part_no: part.drawing_part_no || '',
            drawing_revision: part.drawing_revision || '',
          });
          return { description, drawingDisplay };
        };

        // Helper: measure dynamic row height for description text
        const _measureDescH = (desc, drawDisp, descW) => {
          let rowH = 20;
          if (drawDisp && desc) {
            doc.fontSize(8.5).font('Helvetica');
            const dH = doc.heightOfString(desc, { width: descW });
            doc.fontSize(7).font('Helvetica');
            const ddH = doc.heightOfString(drawDisp, { width: descW });
            rowH = Math.max(32, dH + ddH + 10);
          } else if (desc) {
            doc.fontSize(8.5).font('Helvetica');
            const dH = doc.heightOfString(desc, { width: descW });
            rowH = Math.max(20, dH + 8);
          }
          return rowH;
        };

        // Render custom parts
        _customPartsData.forEach((part) => {
          bRowNum++;
          const { description: partDesc, drawingDisplay: partDraw } = _buildPartDesc(part);
          const descW = B_COLS[1] - 12;

          if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
            // Bulk part: one row per tier, description in first tier only
            part.pricing_tiers.forEach((tier, tIdx) => {
              const qty = Number(tier.quantity || 1);
              const unitPrice = Number(tier.unit_price || 0);
              const totalPrice = qty * unitPrice;

              const isFirst = tIdx === 0;
              const descText = isFirst ? (partDraw ? `${partDesc}\n${partDraw}` : partDesc) : '';
              const rowH = isFirst ? _measureDescH(partDesc, partDraw, descW) : 20;
              const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

              drawRow(B_COLS,
                [isFirst ? String(bRowNum) : '', descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalPrice.toFixed(2)}`],
                rowH, bg,
                ['center', 'left', 'right', 'right', 'right'], isFirst ? 1 : -1);
              bGlobalIdx++;
            });
          } else {
            // Non-bulk part rendered in bulk column layout
            const qty = Number(part.quantity || 1);
            const rawUP = Number(part.job_cost_per_unit || 0);
            const total = Number(part.total_cost) || (qty * rawUP);
            const unitPrice = rawUP || (qty > 0 ? total / qty : total);
            const totalPrice = qty * unitPrice;
            const descText = partDraw ? `${partDesc}\n${partDraw}` : partDesc;
            const rowH = _measureDescH(partDesc, partDraw, descW);
            const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

            drawRow(B_COLS,
              [String(bRowNum), descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalPrice.toFixed(2)}`],
              rowH, bg,
              ['center', 'left', 'right', 'right', 'right'], 1);
            bGlobalIdx++;
          }
        });

        // Render process modules in bulk column layout
        const _procModules = Array.isArray(_activeEst?.items) ? _activeEst.items : [];
        const _sortedModules = [..._procModules].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
        _sortedModules.forEach((item) => {
          bRowNum++;
          const inp = item.input_json || {};
          const qty = Number(inp.quantity) || 0;
          const totalCost = Number(item.total_cost) || 0;
          const unitPrice = qty > 0 ? totalCost / qty : totalCost;
          const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const desc = inp.job_name || inp.description || moduleLabel;
          const descText = desc ? `${moduleLabel} - ${desc}` : moduleLabel;

          const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
          drawRow(B_COLS,
            [String(bRowNum), descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalCost.toFixed(2)}`],
            20, bg,
            ['center', 'left', 'right', 'right', 'right'], -1);
          bGlobalIdx++;
        });

        if (_customPartsData.length === 0 && _sortedModules.length === 0) {
          drawRow(B_COLS, ['', 'No items', '', '', ''],
            20, COLORS.ROW_ALT, ['center', 'center', 'center', 'center', 'center']);
        }

        // NO Grand Total, subtotal, or tax summary in bulk mode
        y += 12;

      } else {
        // ── NORMAL MODE: # | Description | Unit Price | Quantity | Total Price ──
        const S_COLS = [30, 0, 90, 60, 90];
        S_COLS[1] = cW - S_COLS.reduce((a, b) => a + b);
        drawTblHdr(S_COLS, ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'],
                           ['center', 'left', 'center', 'center', 'center']);

        const summaryLineItems = buildStandardizedLineItems(_activeEst);
        let grandTotal = 0;

        summaryLineItems.forEach((item, idx) => {
          const qty   = item.quantity;
          const price = item.unit_price;
          const total = item.line_total;
          grandTotal += total;
          const descWithDrawing = item.drawingDisplay
            ? `${item.description}\n${item.drawingDisplay}`
            : item.description;
          const descW = S_COLS[1] - 12;
          let rowHeight = 20;
          if (item.drawingDisplay && item.description) {
            doc.fontSize(8.5).font('Helvetica');
            const _descH = doc.heightOfString(item.description, { width: descW });
            doc.fontSize(7).font('Helvetica');
            const _drawH = doc.heightOfString(item.drawingDisplay, { width: descW });
            rowHeight = Math.max(32, _descH + _drawH + 10);
          } else if (item.description) {
            doc.fontSize(8.5).font('Helvetica');
            const _descH = doc.heightOfString(item.description, { width: descW });
            rowHeight = Math.max(20, _descH + 8);
          }
          drawRow(S_COLS,
            [String(idx + 1), descWithDrawing, `$ ${price.toFixed(2)}`, String(qty), `$ ${total.toFixed(2)}`],
            rowHeight, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
            ['center', 'left', 'center', 'center', 'center'], 1);
        });

        if (summaryLineItems.length === 0) {
          drawRow(S_COLS, ['', 'No items', '', '', ''],
            20, COLORS.ROW_ALT, ['center', 'center', 'center', 'center', 'center']);
        }

        // Grand total row
        const GT_H = 18;
        checkPage(GT_H);
        doc.rect(M, y, cW, GT_H).fill(COLORS.GT_BG);
        doc.lineWidth(0.4).rect(M, y, cW, GT_H).strokeColor(COLORS.GT_BORDER).stroke();
        const gtLW = S_COLS[0] + S_COLS[1] + S_COLS[2] + S_COLS[3];
        drawVDiv(M + gtLW, y, y + GT_H, 0.4, COLORS.GT_BORDER);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
          .text('Grand Total', M + 4, y + 5, { width: gtLW - 8, align: 'right', lineBreak: false });
        doc.text(`$ ${grandTotal.toFixed(2)}`, M + gtLW + 4, y + 5,
              { width: S_COLS[4] - 8, align: 'center', lineBreak: false });
        y += GT_H + 12;
      }

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SECTION 2 --- BILL OF MATERIALS  (Custom Parts + Process Modules combined)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      let docSectionNum = 2;
      checkPage(50);
      drawBanner(`${docSectionNum}.  Bill of Materials:`);
      docSectionNum++;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('Consider this Bill of material to give input:', M + 2, y + 1);
      y = doc.y + 4;

      // ------ 3a: Custom Parts ------------------------------------------------------------------------------------------
      const customParts = Array.isArray(_activeEst?.custom_parts) ? _activeEst.custom_parts : [];
      if (customParts.length > 0) {
        checkPage(36);
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
            .text('Custom Parts:', M + 2, y, { lineBreak: false });
        y += 13;

        const CP = [22, 0, 58, 38, 26, 52, 36, 64];
        CP[1] = cW - CP.reduce((a, b) => a + b);
        drawTblHdr(CP,
          ['#', 'Job Description', 'Material', 'Grade', 'Qty', 'Drg Part No', 'Heat #', 'RM Dimension'],
          ['center', 'left', 'left', 'center', 'center', 'center', 'center', 'center']);

        customParts.forEach((p, idx) => {
          drawRow(CP, [
            String(idx + 1),
            p.job_description || '-',
            p.material        || '-',
            p.material_grade  || '-',
            String(p.quantity || '-'),
            (p.drawing_part_no || '-') + (p.drawing_revision ? ' - ' + p.drawing_revision : ''),
            p.heat_number              || '-',
            p.raw_material_dimension   || '-',
          ], 18, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
          ['center', 'left', 'left', 'center', 'center', 'center', 'center', 'center']);
        });
        y += 5;
      }

      // ------ 3b: Process Modules ---------------------------------------------------------------------------------
      const procItems = _activeEst?.items || [];
      if (procItems.length > 0) {
        checkPage(36);
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
            .text('Process Modules:', M + 2, y, { lineBreak: false });
        y += 13;

        const modLabel = (t) => ({
          cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', laser_cutting: 'Laser Cutting',
          fabrication_welding: 'Fabrication & Welding', welding: 'Welding',
          heat_treatment: 'Heat Treatment', grinding: 'Grinding', drilling: 'Drilling',
          boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
          assembly: 'Assembly', testing: 'Testing / Inspection', other: 'Other',
        }[t] || t || '-');

        const PM = [22, 0, 90];
        PM[1] = cW - PM.reduce((a, b) => a + b);
        drawTblHdr(PM, ['#', 'Process', 'Cost (INR)'], ['center', 'left', 'right']);

        let pmTotal = 0;
        procItems.forEach((item, idx) => {
          const cost = Number(item.output_json?.total_cost || item.output_json?.total_job_cost || 0);
          pmTotal += cost;
          drawRow(PM,
            [String(idx + 1), modLabel(item.module_type), cost.toFixed(2)],
            18, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
            ['center', 'left', 'right']);
        });

        // Process total row
        const PTH = 18;
        checkPage(PTH);
        doc.rect(M, y, cW, PTH).fill(COLORS.GT_BG);
        doc.lineWidth(0.3).rect(M, y, cW, PTH).strokeColor(COLORS.GT_BORDER).stroke();
        const ptLW = PM[0] + PM[1];
        drawVDiv(M + ptLW, y, y + PTH, 0.3, COLORS.GT_BORDER);
          doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
            .text('Total Process Cost', M + 4, y + 5, { width: ptLW - 8, align: 'right', lineBreak: false });
          doc.text(`$ ${pmTotal.toFixed(2)}`, M + ptLW + 4, y + 5,
                { width: PM[2] - 8, align: 'right', lineBreak: false });
        y += PTH + 6;
      }

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  PROJECT SCHEDULE & COMMERCIAL NOTES (only if user entered content)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      const _quotation = _activeEst?.quotation || {};
      const _quotationNotes = (_quotation.notes || '').trim();
      if (_quotationNotes) {
        checkPage(50);
        drawBanner(`${docSectionNum}. Project Schedule & Commercial Notes`);
        docSectionNum++;
        y += 6;
        const noteLines = _quotationNotes.split('\n').filter(l => l.trim());
        noteLines.forEach(n => {
          const trimmed = n.trim();
          const poMatch = trimmed.match(/^Purchase Orders to be sent to:\s*(.*)$/i);
          if (poMatch) {
            doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
               .text('Purchase Orders to be sent to:  ', M + 10, y, { continued: true, width: cW - 20 });
            doc.font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK).text(poMatch[1] || '', { continued: false });
          } else {
            doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
               .text('\u2022  ' + trimmed, M + 10, y, { width: cW - 20 });
          }
          y = doc.y + 6;
        });
        y += 6;
      }

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  TERMS AND CONDITIONS  (2-column layout, only if include_terms is enabled)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      const _includeTerms = _quotation.include_terms === true;
      if (_includeTerms) {
      checkPage(50);
      y += 2;
      drawBanner(`${docSectionNum}.  Terms And Conditions of Sale:`);
      docSectionNum++;
      y += 3;

      const tcSections = [
        { t: '1. ACCEPTANCE OF DOCUMENT.', b: 'This contract is between company ("Seller") and client ("Buyer") for a specific order. These Terms and Conditions form the basis for all transactions between the parties. Any amendments require mutual written consent and are only binding when acknowledged by both parties.' },
        { t: '2. DELIVERY/RISK OF LOSS', b: 'Products are delivered FCA Seller\'s factory unless stated otherwise in the purchase order. Buyer is solely responsible for freight from Seller\'s factory unless agreed otherwise in writing. Seller can charge freight for any re-shipment required due to buyer\'s actions.' },
        { t: '3. INSPECTION', b: 'Buyer can specifically request a factory test if stated in purchase order. Buyer must notify Seller within three (3) days prior if the order arrives with visible defects. Items returned after the agreed time window may be treated as accepted.' },
        { t: '4. PRODUCTS RETURNS', b: 'Seller may at its own discretion authorize product returns with a 15% restocking fee plus shipping. Custom orders are non-returnable. For goods accepted for return, Buyer must pre-pay return shipping and notify Seller within 30 days of delivery.' },
        { t: '5. CUSTOM PRODUCTS', b: 'Prices for custom products are based on current cost structures. Buyer may not seek substitutions once the order is placed. Any design changes requested after order confirmation will be subject to additional charges and may delay delivery.' },
        { t: '6. SERVICES', b: 'Any claims or inaccuracies in services must be reported to Seller in writing. Buyer expressly acknowledges it has not relied on any representations not contained in this contract. Seller reserves the right to decline service requests outside the original scope.' },
        { t: '7. WARRANTY', b: 'Seller warrants goods against defects in material and workmanship for a period of one (1) year from date of shipment. This warranty does not cover damage due to misuse, modification, improper installation, or normal wear and tear.' },
        { t: '8. CONSEQUENTIAL DAMAGES', b: 'Seller shall not be liable for any indirect, incidental, special, or consequential damages, including loss of profits or business interruption, even if Seller has been advised of the possibility of such damages.' },
        { t: '9. LIMITATION OF LIABILITY', b: 'Seller\'s total liability for any claim shall not exceed the purchase price of the goods that gave rise to the claim. Buyer acknowledges this limitation is a fundamental element of the basis of the bargain between the parties.' },
        { t: '10. DAYS, DAMAGES & LOSS', b: 'Seller is not responsible for delivery delays caused by circumstances beyond its control including force majeure, supply chain disruptions, or acts of government. Risk of loss transfers to Buyer upon delivery to the carrier.' },
        { t: '11. INDEMNITY', b: 'Buyer agrees to indemnify, defend, and hold harmless Seller from any claims, damages, costs, and expenses arising from Buyer\'s use of the goods, breach of this contract, or violation of any applicable law.' },
        { t: '12. SALES AND TAXES', b: 'Unless otherwise stated, all prices are exclusive of applicable taxes, duties, and levies. Buyer is responsible for all taxes applicable to the purchase including GST, VAT, or any equivalent tax.' },
        { t: '13. PAYMENT TERMS', b: 'Orders $0-$5,000: 100% payment due upon order placement. Orders $500-$300,000: 50% deposit upon order, 50% payment due 30 days from invoice. Orders over $300,000: 10% deposit, 40% payment at production start, 50% due 30 days from invoice.' },
        { t: '14. CREDIT HOLD, C.O.D., AND PURCHASES', b: 'Seller may place an account on credit hold at any time. Upon credit hold, all outstanding invoices become immediately due. Continued purchases will be on a C.O.D. basis until credit is restored.' },
        { t: '15. SUBSEQUENT PAYMENTS', b: 'A service charge of 1.5% per month (18% annually) will be imposed on any unpaid overdue invoice. In the event that a purchase exceeds the amount flowingly up on rising level, their amounts will be reduced on minimum amounts. Buyer may not withhold payment due to unresolved disputes without Seller\'s written consent.' },
        { t: '16. TITLE', b: 'Title to goods shall remain with Seller until full payment has been received. Seller retains a security interest in all goods delivered until payment in full. Buyer grants Seller the right to repossess goods if payment is not received.' },
        { t: '17. SECURITY INTEREST', b: 'Buyer hereby grants Seller a security interest in the goods to secure payment. Seller may file a UCC financing statement or equivalent instrument to perfect this interest. Buyer agrees to cooperate with any filings required.' },
        { t: '18. ATTORNEYS FEES', b: 'If any legal action is required to enforce this contract, the prevailing party shall be entitled to recover reasonable attorneys fees, court costs, and all related expenses from the non-prevailing party.' },
      ];

      // 2-column T&C layout
      const TC_GAP  = 6;
      const TC_CW   = (cW - TC_GAP) / 2;
      const tc_lx   = M;
      const tc_rx   = M + TC_CW + TC_GAP;
      let   lColY   = y;
      let   rColY   = y;

      tcSections.forEach((sec, idx) => {
        const isLeft = idx % 2 === 0;
        const tcX    = isLeft ? tc_lx : tc_rx;
        let   tcY    = isLeft ? lColY : rColY;

        // New page if current column is near bottom
        if (tcY + 40 > pageH - FOOTER_H - 10) {
          doc.addPage();
          lColY = M;
          rColY = M;
          tcY   = M;
        }

        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
           .text(sec.t, tcX + 2, tcY, { width: TC_CW - 4 });
        tcY = doc.y + 1;
        doc.fontSize(7.5).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(sec.b, tcX + 4, tcY, { width: TC_CW - 8, align: 'justify' });
        tcY = doc.y + 5;

        if (isLeft) lColY = tcY;
        else        rColY = tcY;
      });

      y = Math.max(lColY, rColY) + 4;
      } // end if (_includeTerms)

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  FOOTER --- all pages
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }

  async _buildWorkOrderPdf(project, companySettings) {
    // Resolve estimate array (hasMany) --- approved > selected_revision > latest
    const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const estimate = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1] || null;

    // Build allParts: custom_parts + process modules (same logic as generateTravellerPdf)
    const customPartsRaw = Array.isArray(estimate?.custom_parts) ? estimate.custom_parts : [];
    const processModules = Array.isArray(estimate?.items) ? estimate.items : [];
    const mappedModules = processModules.map(item => {
      const inp = item.input_json || {};
      const qty = Number(inp.quantity) || 0;
      const totalCost = Number(item.total_cost) || 0;
      const unitPrice = qty > 0 ? totalCost / qty : totalCost;
      const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return {
        _source: 'process_module',
        module_type: item.module_type,
        job_description: inp.job_name || moduleLabel,
        drawing_part_no: inp.drawing_part_no || '',
        material: inp.material_type || inp.material_grade || '',
        material_grade: inp.material_grade || inp.material_type || '',
        quantity: qty,
        heat_number: inp.heat_number || '',
        raw_material_dimension: inp.raw_material_dimension || '',
      };
    });
    const allParts = [...customPartsRaw, ...mappedModules];

    const wo = project.workOrder || {};
    const jobIds = Array.isArray(wo.job_ids) && wo.job_ids.length > 0 ? wo.job_ids : null;
    const customParts = jobIds ? allParts.filter((_, idx) => jobIds.includes(idx)) : allParts;

    // Default requirements & instructions checklist
    const DEFAULT_REQUIREMENTS = [
      'Dimensional Accuracy: Verify all dimensions per drawing specifications',
      'Surface Finish: Check surface roughness requirements',
      'Material Certificate: Verify material test certificate matches specs',
      'Heat Treatment: Verify heat treatment certificate if applicable',
      'Visual Inspection: Check for cracks, porosity, surface defects',
      'Thread Gauging: Verify thread specifications if applicable',
      'Hardness Test: Verify hardness requirements if specified',
      'NDT/NDE: Non-destructive testing if required',
    ];
    const rawReqs = Array.isArray(wo.quality_requirements) && wo.quality_requirements.length
      ? wo.quality_requirements : DEFAULT_REQUIREMENTS;
    const allRequirements = rawReqs
      .filter(r => typeof r === 'string' ? r.trim() : (r.checked !== false && (r.text || '').trim()))
      .map(r => typeof r === 'string' ? r : r.text);

    const HEADER_GREY = COLORS.TABLE_HEAD;

    return new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 30;
      const pageW  = doc.page.width;
      const pageH  = doc.page.height;
      const cW     = pageW - 2 * margin;

      const drawPageHeader = () => drawGlobalHeader(doc, companySettings);

      // ------ drawTable helper (same as generateTravellerPdf) ------------------------------
      const drawTable = (startY, headers, colWidths, rows, headerBg = HEADER_GREY, headerH = 22, rowH = 24, colAligns = null, descColIdx = -1) => {
        let y = startY;
        const OUTER_COLOR = COLORS.BORDER;
        const INNER_H_CLR = COLORS.BORDER_LIGHT;
        const INNER_V_CLR = COLORS.BORDER_MED;
        const FS = 8.5;

        // Normalize colWidths: adjust last column to ensure sum = cW
        const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
        if (totalColWidth !== cW) {
          const diff = cW - totalColWidth;
          colWidths[colWidths.length - 1] += diff;
        }

        // header row
        let x = margin;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], headerH).fill(headerBg);
          const textY = y + (headerH - FS) / 2;
          doc.fontSize(FS).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
            .text(String(h), x + 5, textY, { width: colWidths[i] - 10, align: 'center', lineBreak: false });
          x += colWidths[i];
        });
        doc.lineWidth(0.5).strokeColor(INNER_V_CLR);
        x = margin;
        colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + headerH).stroke(); });
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, y, cW, headerH).stroke();
        y += headerH;

        // data rows
        rows.forEach((row, ri) => {
          // Calculate dynamic row height when descColIdx is set
          let dynRowH = rowH;
          if (descColIdx >= 0 && row[descColIdx] && String(row[descColIdx]).includes('\n')) {
            const cellVal = String(row[descColIdx]);
            const parts = cellVal.split('\n');
            const descW = colWidths[descColIdx] - 12;
            doc.fontSize(FS).font('Helvetica');
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.fontSize(7).font('Helvetica');
            const drawH = doc.heightOfString(parts.slice(1).join('\n'), { width: descW });
            dynRowH = Math.max(rowH, descH + drawH + 10);
          } else if (descColIdx >= 0 && row[descColIdx]) {
            const descW = colWidths[descColIdx] - 12;
            doc.fontSize(FS).font('Helvetica');
            const descH = doc.heightOfString(String(row[descColIdx]), { width: descW });
            dynRowH = Math.max(rowH, descH + 8);
          }

          if (y + dynRowH > pageH - 45) { doc.addPage(); y = drawPageHeader(); }
          const bg = ri % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

          // Step 1: Fill row background
          doc.rect(margin, y, cW, dynRowH).fill(bg);
          // Step 2: Stroke row border + column dividers (flushes PDFKit fill state before text)
          doc.lineWidth(0.4).rect(margin, y, cW, dynRowH).strokeColor(INNER_H_CLR).stroke();
          doc.lineWidth(0.4).strokeColor(INNER_V_CLR);
          x = margin;
          colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + dynRowH).stroke(); });

          // Step 3: Render cell text
          x = margin;
          row.forEach((cell, ci) => {
            if (ci === descColIdx && cell && String(cell).includes('\n')) {
              // Two-part description rendering (matches Quotation PDF)
              const cellVal = String(cell);
              const parts = cellVal.split('\n');
              const descW = colWidths[ci] - 12;
              // Line 1: Main description — 8.5pt, black
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK);
              const descH = doc.heightOfString(parts[0], { width: descW });
              doc.text(parts[0], x + 6, y + 4, { width: descW, lineBreak: true });
              // Line 2: Drawing / Part No — 7pt, light gray #6B7280
              doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
              doc.text(parts.slice(1).join('\n'), x + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
            } else {
              const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
              const pad = align === 'center' ? 3 : 6;
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK)
                .text(String(cell ?? '-'), x + pad, y + 4, { width: colWidths[ci] - pad * 2, align, lineBreak: true, height: dynRowH - 6, ellipsis: false });
            }
            x += colWidths[ci];
          });
          y += dynRowH;
        });

        if (rows.length === 0) {
          doc.rect(margin, y, cW, rowH).fill(COLORS.ROW_ALT);
          doc.lineWidth(0.4).rect(margin, y, cW, rowH).strokeColor(INNER_H_CLR).stroke();
          doc.fontSize(FS).font('Helvetica-Oblique').fillColor('#999')
            .text('No data available', margin, y + (rowH - FS) / 2, { width: cW, align: 'center' });
          y += rowH;
        }

        const tableH = y - startY;
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, startY, cW, tableH).stroke();
        return y;
      };

      // ------ PAGE 1 ---------------------------------------------------------------------------------------------------------------------------------------------------
      let currentY = drawPageHeader();

      // Title "Production Traveler" --- centered, underlined, Times-Bold
      const titleText = 'Production Traveler';
      doc.fontSize(20).font('Times-Bold').fillColor('#000')
        .text(titleText, margin, currentY, { width: cW, align: 'center' });
      const titleW = doc.widthOfString(titleText, { fontSize: 20 });
      const titleX = margin + (cW - titleW) / 2;
      currentY += 24;
      doc.lineWidth(1).moveTo(titleX, currentY).lineTo(titleX + titleW, currentY).strokeColor('#000').stroke();
      currentY += 14;

      // ------ INFO TABLE ---------------------------------------------------------------------------------------------------------------------------------------
      const iColW = [36, 100, 131, 36, 100, 132];
      const preparedBy = wo.prepared_by || project.preparedBy?.name || '';
      const approvedBy = wo.approved_by || '';
      const dueDate    = wo.target_date ? dayjs(wo.target_date).format('DD-MMM-YYYY') : 'To be Filled';
      const issueDate  = wo.release_date ? dayjs(wo.release_date).format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY');

      const infoHeaders = ['S.No.', 'Description', 'Value', 'S.No.', 'Description', 'Value'];
      const infoRows = [
        ['1', 'Production Traveler No', wo.production_traveler_number || wo.work_order_number || '-', '5', 'Prepared By', preparedBy || '-'],
        ['2', 'Project Name',      project.project_name || '-', '6', 'Approved By', approvedBy || '-'],
        ['3', 'Client Name',       project.client?.client_name || '-', '7', 'Due Date', dueDate],
        ['4', 'Purchase Order No', project.salesOrder?.sales_order_number || '-', '8', 'Issue Date', issueDate],
      ];
      const infoAligns = ['center', 'left', 'left', 'center', 'left', 'left'];
      currentY = drawTable(currentY, infoHeaders, iColW, infoRows, HEADER_GREY, 20, 22, infoAligns);
      currentY += 14;

      // ------ 1. MATERIAL DETAILS ------------------------------------------------------------------------------------------------------------
      doc.fontSize(12).font('Times-Bold').fillColor('#000')
        .text('1. Material Details:', margin, currentY);
      currentY += 16;

      const jobReqs = wo.job_requirements || {};
      const mColW = [36, 200, 65, 234];
      const matHeaders = ['S.No.', 'Description', 'Quantity', 'Requirements'];
      const matRows = customParts.length > 0
        ? customParts.map((part, i) => {
            const origIdx = jobIds ? jobIds[i] : i;
            // Robust requirement lookup: try string key, number key, and original index formats
            const userReq = jobReqs[String(origIdx)] || jobReqs[origIdx] || '';
            const requirement = (typeof userReq === 'string' && userReq.trim())
              ? userReq.trim()
              : 'N/A';
            // Use standardized description format: Part Name | Material | Grade | Condition | Dimensions
            const { description, drawingDisplay } = buildDescription(part);
            // Build description with drawing number on separate line
            const desc = drawingDisplay 
              ? `${description}\n${drawingDisplay}`
              : description;
            // Robust quantity resolution: handle number, string, 0, '', null, undefined
            const rawQty = part.quantity;
            const hasQty = rawQty != null && rawQty !== '' && !(typeof rawQty === 'number' && isNaN(rawQty));
            const displayQty = hasQty ? rawQty : 'N/A';
            return [
              i + 1,
              desc,
              displayQty,
              requirement,
            ];
          })
        : [['1', 'Job + Material\nDrawing / Part No:', 'N/A', 'N/A']];

      const matAligns = ['center', 'left', 'center', 'left'];
      currentY = drawTable(currentY, matHeaders, mColW, matRows, HEADER_GREY, 20, 26, matAligns, 1);
      currentY += 18;

      // ------ 2. QUALITY REQUIREMENTS ------------------------------------------------------------------------------------------------
      if (currentY + 60 > pageH - 45) { doc.addPage(); currentY = drawPageHeader(); }

      doc.fontSize(12).font('Times-Bold').fillColor('#000')
        .text('2. Requirements & Instructions:', margin, currentY);
      currentY += 16;

      allRequirements.forEach((item, i) => {
        if (currentY + 14 > pageH - 45) { doc.addPage(); currentY = drawPageHeader(); }
        doc.fontSize(9).font('Helvetica').fillColor('#000')
          .text(`${i + 1}.  ${item}`, margin + 4, currentY, { width: cW - 8 });
        const lineCount = Math.ceil(doc.widthOfString(item, { fontSize: 9 }) / (cW - 30));
        currentY += 13 * Math.max(1, lineCount);
      });

      // ------ Footer ---------------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  _buildProductionTravellerPdf(project, companySettings) {
    return new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const wo  = project.workOrder  || {};
      const so  = project.salesOrder || {};
      const ops = wo.operations || [];

      // Merge operator/date from production_forms saved in the UI
      const _pfForm0 = (wo.production_forms || [])[0] || {};
      const _pfSectionB = _pfForm0.sectionB || [];
      const _pfSectionACompleted = _pfForm0.sectionACompleted || {};
      const _pfQuantity = _pfForm0.quantity || '';

      // Resolve estimate array (hasMany) to get the approved / selected / latest revision
      const _ptEstimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
      const _ptSelectedEst = pickBestEstimate(_ptEstimates, project.selected_revision) || _ptEstimates[_ptEstimates.length - 1];
      // Derive material/quantity from estimate custom_parts if project-level fields are blank
      const _ptCp = _ptSelectedEst?.custom_parts || [];
      const _ptFp = _ptCp[0] || {};
      const _ptMatType = project.material_type || _ptFp.material || '';
      const _ptMatGrade = project.material_grade || _ptFp.material_grade || '';
      const _ptHeatNum = project.heat_number || _ptFp.heat_number || 'N/A';
      const _ptQty = project.quantity || _pfQuantity || _ptCp.reduce((s, p) => s + (Number(p.quantity) || 0), 0) || '-';

      // ------ Layout constants ---------------------------------------------------------------------------------------------------------------------------
      const margin    = 45;
      const topMarginPT = 51;
      const pageW    = doc.page.width;
      const pageH    = doc.page.height;
      const cW       = pageW - 2 * margin;
      const FOOTER_H = 34;

      // ------ Palette (consistent across all PDFs) ------------------------------------------------------------------
      const C_DARK   = COLORS.TEXT_DARK;
      const C_MED    = COLORS.TEXT_MED;
      const C_LIGHT  = COLORS.TEXT_LIGHT;
      const C_NAVY   = COLORS.ACCENT;
      const C_BORDER = COLORS.BORDER;
      const C_HDR    = COLORS.TABLE_HEAD;
      const C_ALT    = COLORS.ROW_ALT;

      // ------ Helpers ------------------------------------------------------------------------------------------------------------------------------------------------------
      const fmtDate = (d) => d ? dayjs(d).format('MM/DD/YYYY') : 'N/A';
      const modLabel = (t) => ({
        cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', welding: 'Welding',
        heat_treatment: 'Heat Treat', grinding: 'Grinding', drilling: 'Drilling',
        boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
        assembly: 'Assembly', testing: 'Testing / Inspection', deburr: 'Deburr',
        marking: 'Marking', inspection: 'Final QC / Inspection', other: 'Other',
      }[t] || t || 'Operation');

      let y = margin;

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; return true; }
        return false;
      };

      // Draw a tick/checkmark using lines (Helvetica doesn't support Unicode tick chars)
      const drawTick = (cx, cy, size) => {
        const s = size || 8;
        doc.save()
           .lineWidth(1.8)
           .strokeColor(C_DARK)
           .moveTo(cx - s * 0.35, cy)
           .lineTo(cx - s * 0.05, cy + s * 0.35)
           .lineTo(cx + s * 0.45, cy - s * 0.35)
           .stroke()
           .restore();
      };

      // ------ Header ---------------------------------------------------------------------------------------------------------------------------------------------------
      const ptTitle = project.production_traveler_type === 'anodizing_industry'
        ? 'Production Traveller - Anodizing'
        : 'Production Traveller - Machining';
      y = drawGlobalHeader(doc, companySettings, ptTitle);

      // ------ Section title helper ---------------------------------------------------------------------------------------------------------------
      const drawSection = (title) => {
        checkPage(30);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(C_NAVY).text(title, margin, y);
        y += 18;
      };

      // ------ Table header helper ------------------------------------------------------------------------------------------------------------------
      const HDR_ROW_H = 24;
      const drawTblHdr = (cols, hdrs, aligns) => {
        // Normalize cols: adjust last column to ensure sum = cW
        const totalColWidth = cols.reduce((a, b) => a + b, 0);
        if (totalColWidth !== cW) {
          const diff = cW - totalColWidth;
          cols[cols.length - 1] += diff;
        }
        
        // 1) Fill background
        doc.rect(margin, y, cW, HDR_ROW_H).fill(C_HDR);
        // 2) Draw text
        let hx = margin;
        hdrs.forEach((h, i) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(h, hx + 4, y + 7, { width: cols[i] - 8, align: aligns?.[i] || 'center', lineBreak: false });
          hx += cols[i];
        });
        // 3) Draw ALL borders on top
        doc.lineWidth(1.5).rect(margin, y, cW, HDR_ROW_H).strokeColor(C_BORDER).stroke();
        hx = margin;
        cols.forEach((w, i) => {
          if (i < cols.length - 1) {
            doc.lineWidth(1.5).moveTo(hx + w, y).lineTo(hx + w, y + HDR_ROW_H).strokeColor(C_BORDER).stroke();
          }
          hx += w;
        });
        y += HDR_ROW_H;
      };

      // ------ Draw a data row (cells as array of { text, font, align }) ---
      const drawRow = (cols, cells, rowH, bg = '#FFFFFF') => {
        if (y + rowH > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
        // 1) Fill background
        doc.rect(margin, y, cW, rowH).fill(bg);
        // 2) Draw text
        let rx = margin;
        cells.forEach((cell, i) => {
          const txt = typeof cell === 'string' ? cell : (cell.text || '');
          const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
          const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
          doc.fontSize(8).font(fnt).fillColor(C_DARK)
             .text(txt, rx + 5, y + 6, { width: cols[i] - 10, align: aln, lineBreak: true, height: rowH - 12 });
          rx += cols[i];
        });
        // 3) Draw ALL borders on top
        doc.lineWidth(1.5).rect(margin, y, cW, rowH).strokeColor(C_BORDER).stroke();
        rx = margin;
        cols.forEach((w, i) => {
          if (i < cols.length - 1) {
            doc.lineWidth(1.5).moveTo(rx + w, y).lineTo(rx + w, y + rowH).strokeColor(C_BORDER).stroke();
          }
          rx += w;
        });
        y += rowH;
      };

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  WO SUMMARY ROW --- one row per selected part
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const WO_C = [48, 52, 80, 0, 28, 30, 66, 62];
      WO_C[3] = cW - WO_C.reduce((a, b) => a + b, 0) + WO_C[3];
      drawTblHdr(WO_C,
        ['PT #', 'PO #', 'Part Number', 'Product Description', 'Rev. #', 'Qty', 'PO Date', 'Dim. Report'],
        ['center','center','left','left','center','center','center','center']);

      if (_ptCp.length > 0) {
        _ptCp.forEach((part, idx) => {
          const pfForm = (wo.production_forms || [])[idx] || {};
          const partQty = pfForm.quantity || part.quantity || _pfQuantity || '-';
          drawRow(WO_C, [
            { text: idx === 0 ? (wo.production_traveler_number || wo.work_order_number || '-') : '', align: 'center' },
            { text: idx === 0 ? (so.customer_po_number || so.sales_order_number || '-') : '', align: 'center' },
            { text: (part.drawing_part_no || '-') + (part.drawing_revision ? ' - ' + part.drawing_revision : ''), align: 'left' },
            { text: part.job_description || '-',                     align: 'left'   },
            { text: String(project.revision || 'A'),                 align: 'center' },
            { text: String(partQty),                                 align: 'center' },
            { text: idx === 0 ? fmtDate(so.order_date || so.created_at) : '', align: 'center' },
            { text: 'N/A',                                           align: 'center' },
          ], 28, idx % 2 === 0 ? '#FFFFFF' : C_ALT);
        });
      } else {
        drawRow(WO_C, [
          { text: wo.production_traveler_number || wo.work_order_number || '-', align: 'center' },
          { text: so.customer_po_number || '-', align: 'center' },
          { text: '-', align: 'left' },
          { text: project.project_name || '-', align: 'left' },
          { text: String(project.revision || 'A'), align: 'center' },
          { text: String(_ptQty), align: 'center' },
          { text: fmtDate(so.order_date || so.created_at), align: 'center' },
          { text: 'N/A', align: 'center' },
        ], 28);
      }
      y += 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SECTION A --- MATERIAL
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawSection('Section A: Material');

      // Layout: Line | Operation | Description (3 sub-columns) | Check off once complete
      const CHECK_W = 72;
      const LN_W   = 30;
      const OP_W   = 80;
      const DESC_W = cW - LN_W - OP_W - CHECK_W;
      const A_COLS = [LN_W, OP_W, DESC_W, CHECK_W];
      const SUB_W  = DESC_W / 3;  // each Description sub-column

      // Header row
      drawTblHdr(A_COLS,
        ['Line', 'Operation', 'Description', 'Check off once\ncomplete'],
        ['center','left','center','center']);

      const A_ROW_H = 22;

      // Helper: draw a Section A operation block (sub-header row + value row)
      const drawSectionABlock = (lineNum, opName, subHeaders, subValues, bg, isCompleted) => {
        // Sub-header row (labels)
        if (y + A_ROW_H * 2 > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }

        // --- Merged Line + Operation cells span 2 rows ---
        const blockH = A_ROW_H * 2;

        // 1) Fill backgrounds
        doc.rect(margin, y, cW, blockH).fill(bg);

        // 2) Draw ALL text first
        // Line number --- centered vertically across both rows
        doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
           .text(String(lineNum), margin + 5, y + (blockH - 8) / 2, { width: LN_W - 10, align: 'center', lineBreak: false });

        // Operation name --- centered vertically across both rows
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C_DARK)
           .text(opName, margin + LN_W + 5, y + (blockH - 8) / 2, { width: OP_W - 10, align: 'left', lineBreak: false });

        // Description sub-header labels (row 1)
        const descX = margin + LN_W + OP_W;
        subHeaders.forEach((h, i) => {
          doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
             .text(h, descX + i * SUB_W + 4, y + 6, { width: SUB_W - 8, align: 'center', lineBreak: false });
        });

        // Description sub-values (row 2)
        subValues.forEach((v, i) => {
          doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
             .text(String(v || '-'), descX + i * SUB_W + 4, y + A_ROW_H + 6, { width: SUB_W - 8, align: 'center', lineBreak: false });
        });

        // 3) Draw ALL borders on top
        // Outer border for the full block
        doc.lineWidth(1.5).rect(margin, y, cW, blockH).strokeColor(C_BORDER).stroke();
        // Horizontal line between row 1 and row 2 (only under Description area)
        doc.lineWidth(1.5).moveTo(margin + LN_W + OP_W, y + A_ROW_H).lineTo(margin + LN_W + OP_W + DESC_W, y + A_ROW_H).strokeColor(C_BORDER).stroke();
        // Main vertical dividers
        doc.lineWidth(1.5).strokeColor(C_BORDER);
        doc.moveTo(margin + LN_W, y).lineTo(margin + LN_W, y + blockH).stroke();
        doc.moveTo(margin + LN_W + OP_W, y).lineTo(margin + LN_W + OP_W, y + blockH).stroke();
        doc.moveTo(margin + LN_W + OP_W + DESC_W, y).lineTo(margin + LN_W + OP_W + DESC_W, y + blockH).stroke();
        // Description sub-column dividers
        subHeaders.forEach((h, i) => {
          if (i < subHeaders.length - 1) {
            doc.lineWidth(1.0).moveTo(descX + (i + 1) * SUB_W, y).lineTo(descX + (i + 1) * SUB_W, y + blockH).strokeColor('#888').stroke();
          }
        });

        // Check off once complete --- draw tick if completed, blank if not
        if (isCompleted) {
          const checkCx = margin + LN_W + OP_W + DESC_W + CHECK_W / 2;
          const checkCy = y + blockH / 2;
          drawTick(checkCx, checkCy, 8);
        }

        y += blockH;
      };

      // Row 1: Material Specs (Size / Type / Heat)
      const matSize = _ptFp.raw_material_dimension || project.part_size || '-';
      const matType = _ptMatType || '-';
      const matHeat = _ptHeatNum || '-';
      drawSectionABlock(1, 'Material Specs',
        ['Size', 'Type', 'Heat'],
        [matSize, matType, matHeat],
        '#FFFFFF', !!_pfSectionACompleted.material);

      // Row 2: Saw (Saw Cut or Bar Feed? / Qty / Cut Length)
      drawSectionABlock(2, 'Saw',
        ['Saw Cut or Bar Feed?', 'Qty', 'Cut Length'],
        [_pfForm0.sawCutOrBarFeed || 'Saw Cut', String(_ptQty), _pfForm0.cutLength || '-'],
        C_ALT, !!_pfSectionACompleted.saw);

      y += 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SECTION B --- MACHINING & MILLING OPERATIONS
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(60);
      drawSection('Section B: Traveler');

      const INIT_W = 60;
      const DATE_W = 60;
      const B_CHECK_W = 62;
      const B_COLS = [LN_W, 80, 0, 70, INIT_W, DATE_W, B_CHECK_W];
      B_COLS[2] = cW - B_COLS.reduce((a, b) => a + b, 0) + B_COLS[2];
      drawTblHdr(B_COLS,
        ['Line', 'Operation', 'Description', 'Required\nOperation(s)?', 'Operator', 'Date', 'Check off once\ncomplete'],
        ['center','left','left','center','center','center','center']);

      const B_ROW_H = 26;
      // Use production_forms sectionB if available (has user-entered data), else fall back to wo.operations
      const sectionBOps = _pfSectionB.length > 0 ? _pfSectionB : ops;
      if (sectionBOps.length > 0) {
        sectionBOps.forEach((op, idx) => {
          const reqd = op.is_external ? 'External'
            : op.required_operation ? op.required_operation
            : (op.is_required === false ? 'No' : 'Yes --- Manual');
          const operator = op.initials || op.operator_initials || op.operator || '';
          const opDate   = op.opDate || op.op_date || op.date || '';
          drawRow(B_COLS, [
            { text: String(idx + 1), align: 'center' },
            { text: modLabel(op.module_type || op.operation || op.operation_name || ''), bold: true },
            { text: op.description || '' },
            { text: reqd, align: 'center' },
            { text: operator, align: 'center' },
            { text: opDate, align: 'center' },
            { text: '', align: 'center' },
          ], B_ROW_H, idx % 2 === 0 ? '#FFFFFF' : C_ALT);
          // Draw tick in "Check off once complete" column if completed
          if (op.completed) {
            const tickX = margin + B_COLS.slice(0, 6).reduce((a, b) => a + b, 0) + B_COLS[6] / 2;
            const tickY = y - B_ROW_H / 2;
            drawTick(tickX, tickY, 7);
          }
        });
      } else {
        // Empty rows fallback - use 19 for anodizing, 7 for machining
        const emptyRowCount = project.production_traveler_type === 'anodizing_industry' ? 19 : 7;
        for (let i = 0; i < emptyRowCount; i++)
          drawRow(B_COLS, [{ text: String(i + 1), align: 'center' }, '', '', '', '', '', ''], B_ROW_H, i % 2 === 0 ? '#FFFFFF' : C_ALT);
      }
      y += 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SECTION C --- GENERAL NOTES
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(60);
      drawSection('Section C: General Notes');

      const generalNotesText = (_pfForm0.generalNotes || '').trim();
      const GN_ROW_H = 40;
      if (y + GN_ROW_H > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
      doc.rect(margin, y, cW, GN_ROW_H).fill('#FFFFFF');
      doc.lineWidth(1.5).rect(margin, y, cW, GN_ROW_H).strokeColor(C_BORDER).stroke();
      if (generalNotesText) {
        doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
           .text(generalNotesText, margin + 6, y + 6, { width: cW - 12, height: GN_ROW_H - 12, lineBreak: true });
      }
      y += GN_ROW_H + 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  FOOTER --- all pages
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }

  _buildCoCPdf(project, companySettings, serialNumber) {
    return new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const qr  = project.qualityRecord || {};
      const so  = project.salesOrder    || {};
      const wo  = project.workOrder     || {};

      // ------ Layout ---------------------------------------------------------------------------------------------------------------------------------------------------------
      const margin    = 45;
      const topMarginCoC = 51;
      const pageW    = doc.page.width;
      const pageH    = doc.page.height;
      const cW       = pageW - 2 * margin;
      const FOOTER_H = 34;

      // ------ Palette (consistent across all PDFs) ------------------------------------------------------------
      const C_DARK   = COLORS.TEXT_DARK;
      const C_MED    = COLORS.TEXT_MED;
      const C_LIGHT  = COLORS.TEXT_LIGHT;
      const C_NAVY   = COLORS.ACCENT;
      const C_BORDER = COLORS.BORDER;
      const C_HDR    = COLORS.TABLE_HEAD;
      const C_ALT    = COLORS.ROW_ALT;

      let y = margin;

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
      };

      const hLine = (lw = 0.5, color = C_BORDER) =>
        doc.lineWidth(lw).moveTo(margin, y).lineTo(margin + cW, y).strokeColor(color).stroke();

      // ------ Header ---------------------------------------------------------------------------------------------------------------------------------------------------------------
      y = drawGlobalHeader(doc, companySettings, 'Certificate of Conformance');

      // ------ Section title helper ---------------------------------------------------------------------------------------------------------------
      const drawSection = (title) => {
        checkPage(30);
        // Remove any leading '#' from section titles
        const cleanTitle = typeof title === 'string' ? title.replace(/^#+\s*/, '') : title;
        doc.fontSize(11).font('Helvetica-Bold').fillColor(C_NAVY).text(cleanTitle, margin, y);
        y += 16;
      };

      // ------ Table helpers ------------------------------------------------------------------------------------------------------------------------------------
      const HDR_ROW_H = 22;
      const drawTblHdr = (cols, hdrs, aligns) => {
        doc.rect(margin, y, cW, HDR_ROW_H).fill(C_HDR);
        doc.lineWidth(0.5).rect(margin, y, cW, HDR_ROW_H).strokeColor(C_BORDER).stroke();
        let hx = margin;
        hdrs.forEach((h, i) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(h, hx + 5, y + 7, { width: cols[i] - 10, align: aligns?.[i] || 'center', lineBreak: false });
          if (i < hdrs.length - 1)
            doc.lineWidth(0.3).moveTo(hx + cols[i], y).lineTo(hx + cols[i], y + HDR_ROW_H).strokeColor(C_BORDER).stroke();
          hx += cols[i];
        });
        y += HDR_ROW_H;
      };

      const drawRow = (cols, cells, rowH, bg = '#FFFFFF') => {
        checkPage(rowH);
        doc.rect(margin, y, cW, rowH).fill(bg);
        doc.lineWidth(0.5).rect(margin, y, cW, rowH).strokeColor(C_BORDER).stroke();
        let rx = margin;
        cells.forEach((cell, i) => {
          const txt = typeof cell === 'string' ? cell : (cell.text || '');
          const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
          const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
          const clr = (typeof cell === 'object' && cell.color) ? cell.color : C_DARK;
          doc.fontSize(8.5).font(fnt).fillColor(clr)
             .text(txt, rx + 5, y + 4, { width: cols[i] - 10, align: aln, lineBreak: true, height: rowH - 8, ellipsis: false });
          if (i < cells.length - 1)
            doc.lineWidth(0.3).moveTo(rx + cols[i], y).lineTo(rx + cols[i], y + rowH).strokeColor(C_BORDER).stroke();
          rx += cols[i];
        });
        y += rowH;
      };

      // Resolve estimate array (hasMany) to get the approved / selected / latest revision
      const _cocEstimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
      const _cocSelectedEst = pickBestEstimate(_cocEstimates, project.selected_revision) || _cocEstimates[_cocEstimates.length - 1];
      // Derive material/quantity from estimate custom_parts if project-level fields are blank
      const _customParts = _cocSelectedEst?.custom_parts || [];
      const _firstPart = _customParts[0] || {};
      const _materialType = project.material_type || _firstPart.material || '';
      const _materialGrade = project.material_grade || _firstPart.material_grade || '';
      const _prodForms = Array.isArray(wo.production_forms) ? wo.production_forms : [];
      const _heatNumber = project.heat_number || _firstPart.heat_number
        || _prodForms.map(f => f.heatNumber).filter(Boolean).join(', ') || 'N/A';
      // Quantity from approved estimation line items (sum of all quantities)
      const _cocLineItems = buildEstimateLineItems(_cocSelectedEst);
      const _estTotalQty = _cocLineItems.reduce((s, li) => s + (li.quantity || 0), 0);
      const _totalQty = _estTotalQty > 0 ? _estTotalQty : '-';

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  WO / PRODUCT INFO TABLE
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const W_COLS = [50, 0, 55, 75, 32, 90, 35, 55];
      W_COLS[1] = cW - W_COLS.reduce((a, b) => a + b, 0) + W_COLS[1];
      drawTblHdr(W_COLS,
        ['WO', 'Product Description', 'Procedure ID', 'Part Number', 'Revision', 'Material', 'Qty', 'Date'],
        ['center','left','center','center','center','center','center','center']);

      // Resolve part number: WO > first custom part drawing_part_no
      const _cocPartNumber = wo.part_number || ((_firstPart.drawing_part_no || '-') + (_firstPart.drawing_revision ? ' - ' + _firstPart.drawing_revision : ''));
      // Resolve revision: estimate revision (R0, R1, etc) > fallback 'A'
      const _cocRevision = _cocSelectedEst?.revision != null ? `R${_cocSelectedEst.revision}` : 'A';
      // Procedure ID is stored as serialNumber (QF-xx format)
      const _cocProcedureId = serialNumber || 'QF-01';

      drawRow(W_COLS, [
        { text: wo.work_order_number || '-',                      align: 'center' },
        { text: project.project_name || '-',                      align: 'left'   },
        { text: _cocProcedureId,                                  align: 'center' },
        { text: _cocPartNumber,                                   align: 'center' },
        { text: _cocRevision,                                     align: 'center' },
        { text: [_materialType, _materialGrade].filter(Boolean).join(' ') || '-', align: 'center' },
        { text: String(_totalQty),                                align: 'center' },
        { text: qr.inspection_date ? dayjs(qr.inspection_date).format('DD-MMM-YY') : dayjs().format('DD-MMM-YY'), align: 'center' },
      ], 32);
      y += 4;

      // ------ Customer / heat details row ------------------------------------------------------------------------------------------
      const KD_COLS = [cW / 3, cW / 3, cW / 3];
      drawTblHdr(KD_COLS,
        ['Customer PO Number', 'Serial Numbers', 'Material Heat Number'],
        ['center', 'center', 'center']);

      // Derive serial numbers from inspection_data_json or inspection_checklist
      const _inspData = qr.inspection_data_json || {};
      const serialRange = serialNumber || _inspData.serial_numbers || _inspData.serialNumbers || 'N/A';
      drawRow(KD_COLS, [
        { text: so.customer_po_number || 'N/A', align: 'center', bold: true },
        { text: serialRange,                     align: 'center' },
        { text: _heatNumber,                     align: 'center' },
      ], 26);
      y += 18;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  CERTIFICATION STATEMENT
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(80);
      const stmtLines = [
        'This report is to certify that the above parts have been:',
        '',
        '\u2022  Manufactured in accordance with all in-house policies and procedures and in compliance with the customer\'s requirements and/or specifications. (Procedures available upon request)',
        '\u2022  Inspected in accordance with the approved Inspection & Test Plan and found to be acceptable.',
        '',
        'The following indicated procedures have been performed and documentation is attached as required:',
      ];
      stmtLines.forEach(line => {
        doc.fontSize(9.5).font(line.startsWith('\u2022') ? 'Helvetica' : (line.includes('This') || line.includes('The following') ? 'Helvetica' : 'Helvetica'))
           .fillColor(C_DARK)
           .text(line || ' ', margin, y, { width: cW, lineBreak: false });
        y += line === '' ? 6 : (line.startsWith('\u2022') ? doc.heightOfString(line, { width: cW - 10, fontSize: 9.5 }) + 4 : 16);
      });
      y += 10;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  PROCEDURE VERIFICATION TABLE
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const P_PROC_W = cW * 0.72;
      const P_STAT_W = cW - P_PROC_W;
      drawTblHdr([P_PROC_W, P_STAT_W], ['Procedure', ''], ['left', 'center']);

      const procedures = [
        { label: 'Dimensional Verification',        value: qr.dimensional_verification },
        { label: 'Visual Inspection',               value: qr.visual_inspection        },
        { label: 'Hardness Testing',                value: qr.hardness_testing         },
        { label: 'Non-destructive Examination',     value: qr.ndt_testing              },
        { label: 'Pressure Testing',                value: qr.pressure_testing         },
        { label: 'MTR',                             value: qr.mtr_verification         },
        { label: 'Dimension Inspection Report',     value: _prodForms.some(f => f.dimensionReport) || false },
      ];

      procedures.forEach((proc, idx) => {
        const mark = proc.value ? '\u2713' : 'NA';
        const markColor = proc.value ? '#16A34A' : C_LIGHT;
        drawRow([P_PROC_W, P_STAT_W], [
          { text: proc.label },
          { text: mark, align: 'center', color: markColor, bold: !!proc.value },
        ], 24, idx % 2 === 0 ? '#FFFFFF' : C_ALT);
      });
      y += 18;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  COMMENTS
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(110);
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C_NAVY).text('Comments:', margin, y);
      y += 14;
      const CMT_H = 72;
      doc.rect(margin, y, cW, CMT_H).fill('#FFFFFF');
      doc.lineWidth(0.5).rect(margin, y, cW, CMT_H).strokeColor(C_BORDER).stroke();
      const _comments = qr.notes || qr.inspector_notes || '';
      if (_comments) {
        doc.fontSize(9).font('Helvetica').fillColor(C_DARK)
           .text(_comments, margin + 8, y + 8, { width: cW - 16, height: CMT_H - 16 });
      }
      [0.35, 0.68].forEach(f => {
        const ly = y + CMT_H * f;
        doc.lineWidth(0.3).moveTo(margin + 8, ly).lineTo(margin + cW - 8, ly).strokeColor('#D1D5DB').stroke();
      });
      y += CMT_H + 22;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SIGNATURE BLOCK
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(80);
      const SIG_W = 200;
      const sigX  = margin + cW - SIG_W;

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_NAVY)
         .text('Authorized Signatory', sigX, y, { width: SIG_W, align: 'left' });
      y += 16;

      const sigFields = ['Name', 'Designation', 'Date'];
      const _cocPrepBy = project.preparedBy || {};
      const _cocPocName = companySettings.poc_name || companySettings.contact_person || '';
      sigFields.forEach(lbl => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C_MED).text(`${lbl}:`, sigX, y, { width: 70, lineBreak: false });
        const val = lbl === 'Name' ? (_cocPrepBy.name || _cocPocName || '')
                  : lbl === 'Designation' ? (_cocPrepBy.position || '')
                  : dayjs().format('DD-MMM-YYYY');
        if (val) {
          doc.font('Helvetica').fillColor(C_DARK).text(val, sigX + 72, y, { width: SIG_W - 72, lineBreak: false });
        } else {
          doc.lineWidth(0.5).moveTo(sigX + 72, y + 10).lineTo(sigX + SIG_W, y + 10).strokeColor(C_BORDER).stroke();
        }
        y += 18;
      });

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  FOOTER --- all pages
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }

  _buildPackingListPdf(project, companySettings, senderUser = {}) {
    const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const selectedEstimate = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    const plArr = Array.isArray(project.packages_json) ? project.packages_json : [];
    const pl = plArr[0] || {};
    const poNumber = project.salesOrder?.customer_po_number || project.salesOrder?.po_number || project.po_number || '';

    return new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 30;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW = pageW - 2 * margin;
      const HEADER_GREY = COLORS.TABLE_HEAD;

      const drawPageHeader = () => drawGlobalHeader(doc, companySettings);

      const drawTable = (startY, headers, colWidths, rows, headerBg = HEADER_GREY, headerH = 22, rowH = 24, colAligns = null, descColIdx = -1) => {
        let y = startY;
        const OUTER_COLOR = COLORS.BORDER;
        const INNER_H_CLR = COLORS.BORDER_LIGHT;
        const INNER_V_CLR = COLORS.BORDER_MED;
        const FS = 8.5;

        // Normalize colWidths: adjust last column to ensure sum = cW
        const totalColWidth = colWidths.reduce((a, b) => a + b, 0);
        if (totalColWidth !== cW) {
          const diff = cW - totalColWidth;
          colWidths[colWidths.length - 1] += diff;
        }

        let x = margin;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], headerH).fill(headerBg);
          const textY = y + (headerH - FS) / 2;
          doc.fontSize(FS).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
            .text(String(h), x + 5, textY, { width: colWidths[i] - 10, align: 'center', lineBreak: false });
          x += colWidths[i];
        });
        doc.lineWidth(0.5).strokeColor(INNER_V_CLR);
        x = margin;
        colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + headerH).stroke(); });
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, y, cW, headerH).stroke();
        y += headerH;

        rows.forEach((row, ri) => {
          // Calculate dynamic row height by checking ALL cells for text wrapping
          let dynRowH = rowH;
          
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = String(row[ci] ?? '-');
            const cellW = colWidths[ci] - 12;
            
            // Special handling for descColIdx cells with '\n' (2-line description)
            if (ci === descColIdx && cellVal.includes('\n')) {
              const parts = cellVal.split('\n');
              doc.fontSize(FS).font('Helvetica');
              const descH = doc.heightOfString(parts[0], { width: cellW });
              doc.fontSize(7).font('Helvetica');
              const drawH = doc.heightOfString(parts.slice(1).join('\n'), { width: cellW });
              dynRowH = Math.max(dynRowH, descH + drawH + 10);
            } else {
              // For all other cells, calculate wrapping height
              doc.fontSize(FS).font('Helvetica');
              const textH = doc.heightOfString(cellVal, { width: cellW });
              dynRowH = Math.max(dynRowH, textH + 8);
            }
          }

          if (y + dynRowH > pageH - 45) { doc.addPage(); y = drawPageHeader(); }
          const bg = ri % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

          // Step 1: Fill row background
          doc.rect(margin, y, cW, dynRowH).fill(bg);
          // Step 2: Stroke row border + column dividers (flushes PDFKit fill state before text)
          doc.lineWidth(0.4).rect(margin, y, cW, dynRowH).strokeColor(INNER_H_CLR).stroke();
          doc.lineWidth(0.4).strokeColor(INNER_V_CLR);
          x = margin;
          colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + dynRowH).stroke(); });

          // Step 3: Render cell text
          x = margin;
          row.forEach((cell, ci) => {
            if (ci === descColIdx && cell && String(cell).includes('\n')) {
              // Two-part description rendering (matches Quotation PDF)
              const cellVal = String(cell);
              const parts = cellVal.split('\n');
              const descW = colWidths[ci] - 12;
              // Line 1: Main description — 8.5pt, black
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK);
              const descH = doc.heightOfString(parts[0], { width: descW });
              doc.text(parts[0], x + 6, y + 4, { width: descW, lineBreak: true });
              // Line 2: Drawing / Part No — 7pt, light gray #6B7280
              doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
              doc.text(parts.slice(1).join('\n'), x + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
            } else {
              const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
              const pad = align === 'center' ? 3 : 6;
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK)
                .text(String(cell ?? '-'), x + pad, y + 4, { width: colWidths[ci] - pad * 2, align, lineBreak: true });
            }
            x += colWidths[ci];
          });
          y += dynRowH;
        });

        if (rows.length === 0) {
          doc.rect(margin, y, cW, rowH).fill(COLORS.ROW_ALT);
          doc.lineWidth(0.4).rect(margin, y, cW, rowH).strokeColor(INNER_H_CLR).stroke();
          doc.fontSize(FS).font('Helvetica-Oblique').fillColor('#999')
            .text('No data available', margin, y + (rowH - FS) / 2, { width: cW, align: 'center' });
          y += rowH;
        }

        const tableH = y - startY;
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, startY, cW, tableH).stroke();
        return y;
      };

      let y = drawPageHeader();

      const titleText = 'Packing List';
      doc.fontSize(20).font('Times-Bold').fillColor('#000')
        .text(titleText, margin, y, { width: cW, align: 'center' });
      const titleW = doc.widthOfString(titleText, { fontSize: 20 });
      const titleX = margin + (cW - titleW) / 2;
      y += 24;
      doc.lineWidth(1).moveTo(titleX, y).lineTo(titleX + titleW, y).strokeColor('#000').stroke();
      y += 14;

      const iColW = [36, 90, 142, 36, 90, 141];
      const infoHeaders = ['S.No.', 'Description', 'Value', 'S.No.', 'Description', 'Value'];
      const infoRows = [
        ['1', 'Packing Slip #',    pl.number || 'Auto Generated',                              '7',  'Receiver Name',    pl.receiver_name || project.client?.poc_name || '-'],
        ['2', 'Shipped Via',       pl.shipment_method || project.shipment_method || '-',         '8',  'Receiver Contact', pl.receiver_phone || project.client?.poc_phone || '-'],
        ['3', 'Carrier',           pl.carrier || project.carrier || '-',                         '9',  'Sender Detail',    companySettings.name || senderUser?.name || senderUser?.email || '-'],
        ['4', 'Tracking #',        pl.tracking_number || project.tracking_number || '-',         '10', 'Vehicle Type',     pl.vehicle_type || '-'],
        ['5', 'Purchase Order No', pl.po_number || poNumber || '-',                              '11', 'Vehicle Number',   pl.vehicle_number || '-'],
        ['6', 'Billing Address',   pl.bill_to_address || project.client?.address || '-',         '12', 'Shipping Address', pl.ship_to_address || project.ship_to_address || '-'],
      ];
      const infoAligns = ['center', 'left', 'left', 'center', 'left', 'left'];
      y = drawTable(y, infoHeaders, iColW, infoRows, HEADER_GREY, 20, 22, infoAligns);
      y += 14;

      doc.fontSize(12).font('Times-Bold').fillColor('#000')
        .text('1. Material Details:', margin, y);
      y += 16;

      const matColW = [36, 235, 70, 194];
      const matHeaders = ['S.No.', 'Description', 'Quantity', 'Weight'];
      const allCustomParts = selectedEstimate?.custom_parts || [];
      const plSelectedIndices = pl.selected_job_indices || [];
      const filteredParts = plSelectedIndices.length > 0
        ? plSelectedIndices.map(idx => allCustomParts[idx]).filter(Boolean)
        : allCustomParts;
      const jobDetails = pl.job_details || {};
      const matRows = filteredParts.map((part, idx) => {
        const jobIdx = plSelectedIndices.length > 0 ? plSelectedIndices[idx] : idx;
        const jd = jobDetails[String(jobIdx)] || jobDetails[jobIdx] || {};
        const qty = jd.quantity || part.quantity || '';
        const weightStr = jd.total_weight
          ? `${jd.total_weight} ${jd.weight_unit || 'kg'}`
          : (part.total_weight ? `${part.total_weight} ${part.weight_unit || 'kg'}` : (part.weight || '-'));
        // Use standardized description format: Part Name | Material | Grade | Condition | Dimensions
        const { description, drawingDisplay } = buildDescription(part);
        // Build description with drawing number on separate line
        const desc = drawingDisplay ? `${description}\n${drawingDisplay}` : description;
        return [idx + 1, desc, qty, weightStr];
      });
      const matAligns = ['center', 'left', 'center', 'center'];
      y = drawTable(y, matHeaders, matColW, matRows.length > 0 ? matRows : [], HEADER_GREY, 20, 26, matAligns, 1);
      y += 24;

      const SIG_W = 200;
      const sigX = margin + cW - SIG_W;
      const _plPrepBy = {
        name: senderUser?.name || senderUser?.email || '',
        position: senderUser?.position || '',
      };
      const lineH = 14;
      const lineW = SIG_W - 10;
      const labelW = 75;

      // --- Prepared By header ---
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
         .text('Prepared By', margin, y, { width: SIG_W, align: 'left' });
      // --- Received By header ---
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
         .text('Received By', sigX, y, { width: SIG_W, align: 'left' });
      y += 16;

      // Prepared By - Name (auto-filled)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Name:', margin, y, { width: labelW, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(_plPrepBy.name || '', margin + labelW, y, { width: lineW - labelW, lineBreak: false });
      doc.lineWidth(0.5).moveTo(margin + labelW, y + 10).lineTo(margin + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();
      // Received By - Name (empty)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Name:', sigX, y, { width: labelW, continued: false });
      doc.lineWidth(0.5).moveTo(sigX + labelW, y + 10).lineTo(sigX + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();
      y += lineH;

      // Prepared By - Designation (auto-filled)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Designation:', margin, y, { width: labelW, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(_plPrepBy.position || '', margin + labelW, y, { width: lineW - labelW, lineBreak: false });
      doc.lineWidth(0.5).moveTo(margin + labelW, y + 10).lineTo(margin + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();
      // Received By - Designation (empty)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Designation:', sigX, y, { width: labelW, continued: false });
      doc.lineWidth(0.5).moveTo(sigX + labelW, y + 10).lineTo(sigX + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();
      y += lineH;

      // Prepared By - Date (auto-filled)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Date:', margin, y, { width: labelW, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(dayjs().format('DD-MMM-YYYY'), margin + labelW, y, { width: lineW - labelW, lineBreak: false });
      doc.lineWidth(0.5).moveTo(margin + labelW, y + 10).lineTo(margin + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();
      // Received By - Date (empty)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Date:', sigX, y, { width: labelW, continued: false });
      doc.lineWidth(0.5).moveTo(sigX + labelW, y + 10).lineTo(sigX + lineW, y + 10).strokeColor(COLORS.BORDER).stroke();

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  async finalizeDocument(documentId) {
    const document = await Document.findByPk(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    await document.update({ status: 'final' });
    return document;
  }

  async getFullProjectData(projectId) {
    const project = await Project.findByPk(projectId, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy', attributes: ['id', 'name', 'email', 'phone', 'position'] },
        { 
          model: Estimate, 
          as: 'estimate',
          include: [{ model: EstimateItem, as: 'items' }]
        },
        { model: SalesOrder, as: 'salesOrder' },
        { model: WorkOrder, as: 'workOrder' },
        { model: QualityRecord, as: 'qualityRecord' }
      ]
    });

    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }

  async getNextDocumentVersion(projectId, documentType) {
    const latestDoc = await Document.findOne({
      where: { project_id: projectId, document_type: documentType },
      order: [['version', 'DESC']]
    });
    return latestDoc ? latestDoc.version + 1 : 1;
  }

  async saveDocument(filePath, content) {
    const fullPath = path.join(UPLOADS_ROOT, filePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
  }

  async uploadDocument(projectId, userId, file, type, description) {
    const project = await Project.findByPk(projectId, {
      include: [
        { model: Estimate, as: 'estimate' },
        { model: WorkOrder, as: 'workOrder' },
        { model: SalesOrder, as: 'salesOrder' },
      ],
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const docType = type || 'other';
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';

    // Resolve primary reference based on document type
    const reference = this._resolveUploadReference(project, docType);

    let fileName;
    let version;

    // If we have a valid naming type and reference, use the naming service
    const { generateDocumentName: genName } = require('./documentNamingService');
    const { DOCUMENT_TYPES } = require('./documentNamingService');
    const normalizedType = (docType || '').toLowerCase().trim();

    if (DOCUMENT_TYPES[normalizedType] && reference) {
      const result = await genName({
        documentType: docType,
        projectName: project.project_name,
        reference,
        projectId,
        extension: ext,
      });
      fileName = result.fileName;
      version = result.version;
    } else {
      // Fallback for unknown types (e.g. 'other') - use original name with version
      version = await this.getNextDocumentVersion(projectId, docType);
      fileName = file.originalname;
    }

    // Resolve file manager folder for this document type
    const folder = await fileManagerService.resolveFolder(docType, projectId);

    // Rename the uploaded file on disk
    const fsSync = require('fs');
    const oldPath = file.path;
    const companyId = project.company_id || null;
    const relativePath = folder ? fileManagerService.getFilePath(folder, fileName, companyId) : path.join('documents', projectId, fileName);
    const newDir = path.dirname(path.join(UPLOADS_ROOT, relativePath));
    await fs.mkdir(newDir, { recursive: true });
    const newPath = path.join(UPLOADS_ROOT, relativePath);
    if (fsSync.existsSync(oldPath)) {
      await fs.rename(oldPath, newPath);
    }
    // Sync to R2 cloud storage
    const r2 = require('./r2StorageService');
    r2.syncFileToR2(newPath, { companyId, projectId, section: 'documents' })
      .catch(err => console.error('[R2] Upload sync failed:', err.message));

    const document = await Document.create({
      project_id: projectId,
      folder_id: folder?.id || null,
      module_type: 'project',
      reference_id: projectId,
      document_type: docType,
      version,
      file_path: relativePath,
      file_name: fileName,
      size: file.size,
      description: description || null,
      status: 'final',
      file_type: 'uploaded',
      generated_by: userId,
      company_id: project.company_id || null
    });

    return document;
  }

  /**
   * Resolve the primary reference for an uploaded document based on its type.
   */
  _resolveUploadReference(project, docType) {
    const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const bestEstimate = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];

    switch ((docType || '').toLowerCase()) {
      case 'quotation':
        return project.quotation_number || bestEstimate?.quotation_number || null;
      case 'rfq':
        return project.quotation_number || null;
      case 'purchase_order':
      case 'po_client':
        return project.po_number || project.salesOrder?.customer_po_number || null;
      case 'vendor_po':
        return null; // Vendor PO reference comes from VPO entity, not project
      case 'work_order':
        return project.workOrder?.work_order_number || null;
      case 'production_traveller':
        return project.workOrder?.production_traveler_number || project.workOrder?.work_order_number || null;
      case 'coc':
        return project.heat_number || project.batch_number || project.workOrder?.work_order_number || null;
      case 'packing_list':
        return project.po_number || project.project_name || null;
      case 'invoice':
        return project.po_number || null;
      case 'drawing':
        return project.project_name || null;
      default:
        return null;
    }
  }

  async deleteDocument(id) {
    const document = await Document.findByPk(id);
    if (!document) {
      throw new Error('Document not found');
    }

    // Try to delete the physical file
    try {
      const fullPath = resolveDocPath(document.file_path);
      await fs.unlink(fullPath);
    } catch (err) {
      // File may not exist, continue with DB deletion
      console.warn('Could not delete file:', err.message);
    }

    await document.destroy();
    return { message: 'Document deleted successfully' };
  }

  // HTML Template Generators
  generateQuotationHTML(project, companySettings = {}) {
    const companyName = companySettings.name || '';
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Quotation - ${project.project_name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .company-name { font-size: 24px; font-weight: bold; }
    .document-title { font-size: 20px; margin-top: 10px; }
    .section { margin: 20px 0; }
    .section-title { font-size: 16px; font-weight: bold; background: #f0f0f0; padding: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .total-row { font-weight: bold; background: #e8f4e8; }
    .footer { margin-top: 40px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyName}</div>
    <div class="document-title">QUOTATION</div>
  </div>
  
  <div class="section">
    <div class="section-title">Project Details</div>
    <table>
      <tr><td><strong>Project Name:</strong></td><td>${project.project_name}</td></tr>
      <tr><td><strong>Client:</strong></td><td>${project.client?.client_name || 'N/A'}</td></tr>
      <tr><td><strong>Revision:</strong></td><td>${project.revision}</td></tr>
      <tr><td><strong>Date:</strong></td><td>${dayjs().format('MMMM DD, YYYY')}</td></tr>
      <tr><td><strong>Prepared By:</strong></td><td>${project.preparedBy?.name || 'N/A'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Material Specification</div>
    <table>
      <tr><td><strong>Material Type:</strong></td><td>${project.material_type || (project.estimate?.custom_parts || [])[0]?.material || 'N/A'}</td></tr>
      <tr><td><strong>Grade:</strong></td><td>${project.material_grade || (project.estimate?.custom_parts || [])[0]?.material_grade || 'N/A'}</td></tr>
      <tr><td><strong>Heat Number:</strong></td><td>${project.heat_number || (project.estimate?.custom_parts || [])[0]?.heat_number || 'N/A'}</td></tr>
      <tr><td><strong>Quantity:</strong></td><td>${project.quantity || (project.estimate?.custom_parts || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 'N/A'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Cost Summary</div>
    <table>
      <tr><td>Raw Material Cost</td><td>$${project.estimate?.raw_material_cost || 0}</td></tr>
      <tr><td>Processing Cost</td><td>$${project.estimate?.process_cost || 0}</td></tr>
      <tr><td>Overhead</td><td>$${project.estimate?.overhead_cost || 0}</td></tr>
      <tr><td>Margin (${project.estimate?.margin_percent || 0}%)</td><td>-</td></tr>
      <tr class="total-row"><td><strong>Total Price</strong></td><td><strong>$${project.estimate?.final_price || 0}</strong></td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Terms & Conditions</div>
    <p>1. Quotation valid for 30 days from date of issue.</p>
    <p>2. Payment terms: 50% advance, 50% before dispatch.</p>
    <p>3. Delivery: 4-6 weeks from order confirmation.</p>
    <p>4. All prices are exclusive of taxes.</p>
  </div>

  <div class="footer">
    <p>Generated on ${dayjs().format('YYYY-MM-DD HH:mm:ss')}</p>
  </div>
</body>
</html>`;
  }

  generateWorkOrderHTML(project, companySettings = {}) {
    const companyName = companySettings.name || '';
    const operations = project.workOrder?.operations || [];
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Production Traveler - ${project.workOrder?.production_traveler_number || project.workOrder?.work_order_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .wo-number { font-size: 24px; font-weight: bold; color: #0066cc; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; }
    th { background: #333; color: white; }
    .checkbox { width: 20px; height: 20px; border: 2px solid #333; display: inline-block; }
  </style>
</head>
<body>
  <div class="header">
    <div>${companyName} - WORK ORDER</div>
    <div class="wo-number">${project.workOrder?.work_order_number}</div>
  </div>
  
  <table>
    <tr><td><strong>Project:</strong></td><td>${project.project_name}</td></tr>
    <tr><td><strong>Client:</strong></td><td>${project.client?.client_name}</td></tr>
    <tr><td><strong>Release Date:</strong></td><td>${dayjs(project.workOrder?.release_date).format('YYYY-MM-DD')}</td></tr>
    <tr><td><strong>Material:</strong></td><td>${project.material_type || (project.estimate?.custom_parts || [])[0]?.material || 'N/A'} - ${project.material_grade || (project.estimate?.custom_parts || [])[0]?.material_grade || ''}</td></tr>
    <tr><td><strong>Quantity:</strong></td><td>${project.quantity || (project.estimate?.custom_parts || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 'N/A'}</td></tr>
  </table>

  <h3>Operations</h3>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Operation</th>
        <th>Completed</th>
        <th>Operator</th>
        <th>Date</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${operations.map((op, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${op.description || op.module_type}</td>
        <td><span class="checkbox"></span></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 50px;">
    <p>Supervisor Signature: __________________ Date: __________</p>
  </div>
</body>
</html>`;
  }

  generateProductionTravellerHTML(project) {
    const operations = project.workOrder?.operations || [];
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Production Traveller - ${project.workOrder?.work_order_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
    .header { border: 2px solid #000; padding: 10px; margin-bottom: 20px; }
    .header-row { display: flex; justify-content: space-between; }
    .op-card { border: 1px solid #000; margin: 10px 0; padding: 10px; page-break-inside: avoid; }
    .op-header { background: #ddd; padding: 5px; font-weight: bold; }
    .sign-box { border: 1px solid #000; height: 40px; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-row">
      <div><strong>PRODUCTION TRAVELLER</strong></div>
      <div><strong>WO#:</strong> ${project.workOrder?.work_order_number}</div>
    </div>
    <div class="header-row">
      <div><strong>Project:</strong> ${project.project_name}</div>
      <div><strong>Qty:</strong> ${project.quantity || (project.estimate?.custom_parts || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 'N/A'}</div>
    </div>
    <div class="header-row">
      <div><strong>Material:</strong> ${project.material_type || (project.estimate?.custom_parts || [])[0]?.material || ''} ${project.material_grade || (project.estimate?.custom_parts || [])[0]?.material_grade || ''}</div>
      <div><strong>Heat#:</strong> ${project.heat_number || (project.estimate?.custom_parts || [])[0]?.heat_number || 'N/A'}</div>
    </div>
  </div>

  ${operations.map((op, i) => `
  <div class="op-card">
    <div class="op-header">Operation ${i + 1}: ${op.description || op.module_type.toUpperCase()}</div>
    <table style="width: 100%; margin-top: 10px;">
      <tr>
        <td style="width: 50%;">
          <strong>Instructions:</strong><br>
          ${JSON.stringify(op.inputs || {}, null, 2).replace(/[{}"]/g, '').slice(0, 200)}
        </td>
        <td style="width: 50%;">
          <strong>Operator Initials:</strong>
          <div class="sign-box"></div>
          <strong>Date:</strong> __________
        </td>
      </tr>
    </table>
  </div>
  `).join('')}

  <div style="margin-top: 30px; border-top: 2px solid #000; padding-top: 10px;">
    <strong>Final Inspection:</strong>
    <div class="sign-box" style="width: 200px; display: inline-block;"></div>
    <strong>Date:</strong> __________
  </div>
</body>
</html>`;
  }

  generateCoCHTML(project, companySettings = {}) {
    const companyName = companySettings.name || '';
    const qr = project.qualityRecord;
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Certificate of Conformance - ${project.project_name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 20px; }
    .certificate-title { font-size: 28px; font-weight: bold; margin: 20px 0; }
    .section { margin: 25px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px; vertical-align: top; }
    .check-item { margin: 5px 0; }
    .check-box { display: inline-block; width: 15px; height: 15px; border: 1px solid #000; margin-right: 8px; text-align: center; }
    .checked { background: #000; color: #fff; }
    .signature-section { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #000; margin-top: 50px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size: 24px;">${companyName}</div>
    <div class="certificate-title">CERTIFICATE OF CONFORMANCE</div>
  </div>

  <div class="section">
    <table>
      <tr>
        <td><strong>Certificate No:</strong></td>
        <td>COC-${dayjs().format('YYYYMMDD')}-${project.id.slice(0, 8)}</td>
        <td><strong>Date:</strong></td>
        <td>${dayjs().format('MMMM DD, YYYY')}</td>
      </tr>
      <tr>
        <td><strong>Project:</strong></td>
        <td>${project.project_name}</td>
        <td><strong>Client:</strong></td>
        <td>${project.client?.client_name}</td>
      </tr>
      <tr>
        <td><strong>Material:</strong></td>
        <td>${project.material_type || (project.estimate?.custom_parts || [])[0]?.material || 'N/A'} - ${project.material_grade || (project.estimate?.custom_parts || [])[0]?.material_grade || ''}</td>
        <td><strong>Heat No:</strong></td>
        <td>${project.heat_number || (project.estimate?.custom_parts || [])[0]?.heat_number || 'N/A'}</td>
      </tr>
      <tr>
        <td><strong>Quantity:</strong></td>
        <td>${project.quantity || (project.estimate?.custom_parts || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 'N/A'}</td>
        <td><strong>PO No:</strong></td>
        <td>${project.salesOrder?.customer_po_number || 'N/A'}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h3>Quality Verification</h3>
    <p>This is to certify that the above referenced product has been manufactured and inspected in accordance with applicable specifications and requirements.</p>
    
    <div class="check-item">
      <span class="check-box ${qr?.dimensional_verification ? 'checked' : ''}">---</span>
      Dimensional Verification Complete
    </div>
    <div class="check-item">
      <span class="check-box ${qr?.visual_inspection ? 'checked' : ''}">---</span>
      Visual Inspection Complete
    </div>
    <div class="check-item">
      <span class="check-box ${qr?.hardness_testing ? 'checked' : ''}">---</span>
      Hardness Testing Complete
    </div>
    <div class="check-item">
      <span class="check-box ${qr?.ndt_testing ? 'checked' : ''}">---</span>
      NDT Testing Complete
    </div>
    <div class="check-item">
      <span class="check-box ${qr?.pressure_testing ? 'checked' : ''}">---</span>
      Pressure Testing Complete
    </div>
    <div class="check-item">
      <span class="check-box ${qr?.mtr_verification ? 'checked' : ''}">---</span>
      MTR Verification Complete
    </div>
  </div>

  <div class="section">
    <p><strong>Inspector:</strong> ${qr?.inspector_name || 'N/A'}</p>
    <p><strong>Inspection Date:</strong> ${qr?.inspection_date ? dayjs(qr.inspection_date).format('YYYY-MM-DD') : 'N/A'}</p>
  </div>

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line"></div>
      <div>Quality Manager</div>
    </div>
    <div class="signature-box">
      <div class="signature-line"></div>
      <div>Date</div>
    </div>
  </div>
</body>
</html>`;
  }

  generatePackingListHTML(project, companySettings = {}) {
    const companyName = companySettings.name || '';
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Packing List - ${project.project_name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 8px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; }
    th { background: #f0f0f0; }
    .ship-to { background: #f9f9f9; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>PACKING LIST</h1>
    <div>${companyName}</div>
  </div>

  <table>
    <tr>
      <td><strong>Date:</strong></td>
      <td>${dayjs().format('YYYY-MM-DD')}</td>
      <td><strong>Project:</strong></td>
      <td>${project.project_name}</td>
    </tr>
    <tr>
      <td><strong>SO#:</strong></td>
      <td>${project.salesOrder?.sales_order_number || 'N/A'}</td>
      <td><strong>PO#:</strong></td>
      <td>${project.salesOrder?.customer_po_number || 'N/A'}</td>
    </tr>
  </table>

  <div class="ship-to">
    <strong>SHIP TO:</strong><br>
    ${project.client?.client_name}<br>
    ${project.ship_to_address || project.client?.address || 'N/A'}
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Description</th>
        <th>Material</th>
        <th>Quantity</th>
        <th>Weight (kg)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${project.project_name}</td>
        <td>${project.material_type || (project.estimate?.custom_parts || [])[0]?.material || ''} ${project.material_grade || (project.estimate?.custom_parts || [])[0]?.material_grade || ''}</td>
        <td>${project.quantity || (project.estimate?.custom_parts || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0) || '-'}</td>
        <td>-</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top: 30px;">
    <table>
      <tr>
        <td><strong>Shipment Method:</strong></td>
        <td>${project.shipment_method || 'N/A'}</td>
      </tr>
      <tr>
        <td><strong>Tracking Number:</strong></td>
        <td>${project.tracking_number || 'N/A'}</td>
      </tr>
      <tr>
        <td><strong>Packaging:</strong></td>
        <td>${project.packaging_details || 'Standard packaging'}</td>
      </tr>
    </table>
  </div>

  <div style="margin-top: 50px;">
    <p>Packed By: __________________ Date: __________</p>
    <p>Checked By: __________________ Date: __________</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generate a unique COC Procedure ID: QF-XX (starting from 01, incrementing)
   * Uses the Setting model as a persistent counter store.
   */
  async _getNextCoCSerial(companyId) {
    const counterKey = 'coc_procedure_id_counter';
    let counter = 1;
    try {
      const whereClause = companyId ? { key: counterKey, company_id: companyId } : { key: counterKey };
      const row = await Setting.findOne({ where: whereClause });
      if (row && row.value?.counter) {
        counter = row.value.counter + 1;
      }
      await Setting.upsert({ key: counterKey, company_id: companyId || null, value: { counter } });
    } catch (err) {
      console.error('COC procedure ID counter error:', err.message);
    }
    return `QF-${String(counter).padStart(2, '0')}`;
  }
}

module.exports = new DocumentService();
