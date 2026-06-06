/**
 * COC (Certificate of Conformance) Data Mapper
 *
 * Provides structured COC data for document generation.
 *
 * FUTURE DESIGN NOTE:
 * This mapper will become the single source of truth for COC document data
 * in Forge i-DAS. COC PDFs should call getCOCData() instead of directly
 * reading from quality or production modules.
 */

/**
 * Get structured COC data for a given project.
 *
 * @param {string} projectId
 * @returns {Promise<import('./documentDataTypes').COCData | null>}
 */
async function getCOCData(projectId) {
  // TODO: Implement data aggregation from quality and production modules
  // For now, return null as a placeholder — not connected to any module.
  return null;
}

module.exports = { getCOCData };
