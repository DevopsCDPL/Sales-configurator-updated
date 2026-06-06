/**
 * Shared Calculation Utilities
 * 
 * Centralised price / tax / total logic used by:
 *   - vendorProcurementService  (Vendor PO create / update / PDF)
 *   - invoiceController          (Invoice create / update / PDF)
 *   - salesOrderService          (auto-invoice on SO creation)
 *   - estimateService            (estimate totals / Quotation PDF)
 *   - documentService            (WO PDF item table)
 */

'use strict';

// --------- Line-total ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Calculate the total for a single line item.
 *
 * @param {object}  item      --- must include quantity, unit_cost (or unit_price),
 *                              weight, cost_per_weight
 * @param {'unit'|'weight'} [costMode='unit']
 * @returns {number}
 */
function calculateLineTotal(item, costMode = 'unit') {
  if (costMode === 'weight') {
    return (Number(item.quantity) || 0) * (Number(item.weight) || 0) * (Number(item.cost_per_weight) || 0);
  }
  const price = Number(item.unit_cost) || Number(item.unit_price) || 0;
  return (Number(item.quantity) || 0) * price;
}

// --------- Subtotal ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Sum of line totals for items that are "selected" (defaults to all).
 *
 * @param {object[]} items     --- each item should have a numeric `line_total`
 *                               and optionally `selected`
 * @param {object}   [opts]
 * @param {boolean}  [opts.onlySelected=false] --- filter out items where selected === false
 * @returns {number}
 */
function calculateSubtotal(items, { onlySelected = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items
    .filter(i => !onlySelected || i.selected !== false)
    .reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);
}

// --------- Tax rate ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Derive a numeric tax rate from the tax_type + optional tax_percent fields.
 *
 * Vendor PO pattern:  tax_type --- {'18%', '10%', 'exempt'}
 * Invoice pattern:    tax_type --- {'Exempt', 'GST', ---},  tax_percent = 18
 *
 * @param {string}  taxType
 * @param {number}  [taxPercent]   --- explicit percent (Invoice pattern)
 * @returns {number} decimal rate, e.g. 0.18
 */
function parseTaxRate(taxType, taxPercent) {
  if (!taxType || taxType.toLowerCase() === 'exempt') return 0;
  // If the caller passes an explicit percent (Invoice style)
  if (taxPercent !== undefined && taxPercent !== null) return (Number(taxPercent) || 0) / 100;
  // Vendor PO style: '18%' --- 0.18
  const match = String(taxType).match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return parseFloat(match[1]) / 100;
  return 0;
}

/**
 * @param {number} subtotal
 * @param {string} taxType
 * @param {number} [taxPercent]
 * @returns {number}
 */
function calculateTaxAmount(subtotal, taxType, taxPercent) {
  return subtotal * parseTaxRate(taxType, taxPercent);
}

// --------- Grand total ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {number} p.subtotal
 * @param {number} p.taxAmount
 * @param {number} [p.shippingCharges=0]
 * @returns {number}
 */
function calculateGrandTotal({ subtotal, taxAmount, shippingCharges = 0 }) {
  return (Number(subtotal) || 0) + (Number(taxAmount) || 0) + (Number(shippingCharges) || 0);
}

// --------- Build line items from an Estimate ---------------------------------------------------------------------------------------------------------------------------
/**
 * Extract a unified line-item array from an estimate's custom_parts +
 * process-module items.  Used by invoiceController auto-populate,
 * invoiceController PDF fallback, and salesOrderService auto-invoice.
 *
 * @param {object} estimate  --- Sequelize instance or plain obj
 * @returns {{ part: string, description: string, quantity: number,
 *             unit_price: number, line_total: number }[]}
 */
function buildEstimateLineItems(estimate) {
  if (!estimate) return [];
  const lineItems = [];

  const customParts = Array.isArray(estimate.custom_parts) ? estimate.custom_parts : [];
  customParts.forEach((p, idx) => {
    let qty, unitPrice;
    if (p.bulk_order_variable_price && Array.isArray(p.pricing_tiers) && p.pricing_tiers.length > 0) {
      // Bulk pricing: use first tier as the default quantity/price
      const tier = p.pricing_tiers[0];
      qty = Number(tier.quantity) || 0;
      unitPrice = Number(tier.unit_price) || 0;
    } else {
      qty = Number(p.quantity) || 0;
      const rawUnitPrice = Number(p.job_cost_per_unit) || 0;
      const total = Number(p.total_cost) || (qty * rawUnitPrice);
      unitPrice = rawUnitPrice || (qty > 0 ? total / qty : total);
    }
    lineItems.push({
      part: p.drawing_part_no || `Part ${idx + 1}`,
      description: p.job_description || '',
      quantity: qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    });
  });

  const processModules = Array.isArray(estimate.items) ? estimate.items : [];
  processModules.forEach((item, idx) => {
    const inp = item.input_json || {};
    const qty = Number(inp.quantity) || 0;
    const totalCost = Number(item.total_cost) || 0;
    const unitPrice = qty > 0 ? totalCost / qty : totalCost;
    const moduleLabel = (item.module_type || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    lineItems.push({
      part: inp.drawing_part_no || `Module ${idx + 1}`,
      description: inp.job_name || moduleLabel,
      quantity: qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    });
  });

  return lineItems;
}

/**
 * Pick the "best" estimate from a project's estimate array.
 * Priority: approved --- selected_revision --- latest.
 *
 * @param {object[]} estimates
 * @param {number}   [selectedRevision]
 * @returns {object|null}
 */
function pickBestEstimate(estimates, selectedRevision) {
  if (!Array.isArray(estimates) || estimates.length === 0) return null;
  return (
    estimates.find(e => e.is_approved) ||
    (selectedRevision != null && estimates.find(e => e.revision === selectedRevision)) ||
    estimates[estimates.length - 1]
  );
}

/**
 * Normalise line items by recalculating line_total = qty -- unit_price.
 *
 * @param {object[]} items
 * @returns {object[]}
 */
function normalizeLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const q = Number(item.quantity) || 0;
    const u = Number(item.unit_price) || 0;
    return { ...item, quantity: q, unit_price: u, line_total: q * u };
  });
}

// --------- Currency formatting (for PDF rendering) ---------------------------------------------------------------------------------------------------------
/**
 * @param {number} n
 * @returns {string} e.g. "$ 1,234.56"
 */
function fmtCurrency(n) {
  const val = Number(n) || 0;
  return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --------- Standardized Description Builder (Global) -------------------------------------------------------------------------------------------------------
/**
 * Build a standardized description string for PDFs and UI.
 * 
 * FORMAT: Part Name | Material Category | Material Grade | Condition | Dimensions
 * 
 * Drawing Number is returned SEPARATELY and should be displayed below the description.
 *
 * @param {object} partData - Part data object (from custom_parts, estimate items, etc.)
 * @param {string} [partData.job_description] - Part/Job Name
 * @param {string} [partData.part_name] - Alternative field for Part Name
 * @param {string} [partData.material] - Material Category
 * @param {string} [partData.material_category] - Alternative field for Material Category
 * @param {string} [partData.material_grade] - Material Grade
 * @param {string} [partData.condition] - Material Condition (e.g., Annealed, Hot Rolled)
 * @param {string} [partData.raw_material_dimension] - Pre-formatted dimension string
 * @param {string} [partData.dimensions] - Alternative dimension field (can be string or object)
 * @param {string} [partData.drawing_part_no] - Drawing/Part Number
 * @param {string} [partData.drawing_revision] - Drawing Revision
 * @returns {{ description: string, drawingDisplay: string }}
 */
function buildDescription(partData) {
  if (!partData) return { description: '-', drawingDisplay: '' };

  // Extract Part Name (priority: job_description > part_name)
  const partName = partData.job_description || partData.part_name || '';

  // Extract Material Category (priority: material > material_category)
  const materialCategory = partData.material || partData.material_category || '';

  // Extract Material Grade
  const materialGrade = partData.material_grade || '';

  // Extract Condition
  const condition = partData.condition || '';

  // Build description parts: Part Name | Material Category | Material Grade | Condition
  // NO dimensions, shape, drawing number, or revision in description
  const descParts = [partName, materialCategory, materialGrade, condition]
    .filter(part => part && part.trim());

  // Join with " | " separator
  const description = descParts.length > 0 ? descParts.join(' | ') : '-';

  // Build drawing display (separate from description)
  let drawingDisplay = '';
  const drawingNo = partData.drawing_part_no || partData.part_number || '';
  const drawingRev = partData.drawing_revision || '';
  if (drawingNo) {
    drawingDisplay = `Drawing / Part No: ${drawingNo}${drawingRev ? ' - ' + drawingRev : ''}`;
  }

  return { description, drawingDisplay };
}

/**
 * Build standardized line items from an estimate with proper description format.
 * This extends buildEstimateLineItems with the standardized description format.
 *
 * @param {object} estimate - Sequelize instance or plain obj
 * @returns {{ part: string, description: string, drawingDisplay: string, quantity: number,
 *             unit_price: number, line_total: number }[]}
 */
function buildStandardizedLineItems(estimate) {
  if (!estimate) return [];
  const lineItems = [];

  const customParts = Array.isArray(estimate.custom_parts) ? estimate.custom_parts : [];
  customParts.forEach((p, idx) => {
    let qty, unitPrice;
    if (p.bulk_order_variable_price && Array.isArray(p.pricing_tiers) && p.pricing_tiers.length > 0) {
      const tier = p.pricing_tiers[0];
      qty = Number(tier.quantity) || 0;
      unitPrice = Number(tier.unit_price) || 0;
    } else {
      qty = Number(p.quantity) || 0;
      const rawUnitPrice = Number(p.job_cost_per_unit) || 0;
      const total = Number(p.total_cost) || (qty * rawUnitPrice);
      unitPrice = rawUnitPrice || (qty > 0 ? total / qty : total);
    }

    const { description, drawingDisplay } = buildDescription(p);
    lineItems.push({
      part: p.drawing_part_no || `Part ${idx + 1}`,
      description,
      drawingDisplay,
      quantity: qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    });
  });

  const processModules = Array.isArray(estimate.items) ? estimate.items : [];
  processModules.forEach((item, idx) => {
    const inp = item.input_json || {};
    const qty = Number(inp.quantity) || 0;
    const totalCost = Number(item.total_cost) || 0;
    const unitPrice = qty > 0 ? totalCost / qty : totalCost;
    const moduleLabel = (item.module_type || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    // Build description for process modules
    const modulePartData = {
      job_description: inp.job_name || moduleLabel,
      material: inp.material_type || inp.material_grade || '',
      material_grade: inp.material_grade || inp.material_type || '',
      condition: inp.condition || '',
      raw_material_dimension: inp.raw_material_dimension || '',
      drawing_part_no: inp.drawing_part_no || '',
    };
    const { description, drawingDisplay } = buildDescription(modulePartData);

    lineItems.push({
      part: inp.drawing_part_no || `Module ${idx + 1}`,
      description,
      drawingDisplay,
      quantity: qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    });
  });

  return lineItems;
}

module.exports = {
  calculateLineTotal,
  calculateSubtotal,
  parseTaxRate,
  calculateTaxAmount,
  calculateGrandTotal,
  buildEstimateLineItems,
  buildDescription,
  buildStandardizedLineItems,
  pickBestEstimate,
  normalizeLineItems,
  fmtCurrency,
};
