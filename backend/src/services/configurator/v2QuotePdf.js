'use strict';

/**
 * v2QuotePdf.js — client-facing PDF from an ISSUED V2 quotation.
 *
 * Adapts the persisted revision (bom_snapshot + pricing_spec.quote) to
 * the EXACT `compiled` shape the existing pdfQuotationService renders —
 * one PDF pipeline for v1 and v2. Copper is presented v1-style
 * (separate line, material shown net of copper; totals identical).
 */

const models = require('../../models');
const { renderQuotationPdf } = require('./pdfQuotationService');

const LBR = ['CU', 'ASM', 'CNT', 'QC', 'TST', 'ENG', 'CAD'];

function compiledFromQuotation(quotation) {
  const q = quotation.pricing_spec?.quote;
  if (!q) {
    const err = new Error('quotation has no V2 pricing payload (pricing_spec.quote)');
    err.status = 422;
    throw err;
  }
  const snap = quotation.bom_snapshot || {};
  const rows = Array.isArray(snap.rows) ? snap.rows : [];
  const copperCost = Number(snap.copper?.costUsd) || 0;

  const items = rows
    .filter((r) => Number(r.quantity) > 0)
    .map((r, i) => ({
      line_number: i + 1,
      part_number: r.part_number || '',
      description: r.description || '',
      quantity: Number(r.quantity) || 0,
      unit_cost: Number(r.unit_cost) || 0,
      total_cost: (Number(r.unit_cost) || 0) * (Number(r.quantity) || 0),
    }));

  const lookup = quotation.pricing_spec?.inputs?.lookup || {};
  const rates = Object.fromEntries(LBR.map((c) => [c, Number(lookup[`LBR_${c}_rate`]) || 0]));
  const hours = q.labor_hours || {};
  const costs = q.labor_costs || {};
  const labour = {
    hours, costs, rates,
    totals: {
      hours_total: LBR.reduce((a, c) => a + (Number(hours[c]) || 0), 0),
      cost_total: LBR.reduce((a, c) => a + (Number(costs[c]) || 0), 0),
    },
  };

  const totals = {
    material_total: (Number(q.totals.material_total) || 0) - copperCost,
    section_cost_total: (Number(q.totals.section_cost_total) || 0) - copperCost,
    overhead_amount: Number(q.totals.overhead_amount) || 0,
    copper_cost: copperCost,
    total_cost: Number(q.total_cost) || 0,
    target_price: Number(q.pricing.target_price) || 0,
    rounded_price: Number(q.pricing.rounded_price) || 0,
    actual_profit: Number(q.pricing.actual_profit) || 0,
    actual_gm: Number(q.pricing.actual_gm) || 0,
  };

  return { items, labour, totals, quote: { schedule: q.schedule || {} } };
}

async function renderV2QuotationPdf(quotationId, { companyId = null } = {}) {
  const quotation = await models.ConfiguratorQuotation.findByPk(quotationId);
  if (!quotation) {
    const err = new Error('quotation not found');
    err.status = 404;
    throw err;
  }
  const compiled = compiledFromQuotation(quotation);
  const configuration = quotation.configuration_id
    ? await models.ConfiguratorConfiguration.findByPk(quotation.configuration_id).catch(() => null)
    : null;
  const project = configuration?.project_id
    ? await models.Project.findByPk(configuration.project_id).catch(() => null)
    : null;

  let companySettings = {};
  try {
    const settingsService = require('../settingsService');
    if (companyId) companySettings = await settingsService.getCompanySettings(companyId);
  } catch { /* render without branding */ }

  const { buffer, filename } = await renderQuotationPdf(compiled, {
    quotation, configuration, project, companySettings,
  });
  return { buffer, filename, quotation };
}

module.exports = { renderV2QuotationPdf, compiledFromQuotation };
