'use strict';
/**
 * Shared calculation utilities (pdf-service edition).
 * Identical logic to backend/src/utils/calculations.js — no DB dependency.
 */

function calculateLineTotal(item, costMode = 'unit') {
  if (costMode === 'weight') {
    return (Number(item.quantity) || 0) * (Number(item.weight) || 0) * (Number(item.cost_per_weight) || 0);
  }
  const price = Number(item.unit_cost) || Number(item.unit_price) || 0;
  return (Number(item.quantity) || 0) * price;
}

function calculateSubtotal(items, { onlySelected = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items
    .filter(i => !onlySelected || i.selected !== false)
    .reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);
}

function parseTaxRate(taxType, taxPercent) {
  if (!taxType || taxType.toLowerCase() === 'exempt') return 0;
  if (taxPercent !== undefined && taxPercent !== null) return (Number(taxPercent) || 0) / 100;
  const match = String(taxType).match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return parseFloat(match[1]) / 100;
  return 0;
}

function calculateTaxAmount(subtotal, taxType, taxPercent) {
  return subtotal * parseTaxRate(taxType, taxPercent);
}

function calculateGrandTotal({ subtotal, taxAmount, shippingCharges = 0 }) {
  return (Number(subtotal) || 0) + (Number(taxAmount) || 0) + (Number(shippingCharges) || 0);
}

/**
 * Pick the "best" estimate from an array of estimate objects.
 * Priority: approved → selected_revision → latest.
 */
function pickBestEstimate(estimates, selectedRevision) {
  if (!Array.isArray(estimates) || estimates.length === 0) return null;
  return (
    estimates.find(e => e.is_approved) ||
    (selectedRevision != null && estimates.find(e => e.revision === selectedRevision)) ||
    estimates[estimates.length - 1]
  );
}

function normalizeLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const q = Number(item.quantity) || 0;
    const u = Number(item.unit_price) || 0;
    return { ...item, quantity: q, unit_price: u, line_total: q * u };
  });
}

function fmtCurrency(n) {
  const val = Number(n) || 0;
  return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build standardized description string for PDFs.
 * Format: Part Name | Material Category | Material Grade | Condition
 * Drawing Number returned separately as drawingDisplay.
 */
function buildDescription(partData) {
  if (!partData) return { description: '-', drawingDisplay: '' };

  const partName        = partData.job_description || partData.part_name || '';
  const materialCategory = partData.material || partData.material_category || '';
  const materialGrade   = partData.material_grade || '';
  const condition       = partData.condition || '';

  const descParts = [partName, materialCategory, materialGrade, condition].filter(p => p && p.trim());
  const description = descParts.length > 0 ? descParts.join(' | ') : '-';

  let drawingDisplay = '';
  const drawingNo  = partData.drawing_part_no || partData.part_number || '';
  const drawingRev = partData.drawing_revision || '';
  if (drawingNo) {
    drawingDisplay = `Drawing / Part No: ${drawingNo}${drawingRev ? ' - ' + drawingRev : ''}`;
  }

  return { description, drawingDisplay };
}

function buildEstimateLineItems(estimate) {
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
    const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
    const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
