'use strict';
const db = require('../../models');
const { num, arr } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').ProductionData | null>} */
async function getProductionData(projectId) {
  if (!projectId) return null;
  const wo = await db.WorkOrder.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  if (!wo) return null;
  const ops = arr(wo.operations);
  return {
    productionTravellerId: wo.production_traveler_number || '',
    machine: '',
    operator: '',
    sawCutOrBarFeed: '',
    items: ops.map((o) => ({ operation: o.operation || o.name || o.description || '', quantity: num(o.quantity, 1), status: o.status || '' })),
  };
}
module.exports = { getProductionData };
