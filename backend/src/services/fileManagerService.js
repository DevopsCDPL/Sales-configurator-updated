const { FileManagerFolder, Document, Project, Part, User } = require('../models');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Resolve uploads root (same as documentService)
const UPLOADS_ROOT = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', '..', 'uploads');

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Root folder definitions (matches migration seed & controller) ──────────────
const ROOT_FOLDERS = [
  { name: 'Project Documents', slug: 'project-documents', module_type: 'project', path: '/Project Documents' },
  { name: 'Procurement Documents', slug: 'procurement-documents', module_type: 'procurement', path: '/Procurement Documents' },
  { name: 'Part Master', slug: 'part-master', module_type: 'part_master', path: '/Part Master' },
  { name: 'Inventory', slug: 'inventory', module_type: 'inventory', path: '/Inventory' },
];

// ── Project subfolder definitions ─────────────────────────────────────────────
const PROJECT_SUBFOLDERS = [
  'Project Info', 'Estimation', 'Quotation', 'RFQ', 'PO from Client',
  'PO to Vendor', 'Work Order', 'Production', 'Quality (COC)', 'Logistics',
  'Invoice', 'Documents', 'Analytics', 'Others',
];

// ── Procurement subfolder definitions ─────────────────────────────────────────
const PROCUREMENT_SUBFOLDERS = ['Sent RFQ', 'Received Quotation', 'Approved PO'];

// ── Document type → project subfolder mapping ─────────────────────────────────
const DOC_TYPE_TO_PROJECT_FOLDER = {
  rfq: 'RFQ',
  quotation: 'Quotation',
  purchase_order: 'PO from Client',
  po_client: 'PO from Client',
  sales_order: 'PO from Client',
  work_order: 'Work Order',
  production_traveller: 'Production',
  production: 'Production',
  coc: 'Quality (COC)',
  quality: 'Quality (COC)',
  inspection_report: 'Quality (COC)',
  material_cert: 'Quality (COC)',
  packing_list: 'Logistics',
  tracking_slip: 'Logistics',
  invoice: 'Invoice',
  external_po: 'PO from Client',
  external_coc: 'Quality (COC)',
  vendor_po: 'PO to Vendor',
  vendor_po_quotation: 'PO to Vendor',
  drawing: 'Estimation',
  estimation: 'Estimation',
  project_info: 'Project Info',
  upload: 'Documents',
  other: 'Documents',
};

// ── Document type → procurement subfolder mapping ─────────────────────────────
const DOC_TYPE_TO_PROCUREMENT_FOLDER = {
  vendor_po: 'Approved PO',
  sent_rfq: 'Sent RFQ',
  received_quotation: 'Received Quotation',
};

class FileManagerService {
  /**
   * Initialize 4 root folders (idempotent).
   * Root folders have company_id=null (shared across all companies).
   * _skipTenantScope is required because the tenant hook would otherwise inject
   * the current user's company_id, preventing these null-company rows from being
   * found or created correctly. Explicit company_id: null in WHERE handles scoping.
   */
  async initializeRootFolders() {
    for (const def of ROOT_FOLDERS) {
      await FileManagerFolder.findOrCreate({
        where: { path: def.path, company_id: null }, // INTERNAL_ONLY: root folders are global
        defaults: {
          name: def.name,
          slug: def.slug,
          parent_id: null,
          folder_type: 'root',
          module_type: def.module_type,
          company_id: null,
          path: def.path,
        },
        _skipTenantScope: true,
      });
    }
    logger.info('File manager root folders initialized.');
  }

  /**
   * Create the full folder structure for a new project.
   * Uses the PROJECT NAME as the folder name (NOT the ID).
   */
  async createProjectFolders(projectId, projectName, companyId) {
    // Fetch project name if not provided
    if (!projectName && projectId) {
      const project = await Project.findByPk(projectId, { attributes: ['project_name', 'company_id'] });
      if (project) {
        projectName = project.project_name;
        if (!companyId) companyId = project.company_id;
      }
    }
    if (!projectName) {
      logger.warn({ projectId }, 'FileManager: Cannot create project folders without project name.');
      return null;
    }

    await this.initializeRootFolders();

    const rootPath = '/Project Documents';
    // _skipTenantScope: root folder has company_id=null; must bypass tenant hook injection
    const root = await FileManagerFolder.findOne({
      where: { path: rootPath, company_id: null },
      _skipTenantScope: true,
    });
    if (!root) return null;

    const projPath = `${rootPath}/${projectName}`;
    // Include company_id in where so two companies with same project name get separate folders
    const [projFolder] = await FileManagerFolder.findOrCreate({
      where: { path: projPath, company_id: companyId || null },
      defaults: {
        name: projectName,
        slug: slugify(projectName),
        parent_id: root.id,
        folder_type: 'project',
        module_type: 'project',
        project_id: projectId,
        company_id: companyId || null,
        path: projPath,
      },
      ...(companyId ? {} : { _skipTenantScope: true }),
    });

    for (const sub of PROJECT_SUBFOLDERS) {
      const subPath = `${projPath}/${sub}`;
      await FileManagerFolder.findOrCreate({
        where: { path: subPath, company_id: companyId || null },
        defaults: {
          name: sub,
          slug: slugify(sub),
          parent_id: projFolder.id,
          folder_type: 'subfolder',
          module_type: 'project',
          project_id: projectId,
          company_id: companyId || null,
          path: subPath,
        },
        ...(companyId ? {} : { _skipTenantScope: true }),
      });
      await this._ensureDiskDir(path.join('documents', subPath.replace(/^\//, '')));
    }
    return projFolder;
  }

  /**
   * Create procurement subfolder tree for an RFQ or PO.
   */
  async createProcurementFolders(referenceId, folderName, companyId) {
    await this.initializeRootFolders();

    const rootPath = '/Procurement Documents';
    const root = await FileManagerFolder.findOne({
      where: { path: rootPath, company_id: null },
      _skipTenantScope: true,
    });
    if (!root) return null;

    const procPath = `${rootPath}/${folderName}`;
    const [procFolder] = await FileManagerFolder.findOrCreate({
      where: { path: procPath, company_id: companyId || null },
      defaults: {
        name: folderName,
        slug: slugify(folderName),
        parent_id: root.id,
        folder_type: 'procurement',
        module_type: 'procurement',
        reference_id: referenceId,
        company_id: companyId || null,
        path: procPath,
      },
      ...(companyId ? {} : { _skipTenantScope: true }),
    });

    for (const sub of PROCUREMENT_SUBFOLDERS) {
      const subPath = `${procPath}/${sub}`;
      await FileManagerFolder.findOrCreate({
        where: { path: subPath, company_id: companyId || null },
        defaults: {
          name: sub,
          slug: slugify(sub),
          parent_id: procFolder.id,
          folder_type: 'subfolder',
          module_type: 'procurement',
          reference_id: referenceId,
          company_id: companyId || null,
          path: subPath,
        },
        ...(companyId ? {} : { _skipTenantScope: true }),
      });
      await this._ensureDiskDir(path.join('documents', subPath.replace(/^\//, '')));
    }
    return procFolder;
  }

  /**
   * Resolve the correct FileManagerFolder for a document being stored.
   */
  async resolveFolder(documentType, projectId, partId, companyId) {
    const normalizedType = (documentType || '').toLowerCase().trim();

    // Part drawing → Part Master root (only when partId is explicitly provided)
    if (normalizedType === 'drawing' && partId) {
      return this._resolvePartMasterFolder(partId);
    }

    // Procurement document — hook injects company_id when inside HTTP context
    if (DOC_TYPE_TO_PROCUREMENT_FOLDER[normalizedType]) {
      const subName = DOC_TYPE_TO_PROCUREMENT_FOLDER[normalizedType];
      const folder = await FileManagerFolder.findOne({
        where: { name: subName, module_type: 'procurement' },
        order: [['created_at', 'DESC']],
      });
      return folder;
    }

    // Project-linked document — hook injects company_id when inside HTTP context
    if (projectId && DOC_TYPE_TO_PROJECT_FOLDER[normalizedType]) {
      const subName = DOC_TYPE_TO_PROJECT_FOLDER[normalizedType];
      const folder = await FileManagerFolder.findOne({
        where: {
          name: subName,
          module_type: 'project',
          project_id: projectId,
          folder_type: 'subfolder',
        },
      });
      if (folder) return folder;

      // Auto-create project folders and retry (pass companyId to prevent path collision)
      await this.createProjectFolders(projectId, null, companyId);
      return FileManagerFolder.findOne({
        where: {
          name: subName,
          module_type: 'project',
          project_id: projectId,
          folder_type: 'subfolder',
        },
      });
    }

    // Fallback for project: Quotation subfolder
    if (projectId) {
      const fallback = await FileManagerFolder.findOne({
        where: { name: 'Quotation', project_id: projectId, folder_type: 'subfolder' },
      });
      if (fallback) return fallback;
      await this.createProjectFolders(projectId, null, companyId);
      return FileManagerFolder.findOne({
        where: { name: 'Quotation', project_id: projectId, folder_type: 'subfolder' },
      });
    }

    return null;
  }

  /**
   * Resolve Part Master folder for a part drawing.
   */
  async _resolvePartMasterFolder(partId) {
    await this.initializeRootFolders();
    const root = await FileManagerFolder.findOne({
      where: { path: '/Part Master', company_id: null },
      _skipTenantScope: true,
    });
    if (!root) return null;
    return root;
  }

  /**
   * Get disk-relative file path for a document in a given folder.
   * @param {Object} folder - Folder object with path property
   * @param {string} fileName - File name
   * @param {string} [companyId] - Optional company/tenant ID for new files
   */
  getFilePath(folder, fileName, companyId) {
    // For new files with a company context, use tenant-based path
    const tenantPrefix = companyId ? path.join('tenant', companyId) : '';
    if (!folder || !folder.path) {
      return tenantPrefix
        ? path.join('documents', tenantPrefix, fileName)
        : path.join('documents', fileName);
    }
    const cleanPath = folder.path.replace(/^\//, '');
    return tenantPrefix
      ? path.join('documents', tenantPrefix, cleanPath, fileName)
      : path.join('documents', cleanPath, fileName);
  }

  /**
   * Store a generated/uploaded document record in file_manager with proper versioning.
   *
   * @param {Object} opts
   * @param {string} opts.moduleType - 'project' | 'procurement' | 'part_master' | 'inventory'
   * @param {string} opts.section - 'quotation' | 'rfq' | 'po' | 'work_order' | etc.
   * @param {string} opts.referenceId - project_id | rfq_id | stock_id | part_id
   * @param {string} opts.folderPath - folder path string
   * @param {string} opts.fileName - file name
   * @param {string} opts.filePath - file path on disk
   * @param {number} opts.fileSize - file size in bytes
   * @param {string} opts.fileType - 'generated' | 'uploaded'
   * @param {string} opts.userId - user UUID
   * @param {string} opts.companyId - company UUID
   * @param {string|null} opts.projectId - project UUID (for project module)
   * @param {string|null} opts.folderId - folder UUID
   * @param {string|null} opts.description - description
   * @returns {Promise<Document>}
   */
  async storeDocument(opts) {
    const {
      moduleType, section, referenceId, folderPath, fileName, filePath,
      fileSize, fileType = 'generated', userId, companyId, projectId,
      folderId, description,
    } = opts;

    // Determine version: find existing docs for same reference+section
    const where = { module_type: moduleType, document_type: section };
    if (referenceId) where.reference_id = referenceId;
    if (projectId) where.project_id = projectId;

    const existingDocs = await Document.findAll({
      where,
      order: [['version', 'DESC']],
    });

    let version = 1;
    if (existingDocs.length > 0) {
      version = (existingDocs[0].version || 0) + 1;
      // Mark all previous versions as 'draft'
      const prevIds = existingDocs.map(d => d.id);
      await Document.update(
        { status: 'draft' },
        { where: { id: { [Op.in]: prevIds } } }
      );
    }

    const doc = await Document.create({
      project_id: projectId || null,
      folder_id: folderId || null,
      module_type: moduleType,
      reference_id: referenceId || null,
      document_type: section,
      description: description || fileName,
      file_name: fileName,
      file_path: filePath,
      size: fileSize || 0,
      version,
      status: 'latest',
      file_type: fileType,
      uploaded_by: fileType === 'uploaded' ? userId : null,
      generated_by: fileType === 'generated' ? userId : null,
      company_id: companyId || null,
    });

    return doc;
  }

  /**
   * Get all documents for a project via file manager.
   */
  async getProjectDocuments(projectId, filters = {}) {
    const projectFolders = await FileManagerFolder.findAll({
      where: { project_id: projectId },
      attributes: ['id'],
    });
    const folderIds = projectFolders.map(f => f.id);

    const where = {
      [Op.or]: [
        ...(folderIds.length > 0 ? [{ folder_id: { [Op.in]: folderIds } }] : []),
        { project_id: projectId },
      ],
    };
    if (filters.part_id) where.part_id = filters.part_id;
    if (filters.workflow_stage) where.workflow_stage = filters.workflow_stage;

    const documents = await Document.findAll({
      where,
      include: [
        { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
        { model: FileManagerFolder, as: 'folder', attributes: ['id', 'name', 'path'] },
      ],
      order: [['version', 'DESC'], ['generated_at', 'DESC']],
    });

    return documents;
  }

  /**
   * Get folder tree structure for display (all 4 roots with children).
   */
  async getFolderTree() {
    const roots = await FileManagerFolder.findAll({
      where: { folder_type: 'root' },
      include: [{
        model: FileManagerFolder,
        as: 'children',
        include: [{
          model: FileManagerFolder,
          as: 'children',
        }],
      }],
      order: [['name', 'ASC']],
    });
    return roots;
  }

  /**
   * Get documents in a specific folder.
   */
  async getFolderDocuments(folderId) {
    return Document.findAll({
      where: { folder_id: folderId },
      include: [
        { model: User, as: 'generatedBy', attributes: ['id', 'name'] },
      ],
      order: [['version', 'DESC'], ['generated_at', 'DESC']],
    });
  }

  /** Ensure a directory exists on disk */
  async _ensureDiskDir(relativePath) {
    const fullPath = path.join(UPLOADS_ROOT, relativePath);
    await fs.mkdir(fullPath, { recursive: true });
  }
}

// ── Central File Save Function (FM-REAL PHASE 1) ─────────────────────────────
// This function is NOT yet integrated anywhere. It exists as a ready-to-use
// central pipeline for saving files into the File Manager system.

const MODULE_FOLDER_NAMES = {
  project: (refId) => `Project-${refId}`,
  procurement: (refId) => `Procurement-${refId}`,
  part_master: (refId) => `Part-${refId}`,
  inventory: (refId) => `Inventory-${refId}`,
};

async function saveFileToFileManager({
  module_type,
  section,
  reference_id,
  file,
  isGenerated,
  user,
}) {
  logger.debug({ module_type, section, reference_id, userId: user?.id, companyId: user?.company_id }, 'saveFileToFileManager called');

  // ── project_root — only ensure project folders exist, no document ──────
  if (section === 'project_root') {
    try {
      await fileManagerServiceInstance.createProjectFolders(reference_id, null, user?.company_id);
    } catch (e) {
      logger.warn({ err: e.message, projectId: reference_id }, 'createProjectFolders skipped');
    }
    return { document: null, folder: { rootFolder: null, sectionFolder: null } };
  }

  // ── Resolve proper folder via FileManagerService ──────────────────────
  // Maps section names to document_type keys used by resolveFolder
  const sectionToDocType = {
    quotation: 'quotation',
    work_order: 'work_order',
    production: 'production_traveller',
    quality: 'coc',
    logistics: 'packing_list',
    invoice: 'invoice',
    po: 'purchase_order',
    rfq: 'rfq',
    received_quotation: 'received_quotation',
    approved_po: 'vendor_po',
  };
  const docTypeKey = sectionToDocType[section] || section;
  const projectId = module_type === 'project' ? reference_id : null;
  const partId = module_type === 'part_master' ? reference_id : null;
  let sectionFolder = null;
  try {
    sectionFolder = await fileManagerServiceInstance.resolveFolder(docTypeKey, projectId, partId, user?.company_id);
  } catch (e) {
    logger.warn({ err: e.message }, 'resolveFolder failed');
  }

  logger.debug({ folderId: sectionFolder?.id, folderName: sectionFolder?.name }, 'resolveFolder result');

  // ── Skip document creation if file is null or has no real path ─────────
  // When saveGeneratedPdf already created the document record, avoid duplicates
  const file_path = file?.path || file?.file_path || '';
  const file_name = file?.originalname || file?.file_name || file?.filename || 'unknown';

  if (!file || !file_path) {
    // No real file on disk. For generated PDFs, still create a Document record
    // so the file appears in File Manager tabs (procurement, part_master, etc.)
    if (isGenerated && file_name && file_name !== 'unknown') {
      // Check for existing document to avoid duplicates
      const existingGenDoc = await Document.findOne({
        where: { reference_id: reference_id || null, module_type, file_name },
        order: [['created_at', 'DESC']],
      });
      if (existingGenDoc) {
        if (sectionFolder && !existingGenDoc.folder_id) {
          await existingGenDoc.update({ folder_id: sectionFolder.id });
        }
        return { document: existingGenDoc, folder: { rootFolder: null, sectionFolder } };
      }

      // Create a new Document for this generated file
      const genDoc = await Document.create({
        file_name,
        file_path: `generated/${file_name}`,
        module_type,
        document_type: section,
        reference_id: reference_id || null,
        project_id: projectId,
        version: 1,
        status: 'latest',
        file_type: 'generated',
        company_id: user?.company_id || null,
        generated_by: user?.id || null,
        generated_at: new Date(),
        folder_id: sectionFolder?.id || null,
        size: file?.size || 0,
      });
      return { document: genDoc, folder: { rootFolder: null, sectionFolder } };
    }

    // Non-generated file with no path — just link existing doc to folder
    if (sectionFolder && reference_id) {
      try {
        const latestDoc = await Document.findOne({
          where: {
            reference_id,
            module_type,
            folder_id: null,
          },
          order: [['created_at', 'DESC']],
        });
        if (latestDoc) {
          await latestDoc.update({ folder_id: sectionFolder.id });
        }
      } catch (_) { /* non-critical */ }
    }
    return { document: null, folder: { rootFolder: null, sectionFolder } };
  }

  // ── Check for existing document to avoid duplicates ────────────────────
  const existingDoc = await Document.findOne({
    where: {
      reference_id,
      module_type,
      file_name,
    },
    order: [['created_at', 'DESC']],
  });

  if (existingDoc) {
    // Update folder_id linkage if missing
    if (sectionFolder && !existingDoc.folder_id) {
      await existingDoc.update({ folder_id: sectionFolder.id });
    }
    return { document: existingDoc, folder: { rootFolder: null, sectionFolder } };
  }

  // ── Versioning ──────────────────────────────────────────────────────────
  const existingCount = await Document.count({
    where: { reference_id, document_type: section, module_type },
  });
  const version = existingCount + 1;

  // ── Insert into Document table ──────────────────────────────────────────
  const document = await Document.create({
    file_name,
    file_path,
    module_type,
    document_type: section,
    reference_id,
    project_id: projectId,
    version,
    status: isGenerated ? 'latest' : 'draft',
    file_type: isGenerated ? 'generated' : 'uploaded',
    company_id: user?.company_id || null,
    uploaded_by: isGenerated ? null : user?.id,
    generated_by: isGenerated ? user?.id : null,
    folder_id: sectionFolder?.id || null,
    size: file?.size || 0,
  });

  // ── Sync file to R2 cloud storage (fire-and-forget, non-blocking) ──────
  try {
    const r2 = require('./r2StorageService');
    if (r2.isConfigured && file_path && !file_path.startsWith('generated/')) {
      const absPath = require('path').isAbsolute(file_path)
        ? file_path
        : require('path').join(__dirname, '..', '..', file_path);
      const companyId = user?.company_id || null;
      r2.syncFileToR2(absPath, { companyId, projectId: projectId || null, section: section || 'documents' })
        .then((r2Key) => {
          // Store r2_url on the document record (best-effort)
          if (r2Key && document.id) {
            document.update({ r2_url: r2Key }).catch(() => {});
          }
        })
        .catch(err => logger.error({ err: err.message }, '[R2] saveFileToFileManager sync failed'));
    }
  } catch (r2Err) {
    logger.warn({ err: r2Err.message }, '[R2] saveFileToFileManager R2 setup error');
  }

  return {
    document,
    folder: { rootFolder: null, sectionFolder },
  };
}

const fileManagerServiceInstance = new FileManagerService();
fileManagerServiceInstance.saveFileToFileManager = saveFileToFileManager;

module.exports = fileManagerServiceInstance;
module.exports.saveFileToFileManager = saveFileToFileManager;
