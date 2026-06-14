'use strict';
const db = require('../../models');
const { isoDate, num } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').RFQData | null>} */
async function getRFQData(projectId) {
  if (!projectId) return null;
  const project = await db.Project.findByPk(projectId).catch(() => null);
  const rfqs = await db.VendorRFQ.findAll({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => []);
  if (!rfqs.length) {
    return project ? { rfqNumber: '', projectName: project.project_name || '', vendor: '', rfqDate: '', items: [], instructions: '' } : null;
  }
  const first = rfqs[0];
  const vendor = first.vendor_id ? await db.Vendor.findByPk(first.vendor_id).catch(() => null) : null;
  const items = await Promise.all(rfqs.map(async (r) => {
    let desc = '';
    if (r.material_id && db.Material) {
      const m = await db.Material.findByPk(r.material_id).catch(() => null);
      desc = (m && (m.material_name || m.name || m.description)) || ('Material ' + String(r.material_id).slice(0, 8));
    }
    return { description: desc, quantity: num(r.required_quantity, 1) };
  }));
  return {
    rfqNumber: 'RFQ-' + String(first.id).slice(0, 8),
    projectName: (project && project.project_name) || '',
    vendor: (vendor && vendor.vendor_name) || '',
    rfqDate: isoDate(first.created_at),
    items,
    instructions: '',
  };
}
module.exports = { getRFQData };
