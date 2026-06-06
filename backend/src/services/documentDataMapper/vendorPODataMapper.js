/**
 * Vendor PO Data Mapper
 *
 * Provides structured Vendor Purchase Order data for document generation.
 *
 * FUTURE DESIGN NOTE:
 * This mapper will become the single source of truth for Vendor PO document
 * data in Forge i-DAS. Vendor PO PDFs should call getVendorPOData() instead
 * of directly reading from procurement or vendor modules.
 */

/**
 * Get structured Vendor PO data for a given project.
 *
 * @param {string} projectId
 * @returns {Promise<import('./documentDataTypes').VendorPOData | null>}
 */
async function getVendorPOData(projectId) {
  // TODO: Implement data aggregation from vendor procurement and material modules
  // For now, return null as a placeholder — not connected to any module.
  return null;
}

module.exports = { getVendorPOData };
