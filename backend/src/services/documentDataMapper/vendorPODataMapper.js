'use strict';
const db = require('../../models');
const { isoDate, num } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').VendorPOData | null>} */
async function getVendorPOData(projectId) {
  if (!projectId) return null;
  const po = await db.VendorPurchaseOrder.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  if (!po) return null;
  const vendor = po.vendor_id ? await db.Vendor.findByPk(po.vendor_id).catch(() => null) : null;
  const lineItems = await db.VendorPOItem.findAll({ where: { vendor_po_id: po.id } }).catch(() => []);
  return {
    poNumber: po.po_number || '',
    vendor: (vendor && vendor.vendor_name) || '',
    poDate: isoDate(po.po_date || po.created_at),
    items: lineItems.map((it) => ({ description: it.part_description || '', quantity: num(it.quantity, 1), weight: num(it.weight), costPerWeight: num(it.cost_per_weight), lineTotal: num(it.line_total) })),
    subtotal: num(po.subtotal),
    tax: num(po.tax_amount),
    total: num(po.grand_total),
  };
}
module.exports = { getVendorPOData };
