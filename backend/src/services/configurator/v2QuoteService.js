'use strict';

/**
 * v2QuoteService.js — Quote slice (Phase D §7).
 *
 * Material basis = compileBoardBom rows (BOM screen and quote can never
 * disagree). Copper enters as the ESTIMATED material row — the engine's
 * COPPER_RATE_PER_LB path is zeroed to prevent double counting. Labour
 * flows from per-part hour buckets via catalog hydration (when loaded)
 * plus manual adjustments. Pricing through the UNMODIFIED parity-proven
 * v1 engine (CALC_VERSION 1.1.0). Revision chain: rev N points at N-1,
 * old revisions immutable.
 */

const models = require('../../models');
const { Op } = require('sequelize');
const { compileBoardBom } = require('./v2BomService');
const { computeQuoteFromV2 } = require('./v2PricingAdapter');
const { getCostingDefaults, toLookup } = require('./costingDefaults');

const DEFAULT_LOOKUP = Object.freeze({
  LBR_CU_rate: 85, LBR_ASM_rate: 75, LBR_CNT_rate: 95, LBR_QC_rate: 80,
  LBR_TST_rate: 90, LBR_ENG_rate: 130, LBR_CAD_rate: 110,
  OVERHEAD_PCT: 0.10,
  COPPER_RATE_PER_LB: 0, // copper is a material row here — never double count
});

/** Build hydration catalog (part-number keyed) so per-part labour hour
 *  buckets flow into the quote automatically once they're loaded. */
async function buildCatalog(lines) {
  const ids = [...new Set(lines.map((l) => l.component_id).filter(Boolean))];
  const pns = [...new Set(lines.map((l) => l.part_number).filter(Boolean))];
  const comps = await models.ConfiguratorComponent.findAll({
    where: {
      [Op.or]: [
        ids.length ? { id: ids } : null,
        pns.length ? { part_number: pns } : null,
      ].filter(Boolean),
    },
  }).catch(() => []);
  const byId = new Map();
  const byPartNumber = new Map();
  for (const c of comps) {
    const plain = c.get({ plain: true });
    byId.set(plain.id, plain);
    if (plain.part_number) byPartNumber.set(plain.part_number, plain);
  }
  return { byId, byPartNumber };
}

/**
 * Compute (never persists).
 * opts: { gmPct (0–1), roundupFactor, laborAdjustments:[{bucket,hours,note}],
 *         copperPricePerLb, lookup }
 */
async function computeBoardQuote(switchboardId, opts = {}) {
  const compiled = await compileBoardBom(switchboardId, { copperPricePerLb: opts.copperPricePerLb });
  const { board, bom, copper } = compiled;

  // BOM rows → adapter entries. unit_material_cost = unit_cost snapshot:
  // quote material ≡ BOM material by construction.
  const componentLines = bom.rows.map((r) => ({
    component_id: null,
    part_number: r.part_number,
    name: r.description,
    description: r.description,
    category: r.category,
    quantity: r.quantity,
    unit: r.unit,
    unit_cost: r.unit_cost ?? 0,
    unit_material_cost: r.unit_cost ?? 0,
    copper_weight_per_unit: 0,
    scope: r.scope,
    sectionIndex: r.sectionIndex,
    meta: {},
  }));

  const catalog = await buildCatalog(compiled.lines);
  // Defaults come from the editable costing_defaults standards table
  // (TPS workbook values); explicit opts always win.
  const defaults = await getCostingDefaults();
  const lookup = { ...toLookup(defaults), ...(opts.lookup || {}) };
  const gmPct = Number.isFinite(Number(opts.gmPct))
    ? Number(opts.gmPct)
    : (Number(defaults.default_gm_pct) || 0.30);
  if (gmPct >= 1 || gmPct < 0) {
    const err = new Error('gmPct must be a fraction between 0 and 1 (e.g. 0.30)');
    err.status = 422;
    throw err;
  }
  const pricing = {
    strategy: 'DESIRED GM%',
    desired_gm_pct: gmPct,
    roundup_factor: Number.isInteger(opts.roundupFactor)
      ? opts.roundupFactor
      : (Number.isInteger(defaults.roundup_factor) ? defaults.roundup_factor : -1),
  };
  const laborAdjustments = Array.isArray(opts.laborAdjustments) ? opts.laborAdjustments : [];

  const quote = computeQuoteFromV2(
    { sections: [], componentLines, laborAdjustments },
    catalog,
    lookup,
    pricing
  );

  const labourHoursTotal = Object.values(quote.labor_hours ?? {})
    .reduce((a, b) => a + (Number(b) || 0), 0);
  const nonFirmCount = bom.totals.nonFirmCount;

  const blockers = [];
  if (labourHoursTotal <= 0) {
    blockers.push('Labour hours are 0 — load part hour buckets or add manual labour adjustments before issuing.');
  }
  if (!compiled.sections.length) {
    blockers.push('No accepted design — propose and accept a line-up first.');
  }

  return {
    board: { id: board.id, name: board.name, status: board.status },
    quote,
    bomTotals: bom.totals,
    copper,
    copperPricePerLb: compiled.copperPricePerLb,
    inputs: { gmPct, roundupFactor: pricing.roundup_factor, laborAdjustments, lookup },
    defaults,
    labourHoursTotal,
    nonFirmCount,
    blockers,
    canIssue: blockers.length === 0,
    bomRows: bom.rows,
  };
}

/** List the revision chain for a board (newest first). */
async function listBoardQuotes(switchboardId) {
  const board = await models.ConfiguratorSwitchboard.findByPk(switchboardId);
  if (!board) return [];
  const rows = await models.ConfiguratorQuotation.findAll({
    where: { configuration_id: board.configuration_id },
    order: [['created_at', 'DESC']],
    limit: 100,
  });
  return rows.filter((q) => q.pricing_spec?.switchboardId === switchboardId);
}

/** Persist a new quotation revision (immutable chain). */
async function issueBoardQuote(switchboardId, opts = {}, ctx = {}) {
  const result = await computeBoardQuote(switchboardId, opts);
  if (!result.canIssue && !opts.force) {
    const err = new Error('Quote blocked: ' + result.blockers.join(' '));
    err.status = 422;
    err.details = result.blockers;
    throw err;
  }

  const board = await models.ConfiguratorSwitchboard.findByPk(switchboardId);
  const prior = await listBoardQuotes(switchboardId);
  const latest = prior[0] ?? null;
  const revision = latest ? (Number(latest.revision) || 0) + 1 : 0;

  const q = result.quote;
  const labourTotal = Object.values(q.labor_costs ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);

  const quotation = await models.ConfiguratorQuotation.create({
    project_id: ctx.projectId ?? null,
    configuration_id: board.configuration_id,
    quotation_number: `SB${board.board_index ?? 1}-R${revision}`,
    customer_name: ctx.customerName ?? null,
    status: 'draft',
    revision,
    parent_quotation_id: latest?.id ?? null,
    revision_reason: opts.revisionReason ?? (revision === 0 ? 'Initial issue' : null),
    material_total: q.totals.material_total,
    labour_total: labourTotal,
    overhead_total: q.totals.overhead_amount,
    subtotal: q.total_cost,
    margin_pct: q.pricing.actual_gm,
    margin_total: q.pricing.actual_profit,
    grand_total: q.pricing.rounded_price,
    currency: 'USD',
    bom_snapshot: { rows: result.bomRows, copper: result.copper, copperPricePerLb: result.copperPricePerLb },
    pricing_spec: {
      switchboardId,
      quote: q,
      inputs: result.inputs,
      labourHoursTotal: result.labourHoursTotal,
      nonFirmCount: result.nonFirmCount,
      forced: !!opts.force,
    },
    created_by: ctx.userId ?? null,
    company_id: ctx.companyId ?? null,
  });

  return { quotation, computed: result };
}

module.exports = { computeBoardQuote, issueBoardQuote, listBoardQuotes, DEFAULT_LOOKUP };
