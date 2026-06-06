/**
 * Unified File Service — PHASE S1
 *
 * SINGLE ENTRY POINT for ALL file handling in the system.
 *
 * Flow:  Buffer → R2 Upload → Document Record → File Manager Registration
 *
 * NO route or controller should handle file logic directly.
 * ALL must call this service.
 */

const path = require('path');
const { v4: uuidv4 } = require('uuid');
const r2 = require('./r2StorageService');
const fileManagerService = require('./fileManagerService');
const { Document, FileManagerFolder, Project, Company } = require('../models');
const { Op } = require('sequelize');

// ── R2 Key Structure ─────────────────────────────────────────────
//
// FLAT structure:
//   {CompanyName_CompanyID} / {ProjectName_ProjectID} / uploaded|generated / {filename}
//
// Non-project files (inventory, procurement, master data):
//   {CompanyName_CompanyID} / uploaded|generated / {filename}
//
// Name_ID format — ALWAYS use Name_ID, never bare numbers/UUIDs.
// ────────────────────────────────────────────────────────────────

// Legacy stage map kept ONLY for workflow_stage metadata on Document records
const STAGE_PATH_MAP = {
  drawing:              ['estimation', 'drawings'],
  quotation:            ['quotation'],
  purchase_order:       ['po_client'],
  sales_order:          ['po_client'],
  rfq:                  ['procurement', 'rfq'],
  rfq_quotation:        ['procurement', 'rfq'],
  vendor_po:            ['procurement', 'po'],
  vendor_po_quotation:  ['procurement', 'po'],
  work_order:           ['work_order'],
  production_traveller: ['production', 'traveler'],
  coc:                  ['quality', 'coc'],
  quality:              ['quality'],
  inspection_report:    ['quality', 'certificates'],
  material_cert:        ['quality', 'certificates'],
  packing_list:         ['logistics', 'packing_list'],
  tracking_slip:        ['logistics', 'tracking'],
  invoice:              ['invoice'],
  other:                ['documents'],
};

/**
 * Sanitise a string for use as an R2 path segment.
 */
function sanitiseSegment(str) {
  if (!str) return 'unknown';
  return String(str).replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').trim() || 'unknown';
}

/**
 * Build the standardized R2 key using the FLAT folder structure.
 *
 * Structure:
 *   {CompanyName_CompanyID} / {ProjectName_ProjectID} / uploaded|generated / {filename}
 *
 * Non-project files:
 *   {CompanyName_CompanyID} / uploaded|generated / {filename}
 *
 * @param {object} opts
 * @param {string}      opts.tenantId      - company_id (UUID)
 * @param {string|null} opts.companyName   - company name (for readable folder)
 * @param {string|null} opts.companyCode   - company code e.g. CMP-0001
 * @param {string|null} opts.projectId     - project UUID (required for project-scoped files)
 * @param {string|null} opts.projectName   - project name (for readable folder)
 * @param {string|null} opts.projectNumber - project number e.g. PRJ1000-2026
 * @param {string|null} opts.partId        - (ignored — kept for backward compat)
 * @param {string}      opts.moduleType    - 'project' | 'inventory' | 'procurement' | 'part_master'
 * @param {string}      opts.section       - document_type / section key (e.g. 'quotation', 'coc')
 * @param {string|null} opts.referenceId   - (ignored — kept for backward compat)
 * @param {boolean}     opts.isGenerated   - true = system-generated, false = user-uploaded
 * @param {string}      opts.fileName      - final filename
 * @returns {string} full R2 object key
 */
function buildStandardR2Key({ tenantId, companyName, companyCode, projectId, projectName, projectNumber, partId, moduleType, section, referenceId, isGenerated, fileName }) {
  const s = sanitiseSegment;
  const origin = isGenerated ? 'generated' : 'uploaded';

  // Build Company folder: "CompanyName_CompanyCode" — Name_ID format
  let companyFolder;
  if (companyName && companyCode) {
    companyFolder = s(`${companyName}_${companyCode}`);
  } else if (companyName && tenantId) {
    companyFolder = s(`${companyName}_${tenantId}`);
  } else if (companyName) {
    companyFolder = s(companyName);
  } else {
    companyFolder = s(tenantId || 'default');
  }

  // Build Project folder: "ProjectName_ProjectNumber" — Name_ID format
  let projectFolder;
  if (projectName && projectNumber) {
    projectFolder = s(`${projectName}_${projectNumber}`);
  } else if (projectName && projectId) {
    projectFolder = s(`${projectName}_${projectId}`);
  } else if (projectName) {
    projectFolder = s(projectName);
  } else if (projectId) {
    projectFolder = s(projectId);
  } else {
    projectFolder = null;
  }

  // ── Project-scoped files: CompanyFolder/ProjectFolder/origin/filename
  if (projectFolder) {
    return [companyFolder, projectFolder, origin, fileName].join('/');
  }

  // ── Non-project files: CompanyFolder/origin/filename
  return [companyFolder, origin, fileName].join('/');
}

/**
 * Generate a standardized filename.
 * Prepends a timestamp to ensure uniqueness while keeping the original name readable.
 *
 * @param {string} originalName - Original filename from upload or generation
 * @returns {string}
 */
function generateStandardFilename(originalName) {
  if (!originalName) originalName = 'file';
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const ts = Date.now();
  return `${ts}-${base}${ext}`;
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════

/**
 * Process a file through the unified pipeline.
 *
 * REQUIRED INPUT:
 * @param {object} opts
 * @param {Buffer} opts.buffer        - File content as a Buffer
 * @param {string} opts.originalName  - Original filename
 * @param {string} opts.mimetype      - MIME type of the file
 * @param {number} opts.size          - File size in bytes
 * @param {string} opts.module_type   - 'project' | 'procurement' | 'inventory' | 'part_master'
 * @param {string} opts.section       - Document type / section (e.g. 'quotation', 'certificate', 'drawing')
 * @param {string|null} opts.reference_id - Generic FK (project_id, stock_id, part_id, rfq_id)
 * @param {string|null} opts.project_id   - Project UUID (may differ from reference_id)
 * @param {string|null} opts.part_id      - Part UUID (for part_master docs)
 * @param {object} opts.user          - { id, company_id }
 * @param {boolean} opts.isGenerated  - true for system-generated files, false for uploads
 * @param {string|null} [opts.description]    - Optional description
 * @param {string|null} [opts.standardizedName] - Pre-computed filename (skip generateStandardFilename)
 *
 * REQUIRED OUTPUT:
 * @returns {Promise<{document_id: string, file_url: string, file_name: string, folder_path: string|null}>}
 *
 * FAILURE HANDLING:
 * - If R2 upload fails → throws error, does NOT create Document record
 */
async function processFile({
  buffer,
  originalName,
  mimetype,
  size,
  module_type,
  section,
  reference_id,
  project_id,
  part_id,
  user,
  isGenerated = false,
  description,
  standardizedName,
}) {
  // ── Validate required inputs ──────────────────────────────────
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('UnifiedFileService: buffer is required and must be a Buffer');
  }
  if (!module_type) {
    throw new Error('UnifiedFileService: module_type is required');
  }
  if (!section) {
    throw new Error('UnifiedFileService: section is required');
  }

  const userId = user?.id || null;
  let companyId = user?.company_id || null;
  const fileName = standardizedName || generateStandardFilename(originalName);
  const fileSize = size || buffer.length;

  // ── Resolve readable names for R2 folder structure ────────────
  let companyName = null, companyCode = null;
  let projectName = null, projectNumber = null;

  if (companyId) {
    try {
      const company = await Company.findByPk(companyId, { attributes: ['name', 'company_code'], raw: true });
      if (company) {
        companyName = company.name || null;
        companyCode = company.company_code || null;
      }
    } catch (err) {
      console.warn('[UnifiedFileService] Company lookup for R2 path failed:', err.message);
    }
  }

  if (project_id) {
    try {
      const project = await Project.findByPk(project_id, { attributes: ['project_name', 'project_number', 'company_id'], raw: true });
      if (project) {
        projectName = project.project_name || null;
        projectNumber = project.project_number || null;
        // Fall back to project's company_id when user has none (super-admin / platform-admin uploads).
        // Without this, the Document is saved with company_id=NULL and filtered out by the tenant scope hook.
        if (!companyId && project.company_id) {
          companyId = project.company_id;
        }
      }
    } catch (err) {
      console.warn('[UnifiedFileService] Project lookup for R2 path failed:', err.message);
    }
  }

  // ── STEP 1: Upload to R2 ─────────────────────────────────────
  const r2Key = buildStandardR2Key({
    tenantId: companyId,
    companyName,
    companyCode,
    projectId: project_id,
    projectName,
    projectNumber,
    partId: part_id,
    moduleType: module_type,
    section,
    referenceId: reference_id,
    isGenerated,
    fileName,
  });

  // STRICT: If R2 upload fails, do NOT proceed. Throw error.
  let storedR2Key;
  if (r2.isConfigured) {
    try {
      storedR2Key = await r2.upload(buffer, r2Key, mimetype || r2.mimeFromExt(fileName));
    } catch (err) {
      throw new Error(`UnifiedFileService: R2 upload failed — ${err.message}`);
    }
  } else {
    // R2 not configured — fall back to local disk for dev/testing
    storedR2Key = null;
    console.warn('[UnifiedFileService] R2 not configured, saving to local disk only');
  }

  // ── Also save to local disk for backward compatibility ────────
  const UPLOADS_ROOT = process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.join(__dirname, '..', '..', 'uploads');

  // Build a relative file_path for the Document record
  const relativeDir = path.join('documents', module_type, section);
  const relativePath = path.join(relativeDir, fileName);
  const fullDiskPath = path.join(UPLOADS_ROOT, relativePath);

  try {
    const fs = require('fs').promises;
    await fs.mkdir(path.dirname(fullDiskPath), { recursive: true });
    await fs.writeFile(fullDiskPath, buffer);
  } catch (diskErr) {
    console.warn('[UnifiedFileService] Local disk write failed (non-blocking):', diskErr.message);
    // Non-blocking: R2 is the primary storage. Local disk is a cache.
  }

  // ── STEP 2: Resolve File Manager folder ───────────────────────
  let folder = null;
  try {
    const docTypeKey = section;
    const projectIdForFolder = module_type === 'project' ? (project_id || reference_id) : null;
    const partIdForFolder = module_type === 'part_master' ? (part_id || reference_id) : null;
    folder = await fileManagerService.resolveFolder(docTypeKey, projectIdForFolder, partIdForFolder, companyId);
  } catch (err) {
    console.warn('[UnifiedFileService] resolveFolder failed:', err.message);
  }

  // For inventory documents, ensure the /Inventory root exists
  if (!folder && module_type === 'inventory') {
    try {
      folder = await FileManagerFolder.findOne({ where: { path: '/Inventory' } });
      if (!folder) {
        folder = await FileManagerFolder.create({
          name: 'Inventory', slug: 'inventory', module_type: 'inventory',
          path: '/Inventory', parent_id: null, folder_type: 'root',
        });
      }
    } catch (_) {}
  }

  // ── STEP 3: Handle versioning ─────────────────────────────────
  const versionWhere = {
    module_type,
    document_type: section,
  };
  if (reference_id) versionWhere.reference_id = reference_id;
  if (project_id) versionWhere.project_id = project_id;

  const existingDocs = await Document.findAll({
    where: versionWhere,
    order: [['version', 'DESC']],
  });

  let version = 1;
  if (existingDocs.length > 0) {
    version = (existingDocs[0].version || 0) + 1;
    // Mark previous versions as 'draft'
    const prevIds = existingDocs.map(d => d.id);
    await Document.update(
      { status: 'draft' },
      { where: { id: { [Op.in]: prevIds } } }
    );
  }

  // ── STEP 4: Create Document record ────────────────────────────
  // Compute workflow_stage from the STAGE_PATH_MAP (same lookup used by key builder)
  const workflowStageSegments = STAGE_PATH_MAP[section] || ['documents'];
  const workflowStage = workflowStageSegments.join('/');

  const docPayload = {
    project_id: project_id || null,
    folder_id: folder?.id || null,
    module_type,
    reference_id: reference_id || null,
    part_id: part_id || null,
    workflow_stage: workflowStage,
    document_type: section,
    description: description || originalName || fileName,
    file_name: fileName,
    file_path: relativePath.replace(/\\/g, '/'),
    size: fileSize,
    version,
    status: 'latest',
    file_type: isGenerated ? 'generated' : 'uploaded',
    uploaded_by: isGenerated ? null : userId,
    generated_by: isGenerated ? userId : null,
    generated_at: isGenerated ? new Date() : null,
    company_id: companyId || null,
    r2_url: storedR2Key || null,
  };

  let document;
  try {
    document = await Document.create(docPayload);
  } catch (dbErr) {
    console.error('[FILES] Document.create failed — module:', module_type, 'section:', section, 'code:', dbErr.parent?.code || dbErr.name);
    throw dbErr;
  }

  // ── Build output ──────────────────────────────────────────────
  return {
    document_id: document.id,
    file_url: storedR2Key || relativePath.replace(/\\/g, '/'),
    file_name: fileName,
    folder_path: folder?.path || null,
    document,  // full record for callers that need it
  };
}

/**
 * Process a generated PDF through the unified pipeline.
 * Convenience wrapper over processFile for system-generated PDFs.
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer     - PDF buffer
 * @param {string} opts.fileName   - Standardized filename (already computed by naming service)
 * @param {string} opts.project_id - Project UUID
 * @param {string} opts.section    - Document type (e.g. 'quotation', 'work_order', 'coc')
 * @param {string|null} opts.userId  - User who triggered generation
 * @param {string|null} opts.companyId - Company UUID
 * @param {string|null} [opts.part_id] - Part UUID (if document is scoped to a part)
 * @param {string|null} [opts.description]
 * @returns {Promise<{document_id, file_url, file_name, folder_path, document}>}
 */
async function processGeneratedPdf({
  buffer,
  fileName,
  project_id,
  part_id,
  section,
  userId,
  companyId,
  description,
}) {
  return processFile({
    buffer,
    originalName: fileName,
    mimetype: 'application/pdf',
    size: buffer.length,
    module_type: 'project',
    section,
    reference_id: project_id,
    project_id,
    part_id: part_id || null,
    user: { id: userId, company_id: companyId },
    isGenerated: true,
    standardizedName: fileName,
    description,
  });
}

/**
 * Process an uploaded multer file (memory storage) through the unified pipeline.
 * Convenience wrapper for route handlers using multer memoryStorage.
 *
 * @param {object} multerFile - req.file from multer (memory storage: has .buffer, .originalname, .mimetype, .size)
 * @param {object} opts       - Same as processFile minus buffer/originalName/mimetype/size
 * @returns {Promise<{document_id, file_url, file_name, folder_path, document}>}
 */
async function processUpload(multerFile, opts) {
  if (!multerFile || !multerFile.buffer) {
    throw new Error('UnifiedFileService: multerFile with buffer is required (use memory storage)');
  }
  return processFile({
    buffer: multerFile.buffer,
    originalName: multerFile.originalname,
    mimetype: multerFile.mimetype,
    size: multerFile.size,
    ...opts,
    isGenerated: false,
  });
}

module.exports = {
  processFile,
  processGeneratedPdf,
  processUpload,
  buildStandardR2Key,
  generateStandardFilename,
};
