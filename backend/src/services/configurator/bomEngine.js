'use strict';

/**
 * bomEngine.js — pure functions, no I/O, no DB.
 *
 * Walks a `config_data` JSON blob (the configurator session state)
 * and produces a normalized BOM-row list. Each row carries the
 * pricing fields needed downstream by `pricingEngine` /
 * `labourEngine` / `quotationCompiler`.
 *
 * The original Python configurator did NOT centralize BOM expansion;
 * each step screen produced its own `selected_components` array which
 * the front-end stitched into the quote. To preserve determinism we
 * apply a single rule:
 *
 *   For every step in `STEP_KEYS`, walk `config_data[step].selected_components`
 *   (or `config_data[step].items`, whichever is present) and emit one
 *   row per entry. Each entry must minimally provide
 *   `{ component_id?, part_number?, quantity, unit_cost?, ... }`.
 *
 * This contract matches both the legacy configurator payload AND the
 * new Phase-1 schema (`configurator_components` table). The caller
 * (configuratorService) is responsible for hydrating component rows
 * from the database before invoking the compiler.
 *
 * If a step provides explicit `bom_rows` (already expanded) those are
 * passed through unchanged — supports the "+ Comp" / manual line item
 * step from the PH4 spec.
 */

const STEP_KEYS = [
  'system_design',
  'enclosure',
  'bussing',
  'glastic',
  'cam_lock_panel',
  'spd_ats',
  'controls',
  'ct_vt_cpt',
  'conduit_fittings',
  'wire_cable',
  'standard_bom',
  'labour',
  'plus_comp',
  'sld',
];

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Type-coercing numeric helper — identical to `num()` but also accepts
 * the string-encoded DECIMALs that node-postgres / Sequelize return for
 * DECIMAL(n,m) columns (e.g. "100.0000", "0.5000").
 *
 * Used wherever values may originate from a DB-fetched catalog row rather
 * than a plain JS config_data blob. The native `num()` helper is preserved
 * for accumulator-derived values (already guaranteed to be numbers).
 */
const numCoerce = (v, fallback = 0) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v != null) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/**
 * Hydrate a single raw entry against the components-by-id and
 * components-by-part-number lookup maps.
 *
 * Lookup precedence (matches `import_components_from_csv.py` rules):
 *   1. component_id   (UUID, exact match)
 *   2. part_number    (per-company unique)
 *   3. fall back to whatever fields are inline on the entry
 */
function hydrateEntry(entry, byId, byPartNumber) {
  let comp = null;
  if (entry.component_id && byId.has(entry.component_id)) {
    comp = byId.get(entry.component_id);
  } else if (entry.part_number && byPartNumber.has(entry.part_number)) {
    comp = byPartNumber.get(entry.part_number);
  }
  return comp;
}

/**
 * Build a BOM row from a hydrated component + an entry's quantity/overrides.
 *
 * Row shape (consumed by labourEngine + quotationCompiler):
 *   {
 *     component_id, part_number, name, description, category, component_type,
 *     quantity, unit, unit_cost, total_cost,
 *     unit_material_cost, unit_labor_cost,
 *     lbr_cu, lbr_asm, lbr_cnt, lbr_qc, lbr_tst, lbr_eng, lbr_cad,
 *     step_key, section_number, meta
 *   }
 */
function buildRow({ entry, comp, stepKey }) {
  // Use numCoerce for any value that may originate from a Sequelize/pg catalog
  // row: node-postgres returns DECIMAL(n,m) columns as strings ("100.0000"),
  // which the plain num() helper would silently convert to 0. numCoerce handles
  // both native numbers and string-encoded decimals.
  const quantity = numCoerce(entry.quantity, 1);
  const unitCost = entry.unit_cost != null
    ? numCoerce(entry.unit_cost, 0)
    : numCoerce((comp && (comp.price ?? comp.material_cost ?? comp.mat_cost)) ?? 0, 0);
  const unitMaterial = entry.unit_material_cost != null
    ? numCoerce(entry.unit_material_cost, 0)
    : numCoerce((comp && (comp.material_cost ?? comp.mat_cost)) ?? 0, 0);
  const unitLabor = entry.unit_labor_cost != null
    ? numCoerce(entry.unit_labor_cost, 0)
    : numCoerce((comp && comp.labor_cost) ?? 0, 0);

  const row = {
    component_id: entry.component_id || (comp && comp.id) || null,
    part_number: entry.part_number || (comp && comp.part_number) || null,
    name: entry.name || (comp && comp.name) || null,
    description: entry.description || (comp && comp.description) || null,
    category: entry.category || (comp && comp.category) || null,
    component_type: entry.component_type || (comp && comp.component_type) || null,
    quantity,
    unit: entry.unit || (comp && comp.unit) || 'ea',
    unit_cost: unitCost,
    total_cost: unitCost * quantity,
    unit_material_cost: unitMaterial,
    unit_labor_cost: unitLabor,
    lbr_cu:  numCoerce(entry.lbr_cu  ?? (comp && comp.lbr_cu),  0),
    lbr_asm: numCoerce(entry.lbr_asm ?? (comp && comp.lbr_asm), 0),
    lbr_cnt: numCoerce(entry.lbr_cnt ?? (comp && comp.lbr_cnt), 0),
    lbr_qc:  numCoerce(entry.lbr_qc  ?? (comp && comp.lbr_qc),  0),
    lbr_tst: numCoerce(entry.lbr_tst ?? (comp && comp.lbr_tst), 0),
    lbr_eng: numCoerce(entry.lbr_eng ?? (comp && comp.lbr_eng), 0),
    lbr_cad: numCoerce(entry.lbr_cad ?? (comp && comp.lbr_cad), 0),
    copper_weight_per_unit: numCoerce(entry.copper_weight_per_unit, 0),
    step_key: stepKey,
    section_number: entry.section_number != null ? Number(entry.section_number) : null,
    meta: entry.meta || {},
  };
  return row;
}

/**
 * Expand `config_data` JSON into a flat BOM-row array.
 *
 * @param {object} configData  the Configuration.config_data blob
 * @param {object} catalog     { byId: Map<uuid, Component>, byPartNumber: Map<string, Component> }
 * @returns {object}           { rows, by_step, by_section, totals }
 */
function expandConfig(configData, catalog) {
  const byId = (catalog && catalog.byId) || new Map();
  const byPartNumber = (catalog && catalog.byPartNumber) || new Map();
  const data = configData || {};
  const rows = [];

  for (const stepKey of STEP_KEYS) {
    const stepNode = data[stepKey];
    if (!stepNode) continue;

    // Pre-expanded rows — pass through (manual / + Comp / standard_bom)
    if (Array.isArray(stepNode.bom_rows)) {
      for (const r of stepNode.bom_rows) {
        rows.push(buildRow({ entry: r, comp: hydrateEntry(r, byId, byPartNumber), stepKey }));
      }
      continue;
    }

    const entries = Array.isArray(stepNode.selected_components)
      ? stepNode.selected_components
      : Array.isArray(stepNode.items)
        ? stepNode.items
        : [];

    for (const entry of entries) {
      const comp = hydrateEntry(entry, byId, byPartNumber);
      rows.push(buildRow({ entry, comp, stepKey }));
    }
  }

  // ── Aggregations ────────────────────────────────────────────────────────
  const byStep = {};
  const bySection = new Map();
  let materialTotal = 0;
  let unitCostTotal = 0;
  for (const r of rows) {
    byStep[r.step_key] = byStep[r.step_key] || { rows: [], total_cost: 0 };
    byStep[r.step_key].rows.push(r);
    byStep[r.step_key].total_cost += r.total_cost;

    const sec = r.section_number != null ? r.section_number : 0;
    if (!bySection.has(sec)) {
      bySection.set(sec, { rows: [], total_cost: 0, material_total: 0 });
    }
    const bucket = bySection.get(sec);
    bucket.rows.push(r);
    bucket.total_cost += r.total_cost;
    bucket.material_total += r.unit_material_cost * r.quantity;

    materialTotal += r.unit_material_cost * r.quantity;
    unitCostTotal += r.total_cost;
  }

  return {
    rows,
    by_step: byStep,
    by_section: Object.fromEntries(bySection),
    totals: {
      row_count: rows.length,
      material_total: materialTotal,
      unit_cost_total: unitCostTotal,
    },
  };
}

/**
 * Convert the BOM-row → section-input list expected by `pricingEngine.computeQuote`.
 *
 * One section per `section_number` (rows without a section_number land
 * in section 0). Each section's `unit_material_cost` is set to 1 and
 * `qty` to the sum of `unit_material_cost * quantity` so the pricing
 * engine arithmetic (`unit_material_cost * qty`) lands at the correct
 * material total. Labour-hours per unit are pre-aggregated per category.
 *
 * This is the bridge the configurator uses to flow a freshly-expanded
 * BOM into the pricing engine without losing precision.
 */
function sectionsFromBomRows(rows) {
  const grouped = new Map();
  for (const r of rows || []) {
    const id = r.section_number != null ? String(r.section_number) : '0';
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        description: `Section ${id}`,
        material_total: 0,
        copper_total: 0,
        labour_hours: { CU: 0, ASM: 0, CNT: 0, QC: 0, TST: 0, ENG: 0, CAD: 0 },
        line_items: [],
      });
    }
    const sec = grouped.get(id);
    sec.material_total += num(r.unit_material_cost, 0) * num(r.quantity, 1);
    sec.copper_total += num(r.copper_weight_per_unit, 0) * num(r.quantity, 1);
    sec.labour_hours.CU += num(r.lbr_cu, 0) * num(r.quantity, 1);
    sec.labour_hours.ASM += num(r.lbr_asm, 0) * num(r.quantity, 1);
    sec.labour_hours.CNT += num(r.lbr_cnt, 0) * num(r.quantity, 1);
    sec.labour_hours.QC += num(r.lbr_qc, 0) * num(r.quantity, 1);
    sec.labour_hours.TST += num(r.lbr_tst, 0) * num(r.quantity, 1);
    sec.labour_hours.ENG += num(r.lbr_eng, 0) * num(r.quantity, 1);
    sec.labour_hours.CAD += num(r.lbr_cad, 0) * num(r.quantity, 1);
  }

  // Encode the aggregate as `qty=1` + `unit_material_cost=material_total`
  // so the pricingEngine multiplies once and lands on the right number.
  return Array.from(grouped.values()).map((sec) => ({
    id: sec.id,
    description: sec.description,
    qty: 1,
    unit_material_cost: sec.material_total,
    copper_weight_per_unit: sec.copper_total,
    labor_hours_per_unit: sec.labour_hours,
    line_items: sec.line_items,
  }));
}

module.exports = {
  STEP_KEYS,
  expandConfig,
  buildRow,
  hydrateEntry,
  sectionsFromBomRows,
};
