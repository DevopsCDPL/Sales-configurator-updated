/**
 * RFQ Data Mapper
 *
 * Provides structured RFQ data for document generation.
 *
 * FUTURE DESIGN NOTE:
 * This mapper will become the single source of truth for RFQ document data
 * in Forge i-DAS. RFQ PDFs should call getRFQData() instead of directly
 * reading from estimation or quotation modules.
 */

/**
 * Get structured RFQ data for a given project.
 *
 * @param {string} projectId
 * @returns {Promise<import('./documentDataTypes').RFQData | null>}
 */
async function getRFQData(projectId) {
  // TODO: Implement data aggregation from project, vendor, and estimation modules
  // For now, return null as a placeholder — not connected to any module.
  return null;
}

module.exports = { getRFQData };
