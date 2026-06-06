'use strict';

/**
 * quotationCompiler.js — pure orchestration layer.
 *
 * Combines:
 *   • bomEngine.expandConfig(...)
 *   • pricingEngine.computeQuote(...)
 *   • labourEngine.aggregateHoursFromBomRows(...)
 *
 * into a single deterministic object that mirrors the structure
 * persisted into `configurator_quotations` (`bom_spec` + `pricing_spec`
 * JSONB columns) and consumed by the PDF generator.
 *
 * NO database / network access here. The caller must hydrate the
 * components catalog map and pass it in.
 */

const bomEngine = require('./bomEngine');
const pricingEngine = require('./pricingEngine');
const labourEngine = require('./labourEngine');

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Build a fully-evaluated quotation payload.
 *
 * @param {object}   args
 * @param {object}   args.configuration                Sequelize plain object (or any { id, code, name, ... })
 * @param {object}   args.configData                   The Configuration.config_data blob
 * @param {object}   args.catalog                      { byId, byPartNumber } from configuratorService
 * @param {object}   args.lookup                       LookupRates (LBR_*_rate, OVERHEAD_PCT, COPPER_RATE_PER_LB)
 * @param {object}   args.pricing                      PricingStrategy
 * @param {object}   [args.schedule]                   ScheduleInput
 * @param {string[]} [args.holidays]                   ISO YYYY-MM-DD
 * @param {object[]} [args.lineAdders]                 Cross-section adders [{section_id, desc, value}]
 * @param {object[]} [args.preBuiltSections]           Optional override — bypass BOM-derived sections
 * @returns {object} compiled quotation
 */
function compileQuotation({
  configuration,
  configData,
  catalog,
  lookup,
  pricing,
  schedule = {},
  holidays = [],
  lineAdders = [],
  preBuiltSections = null,
}) {
  if (!lookup) throw new Error('compileQuotation: lookup is required');
  if (!pricing) throw new Error('compileQuotation: pricing is required');

  const bom = bomEngine.expandConfig(configData || {}, catalog || { byId: new Map(), byPartNumber: new Map() });

  // Derive sections — either preBuilt (manual) or from BOM rows
  let sections;
  if (Array.isArray(preBuiltSections) && preBuiltSections.length) {
    sections = preBuiltSections;
  } else {
    sections = bomEngine.sectionsFromBomRows(bom.rows);
  }

  // Inject cross-section line-item adders
  if (lineAdders && lineAdders.length) {
    const bySec = new Map();
    for (const a of lineAdders) {
      const id = a.section_id != null ? String(a.section_id) : (sections[0] && sections[0].id) || '0';
      if (!bySec.has(id)) bySec.set(id, []);
      bySec.get(id).push({ desc: String(a.desc || ''), value: num(a.value, 0) });
    }
    for (const sec of sections) {
      const extras = bySec.get(String(sec.id));
      if (extras) sec.line_items = [...(sec.line_items || []), ...extras];
    }
  }

  const quote = pricingEngine.computeQuote({
    sections,
    lookup,
    pricing,
    schedule,
    holidays,
  });

  // Stand-alone labour roll-up (from raw BOM rows — useful for the
  // labour preview tab even when no sections are active yet).
  const labour = labourEngine.computeLabour(bom.rows, lookup);

  // Quotation items array → mirrors `configurator_quotation_items` rows.
  // We expose this so configuratorService can persist line-by-line.
  const items = bom.rows.map((r, idx) => ({
    line_number: idx + 1,
    component_id: r.component_id,
    part_number: r.part_number,
    description: r.description || r.name || '',
    category: r.category,
    step_key: r.step_key,
    section_number: r.section_number,
    quantity: r.quantity,
    unit: r.unit,
    unit_cost: r.unit_cost,
    total_cost: r.total_cost,
    meta: r.meta,
  }));

  // bom_spec / pricing_spec — the JSONB blobs persisted on the quotation.
  const bom_spec = {
    rows: bom.rows,
    by_step: bom.by_step,
    by_section: bom.by_section,
    totals: bom.totals,
  };
  const pricing_spec = {
    lookup,
    pricing_strategy: pricing,
    schedule,
    holidays,
    line_adders: lineAdders,
    sections_input: sections,
    quote,            // full pricing engine output
    labour_summary: labour,
  };

  return {
    configuration: configuration ? {
      id: configuration.id || null,
      code: configuration.code || null,
      name: configuration.name || null,
      project_id: configuration.project_id || null,
    } : null,
    quote,
    labour,
    items,
    bom_spec,
    pricing_spec,
    totals: {
      ...quote.totals,
      total_cost: quote.total_cost,
      target_price: quote.pricing.target_price,
      rounded_price: quote.pricing.rounded_price,
      actual_profit: quote.pricing.actual_profit,
      actual_gm: quote.pricing.actual_gm,
    },
  };
}

module.exports = {
  compileQuotation,
};
