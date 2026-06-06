/**
 * Work Order Data Mapper
 *
 * Provides structured Work Order data for document generation.
 *
 * FUTURE DESIGN NOTE:
 * This mapper will become the single source of truth for Work Order document
 * data in Forge i-DAS. Work Order PDFs should call getWorkOrderData() instead
 * of directly reading from work order or project modules.
 */

/**
 * Get structured Work Order data for a given project.
 *
 * @param {string} projectId
 * @returns {Promise<import('./documentDataTypes').WorkOrderData | null>}
 */
async function getWorkOrderData(projectId) {
  // TODO: Implement data aggregation from work order, project, and client modules
  // For now, return null as a placeholder — not connected to any module.
  return null;
}

module.exports = { getWorkOrderData };
