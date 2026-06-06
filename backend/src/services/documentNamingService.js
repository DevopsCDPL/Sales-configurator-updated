const { Document } = require('../models');
const { Op } = require('sequelize');

// Month names for DDMonthYY date format
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Format current date as DDMonthYY (e.g. 07April26)
 */
function formatDateForFilename(date) {
  const d = date || new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

// Fixed document type labels (sentence case, exact values only)
const DOCUMENT_TYPES = {
  rfq: 'Rfq',
  quotation: 'Quotation',
  purchase_order: 'Po client',
  po_client: 'Po client',
  vendor_po: 'Po vendor',
  work_order: 'Work order',
  production_traveller: 'Production traveller',
  coc: 'Coc',
  packing_list: 'Packing list',
  invoice: 'Invoice',
  drawing: 'Drawing',
};

// Maps document type to the internal DB document_type value used for version queries
const DB_DOC_TYPES = {
  'Rfq': 'rfq',
  'Quotation': 'quotation',
  'Po client': 'purchase_order',
  'Po vendor': 'vendor_po',
  'Work order': 'work_order',
  'Production traveller': 'production_traveller',
  'Coc': 'coc',
  'Packing list': 'packing_list',
  'Invoice': 'invoice',
  'Drawing': 'drawing',
};

/**
 * Sanitize project name: replace spaces with underscore, remove special characters
 */
function sanitizeProjectName(name) {
  if (!name) return '';
  return name
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Sanitize reference: remove characters that are invalid in filenames
 */
function sanitizeReference(ref) {
  if (!ref) return '';
  return String(ref).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * Resolve the document type label from internal type string
 */
function resolveDocumentType(internalType) {
  const normalized = (internalType || '').toLowerCase().trim();
  return DOCUMENT_TYPES[normalized] || null;
}

/**
 * Calculate the next version for a given document type + project + reference combination.
 * Looks at existing Document records matching the naming pattern.
 */
async function getNextVersion(projectId, docTypeLabel, reference) {
  const dbType = DB_DOC_TYPES[docTypeLabel];
  if (!dbType) return 1;

  const safeRef = sanitizeReference(reference);

  // Find all documents of this type for this project that match the reference
  const existing = await Document.findAll({
    where: {
      project_id: projectId,
      document_type: dbType,
      file_name: { [Op.like]: `%${safeRef}%` },
    },
    order: [['version', 'DESC']],
    attributes: ['version'],
  });

  if (existing.length > 0) {
    return existing[0].version + 1;
  }

  // Fallback: check any document of this type for the project
  const anyExisting = await Document.findOne({
    where: {
      project_id: projectId,
      document_type: dbType,
    },
    order: [['version', 'DESC']],
    attributes: ['version'],
  });

  return anyExisting ? anyExisting.version + 1 : 1;
}

/**
 * Generate a standardized document filename.
 * Format: [DocumentType][ProjectName][PrimaryReference]_V[Version].ext
 *
 * @param {Object} params
 * @param {string} params.documentType - Internal document type (e.g. 'quotation', 'rfq', 'vendor_po')
 * @param {string} params.projectName - Project name from system
 * @param {string} params.reference - Primary reference (PO number, quotation number, etc.)
 * @param {string} params.projectId - Project UUID for version calculation
 * @param {string} [params.extension='.pdf'] - File extension
 * @returns {Promise<{fileName: string, version: number}>}
 * @throws {Error} If reference is missing or document type is invalid
 */
async function generateDocumentName({ documentType, projectName, reference, projectId, extension = '.pdf' }) {
  // Resolve document type label
  const docTypeLabel = resolveDocumentType(documentType);
  if (!docTypeLabel) {
    throw new Error(`Invalid document type: "${documentType}". Allowed types: ${Object.keys(DOCUMENT_TYPES).join(', ')}`);
  }

  // Validate reference is present
  if (!reference || String(reference).trim() === '') {
    throw new Error(`Primary reference is required for document type "${docTypeLabel}". Cannot generate or upload file without a valid reference.`);
  }

  const safeProject = sanitizeProjectName(projectName || 'Project');
  const safeRef = sanitizeReference(reference);

  // Calculate version
  const version = await getNextVersion(projectId, docTypeLabel, reference);

  // Build filename: {Reference}_{ProjectName}_{DDMonthYY}_V{Version}.ext
  const dateStr = formatDateForFilename(new Date());
  const fileName = `${safeRef}_${safeProject}_${dateStr}_V${version}${extension}`;

  return { fileName, version };
}

/**
 * Generate filename synchronously when version is already known.
 * Used when the caller has already determined the version.
 */
function generateDocumentNameSync({ documentType, projectName, reference, version, extension = '.pdf' }) {
  const docTypeLabel = resolveDocumentType(documentType);
  if (!docTypeLabel) {
    throw new Error(`Invalid document type: "${documentType}".`);
  }

  if (!reference || String(reference).trim() === '') {
    throw new Error(`Primary reference is required for document type "${docTypeLabel}".`);
  }

  const safeProject = sanitizeProjectName(projectName || 'Project');
  const safeRef = sanitizeReference(reference);

  const dateStr = formatDateForFilename(new Date());
  const fileName = `${safeRef}_${safeProject}_${dateStr}_V${version}${extension}`;
  return fileName;
}

module.exports = {
  generateDocumentName,
  generateDocumentNameSync,
  resolveDocumentType,
  sanitizeProjectName,
  sanitizeReference,
  formatDateForFilename,
  DOCUMENT_TYPES,
  DB_DOC_TYPES,
};
