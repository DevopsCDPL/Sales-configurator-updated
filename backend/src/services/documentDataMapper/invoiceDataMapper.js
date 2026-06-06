/**
 * Invoice Data Mapper
 *
 * Provides structured Invoice data for document generation.
 *
 * FUTURE DESIGN NOTE:
 * This mapper will become the single source of truth for Invoice document
 * data in Forge i-DAS. Invoice PDFs should call getInvoiceData() instead
 * of directly reading from invoice, project, or client modules.
 */

/**
 * Get structured Invoice data for a given project.
 *
 * @param {string} projectId
 * @returns {Promise<import('./documentDataTypes').InvoiceData | null>}
 */
async function getInvoiceData(projectId) {
  // TODO: Implement data aggregation from invoice, project, and client modules
  // For now, return null as a placeholder — not connected to any module.
  return null;
}

module.exports = { getInvoiceData };
