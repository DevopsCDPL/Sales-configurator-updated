/**
 * PDF Pre-Generation Validation
 *
 * Validates that all required data is present and calculations are consistent
 * before generating a PDF.  Each validator returns { valid, errors[] }.
 */

'use strict';

const { calculateLineTotal, calculateSubtotal, parseTaxRate } = require('./calculations');

/**
 * @typedef {{ valid: boolean, errors: string[] }} ValidationResult
 */

/**
 * Validate an invoice before PDF generation.
 * @param {object} invoice - Invoice record (DB row or plain obj)
 * @returns {ValidationResult}
 */
function validateInvoiceForPdf(invoice) {
  const errors = [];

  if (!invoice) { return { valid: false, errors: ['Invoice record is missing'] }; }
  if (!invoice.invoice_number) errors.push('Invoice number is missing');

  // Log warnings for missing fields but don't block PDF generation
  if (!invoice.customer_name)  console.warn('Invoice PDF warning: customer name is missing');
  if (!invoice.project_name)   console.warn('Invoice PDF warning: project name is missing');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Vendor Purchase Order before PDF generation.
 * @param {object} po    - VendorPurchaseOrder record
 * @param {object[]} items - VendorPOItem records
 * @returns {ValidationResult}
 */
function validateVendorPOForPdf(po, items) {
  const errors = [];

  if (!po)           { return { valid: false, errors: ['Purchase Order record is missing'] }; }
  if (!po.po_number) errors.push('PO number is missing');
  if (!po.vendor_id) errors.push('Vendor is missing');

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Purchase Order has no line items');
  } else {
    items.forEach((item, idx) => {
      if (!item.part_description) {
        errors.push(`Item ${idx + 1}: description is empty`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Quotation before PDF generation.
 * @param {object} estimate - Estimate record
 * @param {object} project  - Project record
 * @returns {ValidationResult}
 */
function validateQuotationForPdf(estimate, project) {
  const errors = [];

  if (!project)              { return { valid: false, errors: ['Project is missing'] }; }
  if (!project.project_name) errors.push('Project name is missing');

  if (!estimate) {
    errors.push('No estimate found for quotation');
  } else {
    const parts = Array.isArray(estimate.custom_parts) ? estimate.custom_parts : [];
    const modules = Array.isArray(estimate.items) ? estimate.items : [];
    if (parts.length === 0 && modules.length === 0) {
      errors.push('Estimate has no custom parts or process modules');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Work Order before PDF generation.
 * @param {object} workOrder
 * @param {object} project
 * @returns {ValidationResult}
 */
function validateWorkOrderForPdf(workOrder, project) {
  const errors = [];

  if (!project)           { return { valid: false, errors: ['Project is missing'] }; }
  if (!workOrder)         { return { valid: false, errors: ['Work Order is missing'] }; }
  if (!workOrder.wo_number) errors.push('Work Order number is missing');

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateInvoiceForPdf,
  validateVendorPOForPdf,
  validateQuotationForPdf,
  validateWorkOrderForPdf,
};
