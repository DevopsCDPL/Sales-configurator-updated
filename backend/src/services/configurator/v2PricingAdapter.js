'use strict';

/**
 * v2PricingAdapter.js — Phase A spec §9.3 (the parity bridge)
 *
 * Converts V2 spine state (switchboard → sections → componentLines)
 * into the EXACT row/section shapes the v1 pricing path consumes — by
 * REUSING bomEngine.buildRow / hydrateEntry / sectionsFromBomRows.
 * Same functions ⇒ same arithmetic ⇒ quote parity by construction.
 *
 * pricingEngine.js itself is never modified (CALC_VERSION 1.1.0).
 */

const { buildRow, hydrateEntry, sectionsFromBomRows } = require('./bomEngine');
const { computeQuote } = require('./pricingEngine');
const { computeBlendedPricing } = require('./lineMarginEngine');

/** Category → legacy step_key (for reporting continuity only — pricing ignores it). */
const CATEGORY_TO_STEP = {
  'CIRCUIT BREAKER': 'system_design',
  ENCLOSURE: 'enclosure',
  LUGS: 'bussing',
  HARDWARE: 'bussing',
  GLASTIC: 'glastic',
  CAMLOCK: 'cam_lock_panel',
  SPD: 'spd_ats',
  ATS: 'spd_ats',
  CONTROLS: 'controls',
  LIGHT: 'controls',
  SWITCH: 'controls',
  'POWER SUPPLY': 'controls',
  'CURRENT TRANSFORMER': 'ct_vt_cpt',
  'VOLTAGE TRANSFORMER': 'ct_vt_cpt',
  CONDUIT: 'conduit_fittings',
  'WIRE CABLE': 'wire_cable',
  TERMINALS: 'wire_cable',
  'STANDARD PRODUCT': 'standard_bom',
  LABOR: 'labour',
  SAFETY: 'standard_bom',
  BUSSING: 'bussing',
};

/** One V2 component line → the v1 entry shape buildRow expects. */
function lineToEntry(line) {
  return {
    component_id: line.componentId ?? line.component_id ?? null,
    part_number: line.partNumber ?? line.part_number ?? null,
    name: line.name ?? null,
    description: line.description ?? null,
    category: line.category ?? null,
    quantity: Number(line.quantity) || 1,
    unit: line.unit ?? 'ea',
    // Only pass an explicit cost when the line carries a snapshot —
    // otherwise let hydrateEntry resolve from the catalog exactly as v1 does.
    unit_cost: line.unitCost ?? line.unit_cost ?? null,
    unit_material_cost: line.unitMaterialCost ?? line.unit_material_cost ?? null,
    copper_weight_per_unit: line.copperWeightPerUnit ?? line.copper_weight_per_unit ?? null,
    section_number:
      (line.scope === 'section' && line.sectionIndex != null) ? Number(line.sectionIndex) : null,
    meta: line.meta ?? {},
    // Per-line margin layer carry-through (cost build-up unaffected).
    line_id: line.lineId ?? line.line_id ?? line.id ?? null,
    specifications: line.specifications ?? null,
  };
}

/**
 * Flatten a V2 switchboard (plain object — SwitchboardStateV2 or the
 * DB envelope) into v1 BOM rows via buildRow.
 *
 * @param {object} board   { sections:[{sectionIndex, deviceLines[]}], componentLines[] }
 * @param {object} catalog { byId: Map, byPartNumber: Map }
 */
function v2BoardToBomRows(board, catalog) {
  const byId = catalog?.byId ?? new Map();
  const byPartNumber = catalog?.byPartNumber ?? new Map();
  const rows = [];

  const push = (line, sectionIndex = null) => {
    const entry = lineToEntry(line);
    if (sectionIndex != null && entry.section_number == null) entry.section_number = sectionIndex;
    const stepKey = CATEGORY_TO_STEP[(entry.category || '').toUpperCase()] ?? 'plus_comp';
    rows.push(buildRow({ entry, comp: hydrateEntry(entry, byId, byPartNumber), stepKey }));
  };

  for (const s of board.sections ?? []) {
    for (const dl of s.deviceLines ?? []) push(dl, s.sectionIndex);
  }
  for (const l of board.componentLines ?? []) push(l);

  return rows;
}

/**
 * Full V2 → quote computation through the UNMODIFIED v1 pricing engine.
 *
 * laborAdjustments (Phase A §A1-5) enter as an extra pseudo-section so
 * manual labour lines participate in pricing exactly like component
 * labour — auditable, never skippable.
 */
function computeQuoteFromV2(board, catalog, lookup, pricing, opts = {}) {
  const rows = v2BoardToBomRows(board, catalog);
  const sections = sectionsFromBomRows(rows);

  // Manual board-level laborAdjustments AND per-line meta.labourAdj deltas
  // are summed into one pseudo-section so the cost build-up (total_cost)
  // includes them. lineMarginEngine re-applies the per-line deltas for the
  // split; the two reconcile via the overhead factor (Sum lineCost -> total_cost).
  const hours = { CU: 0, ASM: 0, CNT: 0, QC: 0, TST: 0, ENG: 0, CAD: 0 };
  let anyAdj = false;
  for (const a of board.laborAdjustments ?? []) {
    const k = String(a.bucket || '').toUpperCase();
    if (k in hours) { hours[k] += Number(a.hours) || 0; anyAdj = true; }
  }
  for (const r of rows) {
    const adj = r.meta?.labourAdj;
    if (!adj || typeof adj !== 'object') continue;
    for (const [k, v] of Object.entries(adj)) {
      const cat = String(k).replace(/^lbr_/i, '').toUpperCase();
      if (cat in hours) { hours[cat] += Number(v) || 0; anyAdj = true; }
    }
  }
  if (anyAdj) {
    sections.push({
      id: 'labor-adjustments',
      description: 'Manual + per-line labour adjustments',
      qty: 1,
      unit_material_cost: 0,
      copper_weight_per_unit: 0,
      labor_hours_per_unit: hours,
      line_items: [],
    });
  }

  const quote = computeQuote({ sections, lookup, pricing });

  // Per-line margin layer (spec section 3): re-derive SELL when lines carry
  // their own margin; pool the global GM over the rest. Cost build-up above
  // is untouched and remains parity-proven.
  if (opts.withLineMargin) {
    const blended = computeBlendedPricing(rows, lookup, pricing, { total_cost: quote.total_cost });
    return { quote, rows, blended };
  }
  return quote;
}

module.exports = { v2BoardToBomRows, computeQuoteFromV2, lineToEntry, CATEGORY_TO_STEP };
