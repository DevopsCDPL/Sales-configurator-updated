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
function computeQuoteFromV2(board, catalog, lookup, pricing) {
  const rows = v2BoardToBomRows(board, catalog);
  const sections = sectionsFromBomRows(rows);

  const adj = board.laborAdjustments ?? [];
  if (adj.length) {
    const hours = { CU: 0, ASM: 0, CNT: 0, QC: 0, TST: 0, ENG: 0, CAD: 0 };
    for (const a of adj) {
      const k = String(a.bucket || '').toUpperCase();
      if (k in hours) hours[k] += Number(a.hours) || 0;
    }
    sections.push({
      id: 'labor-adjustments',
      description: 'Manual labour adjustments',
      qty: 1,
      unit_material_cost: 0,
      copper_weight_per_unit: 0,
      labor_hours_per_unit: hours,
      line_items: [],
    });
  }

  return computeQuote({ sections, lookup, pricing });
}

module.exports = { v2BoardToBomRows, computeQuoteFromV2, lineToEntry, CATEGORY_TO_STEP };
