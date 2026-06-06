/**
 * Document Snapshot Service
 *
 * Provides functions to create and retrieve point-in-time snapshots of
 * document data. Snapshots freeze the data at the moment a document is
 * generated so that reprints always reflect the original values.
 *
 * FUTURE DESIGN NOTE:
 * In production, createDocumentSnapshot will persist the snapshot to the
 * database (e.g. a document_snapshots table) and getDocumentSnapshot will
 * retrieve it. This ensures documents remain consistent even if underlying
 * project data changes after generation.
 *
 * Currently these functions are placeholders — they do NOT connect to any
 * database or external service.
 */

/**
 * Create a point-in-time snapshot of document data.
 *
 * @param {string} projectId  - The project to snapshot
 * @param {string} documentType - e.g. 'rfq', 'vendor_po', 'work_order', 'production', 'coc', 'invoice'
 * @returns {Promise<import('./documentDataTypes').DocumentSnapshot | null>}
 */
async function createDocumentSnapshot(projectId, documentType) {
  // TODO: Aggregate data via DocumentDataMapper, persist to database
  // Placeholder — not connected to any database or module.
  return null;
}

/**
 * Retrieve an existing document snapshot.
 *
 * @param {string} projectId  - The project whose snapshot to retrieve
 * @param {string} documentType - e.g. 'rfq', 'vendor_po', 'work_order', 'production', 'coc', 'invoice'
 * @returns {Promise<import('./documentDataTypes').DocumentSnapshot | null>}
 */
async function getDocumentSnapshot(projectId, documentType) {
  // TODO: Query database for the stored snapshot
  // Placeholder — not connected to any database or module.
  return null;
}

module.exports = { createDocumentSnapshot, getDocumentSnapshot };
