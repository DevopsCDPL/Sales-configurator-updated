const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { Document, FileManagerFolder, Project, Part, Stock, Company, User, Client, ProcurementRFQ, ProcurementPO, RFQBundle, VendorPurchaseOrder, MgmtProcurementRFQ, MgmtProcurementPO, VendorPO, sequelize } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');
const logger = require('../utils/logger');

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the R2 prefix for the user's company.
 * Platform admins (no company_id) return null → means "allow all".
 * Returns the prefix string like "CompanyName_Code/" or null.
 */
async function resolveCompanyR2Prefix(req) {
  const companyId = req.activeCompanyId || req.user?.company_id;
  if (!companyId) return null; // platform admin — no restriction

  const company = await Company.findByPk(companyId, { attributes: ['id', 'name', 'company_code'] });
  if (!company) return undefined; // company not found — deny

  const r2 = require('../services/r2StorageService');
  const raw = company.company_code
    ? `${company.name}_${company.company_code}`
    : company.name;
  return r2.sanitiseFolderName(raw) + '/';
}

/**
 * Verify an R2 key belongs to the user's company.
 * Returns { allowed: true } or { allowed: false, status, message }.
 */
async function verifyR2KeyOwnership(req, key) {
  const prefix = await resolveCompanyR2Prefix(req);
  if (prefix === undefined) return { allowed: false, status: 404, message: 'Company not found' };
  if (prefix === null) return { allowed: true }; // platform admin
  if (!key.startsWith(prefix)) return { allowed: false, status: 403, message: 'Access denied — file belongs to another company' };
  return { allowed: true };
}

/**
 * Build all R2 key candidates for a Document record.
 * Covers both naming conventions used in the codebase:
 *   - unifiedFileService: CompanyName_Code/ProjectName_Num/uploaded|generated/filename
 *   - r2StorageService:   CompanyName_Code/ProjectName_Num/Uploaded|Generated/filename
 */
async function buildDocR2Candidates(doc) {
  const r2 = require('../services/r2StorageService');
  const candidates = [];

  if (doc.r2_url) candidates.push(doc.r2_url);

  if (doc.company_id || doc.project_id) {
    try {
      const names = await r2.resolveNames(doc.company_id || null, doc.project_id || null);
      const { buildStandardR2Key } = require('../services/unifiedFileService');
      const fname = doc.file_name || path.basename(doc.file_path || '');

      const baseOpts = {
        tenantId:      doc.company_id  || null,
        companyName:   names.companyName   || null,
        companyCode:   names.companyCode   || null,
        projectId:     doc.project_id  || null,
        projectName:   names.projectName   || null,
        projectNumber: names.projectNumber || null,
        partId:        null,
        moduleType:    'project',
        section:       doc.document_type || 'documents',
        referenceId:   null,
        fileName:      fname,
      };
      // unifiedFileService format (lowercase)
      candidates.push(buildStandardR2Key({ ...baseOpts, isGenerated: false }));
      candidates.push(buildStandardR2Key({ ...baseOpts, isGenerated: true }));

      if (names.companyName || names.projectName) {
        const ids = {
          companyId:     doc.company_id     || null,
          companyCode:   names.companyCode  || null,
          projectId:     doc.project_id     || null,
          projectNumber: names.projectNumber || null,
        };
        // r2StorageService format (capitalized)
        candidates.push(r2.buildR2Key(names.companyName, names.projectName, 'Generated', fname, ids));
        candidates.push(r2.buildR2Key(names.companyName, names.projectName, 'Uploaded',  fname, ids));
      }
    } catch (_) { /* non-critical */ }
  }

  // Legacy flat key
  const legacyKey = r2.keyFromDbPath(doc.file_path) || r2.keyFromDbPath(doc.file_name);
  if (legacyKey) candidates.push(legacyKey);

  return candidates;
}

// ── Delegate to fileManagerService — correct tenant isolation lives there ──
const fileManagerService = require('../services/fileManagerService');

async function ensureRootFolders() {
  await fileManagerService.initializeRootFolders();
}

async function ensureProjectFolders(projectId, projectName, companyId) {
  return fileManagerService.createProjectFolders(projectId, projectName, companyId);
}

async function ensureProcurementFolders(referenceId, folderName, companyId) {
  return fileManagerService.createProcurementFolders(referenceId, folderName, companyId);
}

// ══════════════════════════════════════════════════════════════════
//  CONTROLLER
// ══════════════════════════════════════════════════════════════════
class FileManagerController {

  // ── GET /file-manager/tree ─────────────────────────────────────
  async getTree(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      try {
        await ensureRootFolders();
      } catch (rootErr) {
        logger.warn({ err: rootErr.message }, 'ensureRootFolders failed (non-blocking)');
      }

      const where = {};
      if (companyId) {
        // Setting company_id at the top level prevents the tenant hook from injecting
        // its own value and overriding this OR expression.
        // Op.or: [companyId, null] → (company_id = 'uuid' OR company_id IS NULL)
        // This returns the company's own folders AND shared root folders (company_id=null).
        where.company_id = { [Op.or]: [companyId, null] };
      }

      const folders = await FileManagerFolder.findAll({
        where,
        order: [['path', 'ASC']],
        include: [
          { model: Project, as: 'project', attributes: ['id', 'project_name'] },
        ],
      });

      res.json({ success: true, data: folders });
    } catch (err) {
      logger.error({ err: err.message }, 'getTree error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/folders/:id ──────────────────────────────
  async getFolderContents(req, res) {
    try {
      const folder = await FileManagerFolder.findByPk(req.params.id, {
        include: [
          {
            model: FileManagerFolder,
            as: 'children',
            order: [['name', 'ASC']],
            include: [{ model: Project, as: 'project', attributes: ['id', 'project_name'] }],
          },
          {
            model: Document,
            as: 'documents',
            include: [
              { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
              { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
            ],
            order: [['version', 'DESC']],
          },
        ],
      });
      if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });
      // Verify tenant access for company-scoped folders
      if (folder.company_id && !verifyTenantRecord(req, folder)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: folder });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/folders/by-path?path=... ─────────────────
  async getFolderByPath(req, res) {
    try {
      const folderPath = req.query.path;
      if (!folderPath) return res.status(400).json({ success: false, message: 'path query param required' });

      // Ensure root folders exist before querying
      try { await ensureRootFolders(); } catch (_) {}

      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      const folderWhere = { path: folderPath };
      if (companyId) {
        folderWhere.company_id = { [Op.or]: [companyId, null] };
      }

      const folder = await FileManagerFolder.findOne({
        where: folderWhere,
        include: [
          {
            model: FileManagerFolder,
            as: 'children',
            order: [['name', 'ASC']],
            include: [{ model: Project, as: 'project', attributes: ['id', 'project_name'] }],
          },
          {
            model: Document,
            as: 'documents',
            include: [
              { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
              { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
            ],
          },
        ],
      });
      if (!folder) return res.status(404).json({ success: false, message: 'Folder not found' });
      // Verify tenant access for company-scoped folders
      if (folder.company_id && !verifyTenantRecord(req, folder)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: folder });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/documents?module_type=...&reference_id=... ──
  async getDocuments(req, res) {
    try {
      const where = {};
      if (req.query.module_type) where.module_type = req.query.module_type;
      if (req.query.reference_id) where.reference_id = req.query.reference_id;
      if (req.query.project_id) where.project_id = req.query.project_id;
      if (req.query.folder_id) where.folder_id = req.query.folder_id;
      if (req.query.document_type) where.document_type = req.query.document_type;
      if (req.query.part_id) where.part_id = req.query.part_id;
      if (req.query.workflow_stage) where.workflow_stage = req.query.workflow_stage;

      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      if (companyId) {
        where.company_id = companyId;
      }

      let documents = await Document.findAll({
        where,
        order: [['created_at', 'DESC']],
        include: [
          { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
          { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
          { model: FileManagerFolder, as: 'folder', attributes: ['id', 'name', 'path'] },
        ],
      });

      // ── Lazy backfill: if procurement tab has 0 docs, create them from existing RFQs/POs ──
      if (req.query.module_type === 'procurement' && documents.length === 0) {
        try {
          // Find MgmtProcurement RFQs without Document records
          const rfqs = await MgmtProcurementRFQ.findAll({
            attributes: ['id', 'rfq_number', 'company_id'],
            where: { deleted_at: null },
          });
          for (const r of rfqs) {
            if (!r.company_id) continue;
            const exists = await Document.findOne({ where: { module_type: 'procurement', reference_id: r.id } });
            if (!exists) {
              await Document.create({
                module_type: 'procurement',
                reference_id: r.id,
                document_type: 'sent_rfq',
                file_name: `${r.rfq_number || 'RFQ'}.pdf`,
                file_path: `generated/${r.rfq_number || 'RFQ'}.pdf`,
                status: 'latest',
                file_type: 'generated',
                company_id: r.company_id,
                size: 0,
              });
            }
          }
          // Find MgmtProcurement POs without Document records
          const pos = await MgmtProcurementPO.findAll({
            attributes: ['id', 'po_number', 'company_id'],
            where: { deleted_at: null },
          });
          for (const p of pos) {
            if (!p.company_id) continue;
            const exists = await Document.findOne({ where: { module_type: 'procurement', reference_id: p.id } });
            if (!exists) {
              await Document.create({
                module_type: 'procurement',
                reference_id: p.id,
                document_type: 'approved_po',
                file_name: `${p.po_number || 'PO'}.pdf`,
                file_path: `generated/${p.po_number || 'PO'}.pdf`,
                status: 'latest',
                file_type: 'generated',
                company_id: p.company_id,
                size: 0,
              });
            }
          }
          // Re-query after backfill
          documents = await Document.findAll({
            where,
            order: [['created_at', 'DESC']],
            include: [
              { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
              { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
              { model: FileManagerFolder, as: 'folder', attributes: ['id', 'name', 'path'] },
            ],
          });
          logger.info({ count: documents.length }, 'Lazy backfill: created procurement documents');
        } catch (backfillErr) {
          logger.warn({ err: backfillErr.message }, 'Lazy procurement backfill failed');
        }
      }

      // ── Batch-fetch reference_name for each module_type ──────────
      const refIdsByModule = {};
      documents.forEach(d => {
        const mt = d.module_type;
        // For project docs, always use project_id (reference_id may be RFQ/quotation/WO UUID)
        const rid = (mt === 'project' && d.project_id) ? d.project_id : (d.reference_id || d.project_id);
        if (mt && rid) {
          if (!refIdsByModule[mt]) refIdsByModule[mt] = new Set();
          refIdsByModule[mt].add(rid);
        }
      });

      const nameMap = {};

      // Project → project_name
      if (refIdsByModule.project) {
        try {
          const ids = [...refIdsByModule.project];
          const rows = await Project.findAll({ where: { id: ids }, attributes: ['id', 'project_name'] });
          rows.forEach(r => { nameMap[r.id] = r.project_name; });
        } catch (_) {}
      }

      // Procurement → rfq_number OR po_number (cascade through all procurement models)
      if (refIdsByModule.procurement) {
        const ids = [...refIdsByModule.procurement];
        // 1) ProcurementRFQ
        try {
          const rfqs = await ProcurementRFQ.findAll({ where: { id: ids }, attributes: ['id', 'rfq_number'] });
          rfqs.forEach(r => { nameMap[r.id] = r.rfq_number; });
        } catch (_) {}
        // 2) ProcurementPO
        let unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const pos = await ProcurementPO.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'po_number'] });
            pos.forEach(p => { nameMap[p.id] = p.po_number; });
          } catch (_) {}
        }
        // 3) RFQBundle (multi-part RFQ system)
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const bundles = await RFQBundle.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'rfq_number'] });
            bundles.forEach(b => { nameMap[b.id] = b.rfq_number; });
          } catch (_) {}
        }
        // 4) VendorPurchaseOrder
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const vpos = await VendorPurchaseOrder.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'po_number'] });
            vpos.forEach(p => { nameMap[p.id] = p.po_number; });
          } catch (_) {}
        }
        // 5) MgmtProcurementRFQ
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const mgmtRfqs = await MgmtProcurementRFQ.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'rfq_number'] });
            mgmtRfqs.forEach(r => { nameMap[r.id] = r.rfq_number; });
          } catch (_) {}
        }
        // 6) MgmtProcurementPO
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const mgmtPos = await MgmtProcurementPO.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'po_number'] });
            mgmtPos.forEach(p => { nameMap[p.id] = p.po_number; });
          } catch (_) {}
        }
        // 7) VendorPO (legacy)
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const vpos2 = await VendorPO.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'po_number'] });
            vpos2.forEach(p => { nameMap[p.id] = p.po_number; });
          } catch (_) {}
        }
        // 8) Fallback: check Project for legacy docs with project_id as reference_id
        unresolvedIds = ids.filter(id => !nameMap[id]);
        if (unresolvedIds.length) {
          try {
            const fallbackProjects = await Project.findAll({ where: { id: unresolvedIds }, attributes: ['id', 'project_name'] });
            fallbackProjects.forEach(p => { nameMap[p.id] = p.project_name; });
          } catch (_) {}
        }
      }

      // Part Master → part_name
      if (refIdsByModule.part_master) {
        try {
          const ids = [...refIdsByModule.part_master];
          const rows = await Part.findAll({ where: { id: ids }, attributes: ['id', 'part_name'] });
          rows.forEach(r => { nameMap[r.id] = r.part_name; });
        } catch (_) {}
      }

      // Inventory → part_description
      if (refIdsByModule.inventory) {
        try {
          const ids = [...refIdsByModule.inventory];
          const rows = await Stock.findAll({ where: { id: ids }, attributes: ['id', 'part_description'] });
          rows.forEach(r => { nameMap[r.id] = r.part_description; });
        } catch (_) {}
      }

      // Enrich each document with reference_name
      const enriched = documents.map(d => {
        const plain = d.toJSON();
        // For project docs, prefer project_id lookup (reference_id may be a sub-entity UUID)
        if (d.module_type === 'project' && d.project_id) {
          plain.reference_name = nameMap[d.project_id] || nameMap[d.reference_id] || null;
        } else {
          plain.reference_name = nameMap[d.reference_id] || nameMap[d.project_id] || null;
        }
        return plain;
      });

      res.json({ success: true, data: enriched });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── POST /file-manager/upload ──────────────────────────────────
  async uploadFile(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

      const { folder_id, module_type, reference_id, document_type, description } = req.body;
      const { processUpload } = require('../services/unifiedFileService');

      const result = await processUpload(req.file, {
        module_type: module_type || 'project',
        section: document_type || 'upload',
        reference_id: reference_id || null,
        project_id: req.body.project_id || null,
        part_id: req.body.part_id || null,
        user: req.user,
        description: description || req.file.originalname,
      });

      // If a specific folder_id was provided, update the document to point there
      if (folder_id && result.document) {
        await result.document.update({ folder_id });
      }

      res.status(201).json({ success: true, data: result.document });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── PATCH /file-manager/documents/:id/status ───────────────────
  async updateDocumentStatus(req, res) {
    try {
      const { status } = req.body;
      if (!['draft', 'approved', 'latest'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      const doc = await Document.findByPk(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
      if (!verifyTenantRecord(req, doc)) return res.status(403).json({ success: false, message: 'Access denied' });

      await doc.update({ status });
      res.json({ success: true, data: doc });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/documents/:id/download ───────────────────
  async downloadFile(req, res) {
    try {
      const doc = await Document.findByPk(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
      if (!verifyTenantRecord(req, doc)) return res.status(403).json({ success: false, message: 'Access denied' });

      // Try multiple strategies to locate the file on disk
      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      const candidates = [
        path.resolve(doc.file_path),
        path.join(uploadsDir, doc.file_path),
        path.join(uploadsDir, 'documents', doc.file_name),
        path.join(uploadsDir, doc.file_name),
      ];
      const filePath = candidates.find(p => fs.existsSync(p));
      if (filePath) {
        return res.download(filePath, doc.file_name);
      }

      // R2 fallback — try all key candidates (both naming conventions)
      const r2 = require('../services/r2StorageService');
      if (r2.isConfigured) {
        const keyCandidates = await buildDocR2Candidates(doc);
        for (const key of keyCandidates) {
          try {
            const { buffer, contentType } = await r2.download(key);
            if (doc.r2_url !== key) {
              doc.update({ r2_url: key }).catch(() => {});
            }
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
            return res.send(buffer);
          } catch { /* not in R2 with this key */ }
        }
      }

      return res.status(404).json({ success: false, message: 'File not found on disk' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/documents/:id/view ───────────────────────
  async viewFile(req, res) {
    try {
      const doc = await Document.findByPk(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
      if (!verifyTenantRecord(req, doc)) return res.status(403).json({ success: false, message: 'Access denied' });

      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      const candidates = [
        path.resolve(doc.file_path),
        path.join(uploadsDir, doc.file_path),
        path.join(uploadsDir, 'documents', doc.file_name),
        path.join(uploadsDir, doc.file_name),
      ];
      const filePath = candidates.find(p => fs.existsSync(p));

      const ext = path.extname(doc.file_name || filePath || '').toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      if (filePath) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
        return fs.createReadStream(filePath).pipe(res);
      }

      // R2 fallback — try all key candidates (both naming conventions)
      const r2 = require('../services/r2StorageService');
      if (r2.isConfigured) {
        const keyCandidates = await buildDocR2Candidates(doc);
        for (const key of keyCandidates) {
          try {
            const { buffer, contentType: r2Type } = await r2.download(key);
            if (doc.r2_url !== key) {
              doc.update({ r2_url: key }).catch(() => {});
            }
            res.setHeader('Content-Type', r2Type || contentType);
            res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
            return res.send(buffer);
          } catch { /* not in R2 with this key */ }
        }
      }

      return res.status(404).json({ success: false, message: 'File not found on disk' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/view-by-path?file=... ────────────────────
  async viewFileByPath(req, res) {
    try {
      const filePath = req.query.file;
      if (!filePath) return res.status(400).json({ success: false, message: 'file query param required' });

      // Sanitize: prevent directory traversal
      const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
      if (normalized.includes('..')) {
        return res.status(400).json({ success: false, message: 'Invalid file path' });
      }

      const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
      const cleanPath = normalized.replace(/^\/?(uploads\/)?/, '');
      const fullPath = path.join(uploadsDir, cleanPath);

      if (!fullPath.startsWith(uploadsDir)) {
        return res.status(400).json({ success: false, message: 'Invalid file path' });
      }

      // Tenant isolation: verify file belongs to requesting user's company
      const user = req.user || {};
      const isPlatformAdmin = user.role === 'platform_admin';
      if (!isPlatformAdmin && user.company_id) {
        const { Op } = require('sequelize');
        const doc = await Document.findOne({
          where: {
            [Op.or]: [
              { file_path: cleanPath },
              { file_path: `/uploads/${cleanPath}` },
              { file_path: `uploads/${cleanPath}` },
              { file_path: filePath },
            ],
          },
          attributes: ['id', 'company_id'],
        });
        if (doc && doc.company_id && doc.company_id !== user.company_id) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
      }

      if (!fullPath.startsWith(uploadsDir)) {
        return res.status(400).json({ success: false, message: 'Invalid file path' });
      }

      const ext = path.extname(cleanPath).toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileName = path.basename(cleanPath);

      if (fs.existsSync(fullPath)) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        return fs.createReadStream(fullPath).pipe(res);
      }

      // R2 fallback
      const r2 = require('../services/r2StorageService');
      if (r2.isConfigured) {
        const key = r2.keyFromDbPath(cleanPath);
        if (key) {
          try {
            const { buffer, contentType: r2Type } = await r2.download(key);
            res.setHeader('Content-Type', r2Type || contentType);
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            return res.send(buffer);
          } catch { /* not in R2 */ }
        }
      }

      return res.status(404).json({ success: false, message: 'File not found on disk' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── DELETE /file-manager/documents/:id ─────────────────────────
  async deleteFile(req, res) {
    try {
      const doc = await Document.findByPk(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
      if (!verifyTenantRecord(req, doc)) return res.status(403).json({ success: false, message: 'Access denied' });

      // Try to remove physical file using multiple path strategies
      try {
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        const candidates = [
          path.resolve(doc.file_path),
          path.join(uploadsDir, doc.file_path),
          path.join(uploadsDir, 'documents', doc.file_name),
          path.join(uploadsDir, doc.file_name),
        ];
        for (const fp of candidates) {
          if (fs.existsSync(fp)) { fs.unlinkSync(fp); break; }
        }
      } catch (_) { /* non-critical */ }

      // Also remove from R2
      const r2 = require('../services/r2StorageService');
      if (r2.isConfigured) {
        const key = r2.keyFromDbPath(doc.file_path) || r2.keyFromDbPath(doc.file_name);
        if (key) r2.remove(key).catch(() => {});
      }

      await doc.destroy();
      res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── POST /file-manager/ensure-project-folders ──────────────────
  async ensureProjectFolders(req, res) {
    try {
      const { project_id, project_name, company_id } = req.body;
      if (!project_id || !project_name) {
        return res.status(400).json({ success: false, message: 'project_id and project_name required' });
      }
      await ensureProjectFolders(project_id, project_name, company_id || req.user?.company_id);
      res.json({ success: true, message: 'Project folders ensured' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── POST /file-manager/ensure-procurement-folders ──────────────
  async ensureProcurementFolders(req, res) {
    try {
      const { reference_id, folder_name, company_id } = req.body;
      if (!reference_id || !folder_name) {
        return res.status(400).json({ success: false, message: 'reference_id and folder_name required' });
      }
      await ensureProcurementFolders(reference_id, folder_name, company_id || req.user?.company_id);
      res.json({ success: true, message: 'Procurement folders ensured' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/parts ────────────────────────────────────
  // Part Master — show ALL parts, with drawing document info if available
  async getPartMasterDocuments(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;

      // 1. Fetch all parts
      const partWhere = {};
      if (companyId) partWhere[Op.or] = [{ company_id: companyId }, { company_id: null }];
      const allParts = await Part.findAll({
        where: partWhere,
        order: [['created_at', 'DESC']],
        attributes: ['id', 'part_id_seq', 'part_name', 'part_number', 'description', 'drawing_url', 'company_id', 'created_by', 'created_at'],
        include: [{ model: Client, as: 'client', attributes: ['id', 'client_name'], required: false }],
      });

      // 2. Fetch existing part_master documents — index by reference_id AND filename
      const docByPartId = {};
      const docByFilename = {};
      try {
        const docWhere = { module_type: 'part_master' };
        if (companyId) {
          docWhere[Op.or] = [{ company_id: companyId }, { company_id: null }];
        }
        const documents = await Document.findAll({
          where: docWhere,
          order: [['created_at', 'DESC']],
          include: [
            { model: User, as: 'uploadedBy', attributes: ['id', 'name'], required: false },
          ],
        });
        documents.forEach(d => {
          if (d.reference_id && !docByPartId[d.reference_id]) {
            docByPartId[d.reference_id] = d;
          }
          // Index by filename for fallback matching (orphan docs with reference_id=null)
          const fname = (d.file_name || '').split('/').pop() || (d.file_path || '').split('/').pop();
          if (fname && !docByFilename[fname]) {
            docByFilename[fname] = d;
          }
        });
      } catch (docErr) {
        logger.error({ err: docErr.message }, 'getPartMasterDocuments: doc fetch failed');
      }

      // 3. Sync: match orphan docs by filename, or create new Document records
      let partMasterFolder = null;
      try { partMasterFolder = await FileManagerFolder.findOne({ where: { path: '/Part Master' } }); } catch (_) {}

      for (const p of allParts) {
        if (docByPartId[p.id] || !p.drawing_url) continue;

        const drawingFilename = p.drawing_url.split('/').pop() || '';

        // Try filename match (catches orphan docs with reference_id=null)
        if (drawingFilename && docByFilename[drawingFilename]) {
          const orphan = docByFilename[drawingFilename];
          try {
            if (!orphan.reference_id) await orphan.update({ reference_id: p.id });
          } catch (e) { logger.warn({ err: e.message }, 'getPartMasterDocuments: orphan link failed'); }
          docByPartId[p.id] = orphan;
          continue;
        }

        // No document at all — create one from drawing_url
        if (!p.company_id) continue;
        try {
          const drawingRelPath = p.drawing_url.replace(/^\/uploads\//, '');
          const doc = await Document.create({
            folder_id: partMasterFolder?.id || null,
            module_type: 'part_master',
            reference_id: p.id,
            document_type: 'drawing',
            file_name: drawingFilename || 'drawing.pdf',
            file_path: drawingRelPath || p.drawing_url,
            size: 0,
            version: 1,
            status: 'latest',
            file_type: 'uploaded',
            uploaded_by: null,
            company_id: p.company_id,
          });
          docByPartId[p.id] = doc;
        } catch (createErr) {
          logger.warn({ partIdSeq: p.part_id_seq, err: createErr.message }, 'getPartMasterDocuments: doc create failed');
        }
      }

      // 4. Build response — fallback to drawing_url info if no Document exists
      const data = allParts.map(p => {
        const part = p.toJSON();
        const doc = docByPartId[p.id];
        let docInfo = null;
        if (doc) {
          const d = doc.toJSON ? doc.toJSON() : doc;
          docInfo = {
            id: d.id,
            file_name: d.file_name,
            file_path: d.file_path,
            size: d.size,
            uploaded_by: d.uploadedBy || null,
            created_at: d.created_at,
          };
        } else if (part.drawing_url) {
          // Fallback: Part has a drawing but no Document record could be found/created
          docInfo = {
            id: null,
            file_name: part.drawing_url.split('/').pop() || 'drawing.pdf',
            file_path: part.drawing_url,
            size: null,
            uploaded_by: null,
            created_at: part.created_at,
          };
        }
        return {
          part_id: part.id,
          part_id_seq: part.part_id_seq,
          part_name: part.part_name,
          part_number: part.part_number,
          description: part.description,
          client: part.client,
          drawing_url: part.drawing_url,
          created_at: part.created_at,
          document: docInfo,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      logger.error({ err }, 'getPartMasterDocuments error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/inventory ────────────────────────────────
  // Inventory documents — flat table with stock info
  async getInventoryDocuments(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      const where = { module_type: 'inventory' };
      if (companyId) {
        where[Op.or] = [{ company_id: companyId }, { company_id: null }];
      }

      const documents = await Document.findAll({
        where,
        order: [['created_at', 'DESC']],
        include: [
          { model: User, as: 'uploadedBy', attributes: ['id', 'name'] },
          { model: FileManagerFolder, as: 'folder', attributes: ['id', 'name', 'path'] },
        ],
      });

      // Also find stocks with certificate_url that may not have a Document record
      const stockWhere = { certificate_url: { [Op.ne]: null } };
      if (companyId) stockWhere[Op.or] = [{ company_id: companyId }, { company_id: null }];
      const allStocksWithCert = await Stock.findAll({
        where: stockWhere,
        attributes: ['id', 'stock_id', 'part_description', 'quantity', 'certificate_url'],
      });

      // Build map of stocks already covered by Document records
      const docRefIds = new Set(documents.map(d => d.reference_id).filter(Boolean));

      // Fetch stock info for existing document references
      const stockIds = [...docRefIds];
      const stocks = stockIds.length ? await Stock.findAll({
        where: { id: stockIds },
        attributes: ['id', 'stock_id', 'part_description', 'quantity', 'certificate_url'],
      }) : [];
      const stockMap = {};
      stocks.forEach(s => { stockMap[s.id] = s; });

      const enriched = documents.map(d => {
        const plain = d.toJSON();
        const stock = stockMap[d.reference_id];
        plain.stock = stock ? stock.toJSON() : null;
        if (stock) {
          plain.stock.status = stock.quantity > 10 ? 'In Stock' : stock.quantity > 0 ? 'Low Stock' : 'No Stock';
        }
        plain.reference_name = stock?.part_description || null;
        return plain;
      });

      // Add synthetic entries for stocks with certificate_url but no Document record
      for (const s of allStocksWithCert) {
        if (!docRefIds.has(s.id)) {
          const fileName = s.certificate_url.split('/').pop() || 'certificate';
          enriched.push({
            id: `stock-cert-${s.id}`,
            file_name: fileName,
            file_path: s.certificate_url,
            module_type: 'inventory',
            document_type: 'certificate',
            reference_id: s.id,
            status: 'latest',
            file_type: 'uploaded',
            created_at: null,
            stock: {
              id: s.id,
              stock_id: s.stock_id,
              part_description: s.part_description,
              quantity: s.quantity,
              status: s.quantity > 10 ? 'In Stock' : s.quantity > 0 ? 'Low Stock' : 'No Stock',
            },
            reference_name: s.part_description || null,
          });
        }
      }

      res.json({ success: true, data: enriched });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/projects ─────────────────────────────────
  // Returns all projects with file_count, last_activity, status for the
  // File Manager → Project Documents table.
  async getProjects(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      const where = { deleted_at: null };
      if (companyId) {
        where[Op.or] = [{ company_id: companyId }, { company_id: null }];
      }

      const projects = await Project.findAll({
        where,
        attributes: [
          'id', 'project_name', 'project_number', 'reference_id',
          'status', 'created_at', 'updated_at',
        ],
        include: [{ model: Client, as: 'client', attributes: ['id', 'client_name'], required: false }],
        order: [['created_at', 'DESC']],
      });

      // Gather file counts and last activity per project in one query
      const docStats = await sequelize.query(`
        SELECT project_id,
               COUNT(*)::int AS file_count,
               MAX(created_at) AS last_activity
        FROM documents
        WHERE project_id IS NOT NULL
        GROUP BY project_id
      `, { type: sequelize.QueryTypes.SELECT });

      const statsMap = {};
      for (const row of docStats) {
        statsMap[row.project_id] = { file_count: row.file_count, last_activity: row.last_activity };
      }

      const data = projects.map(p => {
        const plain = p.toJSON ? p.toJSON() : p;
        return {
          ...plain,
          client_name: plain.client?.client_name || null,
          file_count: statsMap[plain.id]?.file_count || 0,
          last_activity: statsMap[plain.id]?.last_activity || plain.updated_at || plain.created_at,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      logger.error({ err: err.message }, 'getProjects error');
      res.status(500).json({ success: false, message: err.message });
    }
  }
  // ── GET /file-manager/browse?prefix=... ──────────────────────────
  // Browse R2 folders — returns folders and files at the given prefix level
  async browseR2(req, res) {
    try {
      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }
      const prefix = req.query.prefix || '';

      // Verify company ownership of the prefix being browsed
      if (prefix) {
        const ownership = await verifyR2KeyOwnership(req, prefix);
        if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });
      } else {
        // Empty prefix = browsing root — restrict to company prefix
        const companyPrefix = await resolveCompanyR2Prefix(req);
        if (companyPrefix) {
          const { folders, files } = await r2.listPrefix(companyPrefix);
          return res.json({ success: true, data: { folders, files } });
        }
      }

      const { folders, files } = await r2.listPrefix(prefix);
      res.json({ success: true, data: { folders, files } });
    } catch (err) {
      logger.error({ err: err.message }, 'browseR2 error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/r2/view?key=... ──────────────────────────
  // View a file directly from R2 by key (inline)
  async viewByKey(req, res) {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ success: false, message: 'key query param required' });

      // Verify company ownership
      const ownership = await verifyR2KeyOwnership(req, key);
      if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });

      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }

      const { buffer, contentType } = await r2.download(key);
      const fileName = path.basename(key);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      return res.send(buffer);
    } catch (err) {
      logger.error({ err: err.message }, 'viewByKey error');
      res.status(404).json({ success: false, message: 'File not found in R2' });
    }
  }

  // ── GET /file-manager/r2/download?key=... ──────────────────────
  // Download a file directly from R2 by key (attachment)
  async downloadByKey(req, res) {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ success: false, message: 'key query param required' });

      // Verify company ownership
      const ownership = await verifyR2KeyOwnership(req, key);
      if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });

      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }

      const { buffer, contentType } = await r2.download(key);
      const fileName = path.basename(key);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    } catch (err) {
      logger.error({ err: err.message }, 'downloadByKey error');
      res.status(404).json({ success: false, message: 'File not found in R2' });
    }
  }

  // ── DELETE /file-manager/r2/file?key=... ───────────────────────
  // Delete a file directly from R2 by key + optionally its Document record
  async deleteByKey(req, res) {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ success: false, message: 'key query param required' });

      // Verify company ownership
      const ownership = await verifyR2KeyOwnership(req, key);
      if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });

      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }

      await r2.remove(key);

      // Also remove matching Document record if exists
      try {
        const doc = await Document.findOne({ where: { r2_url: key } });
        if (doc) await doc.destroy();
      } catch (_) { /* non-critical */ }

      res.json({ success: true, message: 'File deleted from R2' });
    } catch (err) {
      logger.error({ err: err.message }, 'deleteByKey error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/r2/signed-url?key=...&disposition=inline|attachment ──
  // Returns a short-lived presigned R2 URL after verifying company ownership
  async getSignedUrl(req, res) {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ success: false, message: 'key query param required' });

      const ownership = await verifyR2KeyOwnership(req, key);
      if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });

      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }

      const expiresIn = 60; // 60 seconds — short-lived for security
      const url = await r2.getPresignedUrl(key, expiresIn);
      logger.info({ userId: req.user.id, companyId: req.user.company_id, key }, 'files: signed URL generated');
      res.json({ success: true, url, expiresIn });
    } catch (err) {
      logger.error({ err: err.message }, 'getSignedUrl error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/r2/projects ────────────────────────────────
  // Returns all DB projects for the company with their computed R2 prefix.
  // Falls back gracefully if R2 is not configured or listing fails.
  async r2Projects(req, res) {
    try {
      const r2 = require('../services/r2StorageService');

      const companyId = req.activeCompanyId || req.user?.company_id;
      if (!companyId) {
        return res.status(400).json({ success: false, message: 'No company context' });
      }

      const company = await Company.findByPk(companyId, { attributes: ['id', 'name', 'company_code'] });
      if (!company) {
        return res.status(404).json({ success: false, message: 'Company not found' });
      }

      // Build R2 company prefix using the same Name_ID logic as buildR2Key /
      // ensureProjectFolder so the prefix always matches where files are stored.
      // Rule: use company_code when available, otherwise fall back to company UUID.
      const companySegmentRaw = company.company_code
        ? `${company.name}_${company.company_code}`
        : `${company.name}_${company.id}`;
      const companyPrefix = r2.sanitiseFolderName(companySegmentRaw) + '/';

      // Fetch all active DB projects for this company — source of truth
      const dbProjects = await Project.findAll({
        where: { deleted_at: null, company_id: companyId },
        attributes: ['id', 'project_name', 'project_number'],
        order: [['created_at', 'DESC']],
      });

      // Map each DB project to its expected R2 prefix using the same Name_ID
      // logic as buildR2Key: use project_number when available, otherwise UUID.
      const projects = dbProjects.map(p => {
        const projRaw = p.project_number
          ? `${p.project_name}_${p.project_number}`
          : `${p.project_name}_${p.id}`;
        const projFolder = r2.sanitiseFolderName(projRaw);
        return { name: p.project_name, prefix: `${companyPrefix}${projFolder}/`, project_id: p.id };
      });

      res.json({ success: true, data: { companyPrefix, projects } });
    } catch (err) {
      logger.error({ err: err.message }, 'r2Projects error');
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── GET /file-manager/r2/project-files?project=<prefix> ─────────
  // Returns uploaded and generated files for a given project R2 prefix
  async r2ProjectFiles(req, res) {
    try {
      const r2 = require('../services/r2StorageService');
      if (!r2.isConfigured) {
        return res.status(503).json({ success: false, message: 'R2 storage not configured' });
      }

      const projectPrefix = req.query.project;
      if (!projectPrefix) {
        return res.status(400).json({ success: false, message: 'project query param required' });
      }

      // Verify project prefix belongs to the user's company
      const ownership = await verifyR2KeyOwnership(req, projectPrefix);
      if (!ownership.allowed) return res.status(ownership.status).json({ success: false, message: ownership.message });

      // Check both lowercase (unifiedFileService) and capitalized (r2StorageService) variants
      const [uploadedLower, generatedLower, uploadedUpper, generatedUpper] = await Promise.all([
        r2.listPrefix(projectPrefix + 'uploaded/'),
        r2.listPrefix(projectPrefix + 'generated/'),
        r2.listPrefix(projectPrefix + 'Uploaded/'),
        r2.listPrefix(projectPrefix + 'Generated/'),
      ]);

      function dedupFiles(arrs) {
        const seen = new Set();
        return arrs.flatMap(r => r.files || []).filter(f => {
          if (seen.has(f.key)) return false;
          seen.add(f.key);
          return true;
        });
      }

      res.json({
        success: true,
        data: {
          uploaded: dedupFiles([uploadedLower, uploadedUpper]),
          generated: dedupFiles([generatedLower, generatedUpper]),
        },
      });
    } catch (err) {
      logger.error({ err: err.message }, 'r2ProjectFiles error');
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

// Export helpers for use by other controllers
module.exports = new FileManagerController();
module.exports.ensureProjectFolders = ensureProjectFolders;
module.exports.ensureProcurementFolders = ensureProcurementFolders;
module.exports.ensureRootFolders = ensureRootFolders;
