'use strict';
const db = require('../../models');
const { isoDate, num, arr } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').WorkOrderData | null>} */
async function getWorkOrderData(projectId) {
  if (!projectId) return null;
  const project = await db.Project.findByPk(projectId);
  if (!project) return null;
  const client = project.client_id ? await db.Client.findByPk(project.client_id).catch(() => null) : null;
  const wo = await db.WorkOrder.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  const ops = arr(wo && wo.operations);
  const items = ops.length
    ? ops.map((o) => ({ description: o.description || o.name || o.operation || '', quantity: num(o.quantity, num(project.quantity, 1)), requirements: o.requirements || o.notes || '' }))
    : [{ description: project.project_name || '', quantity: num(project.quantity, 1), requirements: (wo && wo.special_instructions) || '' }];
  return {
    workOrderNumber: (wo && wo.work_order_number) || '',
    projectName: project.project_name || '',
    clientName: (client && client.client_name) || '',
    preparedBy: (wo && wo.prepared_by) || project.prepared_by || '',
    approvedBy: (wo && wo.approved_by) || '',
    issueDate: isoDate((wo && (wo.release_date || wo.created_at)) || project.created_at),
    items,
    qualityRequirements: (wo && wo.quality_requirements) || '',
  };
}
module.exports = { getWorkOrderData };
