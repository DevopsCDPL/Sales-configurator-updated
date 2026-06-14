'use strict';
const db = require('../../models');
const { num } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').COCData | null>} */
async function getCOCData(projectId) {
  if (!projectId) return null;
  const project = await db.Project.findByPk(projectId);
  if (!project) return null;
  const qr = await db.QualityRecord.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  const wo = await db.WorkOrder.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  let serials = [];
  const idj = qr && qr.inspection_data_json;
  if (idj && Array.isArray(idj.serialNumbers)) serials = idj.serialNumbers;
  else if (idj && Array.isArray(idj.serials)) serials = idj.serials;
  return {
    cocNumber: qr ? ('COC-' + String(qr.id).slice(0, 8)) : '',
    productionId: (wo && wo.production_traveler_number) || '',
    productDescription: project.project_name || '',
    revision: project.revision || project.selected_revision || '',
    quantity: num(project.quantity, 1),
    serialNumbers: serials.map(String),
    materialHeatNumber: project.heat_number || '',
  };
}
module.exports = { getCOCData };
