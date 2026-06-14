'use strict';
const db = require('../../models');
const { isoDate, num, arr } = require('./_mapperUtil');

/** @returns {Promise<import('./documentDataTypes').InvoiceData | null>} */
async function getInvoiceData(projectId) {
  if (!projectId) return null;
  const inv = await db.Invoice.findOne({ where: { project_id: projectId }, order: [['created_at', 'DESC']] }).catch(() => null);
  if (!inv) return null;
  const items = arr(inv.line_items).map((x) => {
    const unit = num(x.unitPrice != null ? x.unitPrice : x.unit_price != null ? x.unit_price : x.price);
    const qty = num(x.quantity != null ? x.quantity : x.qty, 1);
    return { description: x.description || x.desc || '', unitPrice: unit, quantity: qty, total: num(x.total != null ? x.total : x.line_total, unit * qty) };
  });
  return {
    invoiceNumber: inv.invoice_number || '',
    invoiceDate: isoDate(inv.invoice_date || inv.created_at),
    client: inv.customer_name || '',
    poNumber: inv.client_po_number || '',
    project: inv.project_name || '',
    items,
    subtotal: num(inv.subtotal),
    tax: num(inv.tax_amount),
    shipping: num(inv.shipping_charges),
    grandTotal: num(inv.final_total),
  };
}
module.exports = { getInvoiceData };
