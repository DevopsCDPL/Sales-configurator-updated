'use strict';
/* eslint-disable no-console */
/**
 * calc-validation.js — INDEPENDENT reference-case validation of the backend
 * calculation engines (copper estimator, BOM-v2 quantity generators, labour
 * engine, pricing engine GM math + multi-unit proration logic).
 *
 * Plain CommonJS — no jest. Run:  node src/services/configurator/__verify__/calc-validation.js
 *
 * Every expected value is HAND-COMPUTED from the cited rule with arithmetic
 * shown — never copied from engine output.
 */

const path = require('path');
const DIR = path.join(__dirname, '..');
const copper = require(path.join(DIR, 'copperEstimator.js'));
const { compileBomV2 } = require(path.join(DIR, 'bomEngineV2.js'));
const labour = require(path.join(DIR, 'labourEngine.js'));
const pricing = require(path.join(DIR, 'pricingEngine.js'));

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; fails.push({ name, detail }); }
}
const approx = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= (tol == null ? 0.005 : tol);

// Reference standards (mirrors DEFAULT_STANDARDS bus schedule rows used).
const STD = {
  busSchedule: [
    { ratingA: 400, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 2, plating: 'Tin', bracing_kA: 65, neutralPct: 100 },
    { ratingA: 800, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 65, neutralPct: 100 },
    { ratingA: 2000, material: 'Cu', barsPerPhase: 3, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 100, neutralPct: 100 },
  ],
  busSupportSpacing: [
    { sccr_kA: 65, maxSpacing_in: 10 },
    { sccr_kA: 100, maxSpacing_in: 6 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// 1. COPPER ESTIMATOR (backend twin) — same geometry as frontend case 4.
//    Cu density 0.323. 2000A row: 3 bars × 0.25×4(=1.0 in²). run 90".
//    main = 3×1.0×90×3×0.323 = 261.63; neutral 100% = 87.21; ground 14.535.
//    raw×1.15; cost = est×price×1.10 (contingency applied ONCE).
// ─────────────────────────────────────────────────────────────────────────
{
  ok('1-pre Cu density 0.323', copper.CU_DENSITY_LB_IN3 === 0.323, copper.CU_DENSITY_LB_IN3);
  const est = copper.estimateCopper(STD, {
    mainBusRatingA: 2000, material: 'Cu', neutralPct: 100, sccrKA: 65,
    sectionWidthsIn: [30, 30, 30], busZoneHeightsIn: [12, 12, 12],
    devices: [], groundBar: { thkIn: 0.25, wIn: 2 }, pricePerLb: 4.5,
  });
  ok('1a mainBus 261.63', approx(est.mainBusLbs, 261.63, 0.3), est.mainBusLbs);
  ok('1b neutral 87.21', approx(est.neutralLbs, 87.21, 0.2), est.neutralLbs);
  ok('1c ground 14.54', approx(est.groundLbs, 14.54, 0.1), est.groundLbs);
  ok('1d raw = Σ', approx(est.rawLbs, est.mainBusLbs + est.neutralLbs + est.groundLbs + est.riserLbs + est.stubLbs, 0.05), est.rawLbs);
  ok('1e est = raw×1.15', approx(est.estimatedLbs, est.rawLbs * 1.15, 0.05), [est.estimatedLbs, est.rawLbs]);
  ok('1f cost = est×4.5×1.10 (contingency once)', approx(est.costUsd, est.estimatedLbs * 4.5 * 1.10, 0.05), est.costUsd);
  ok('1g supports ceil(90/10)+1 = 10', est.supports === 10, est.supports);
  // backend twin must equal frontend twin: both use 0.323 + same formulae.
}

// CASE 1h: stub. 400A 3-pole, sched 400A 0.25×2=0.5 in².
//   stub = 0.5 × 24 × 3 × 0.323 = 11.628
{
  const est = copper.estimateCopper(STD, {
    mainBusRatingA: 400, material: 'Cu', neutralPct: 100, sccrKA: 65,
    sectionWidthsIn: [20], busZoneHeightsIn: [12],
    devices: [{ ratedA: 400, poles: 3, sectionIndex: 1 }],
    groundBar: { thkIn: 0.25, wIn: 2 }, pricePerLb: 4,
  });
  ok('1h stub 11.628', approx(est.stubLbs, 11.628, 0.05), est.stubLbs);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. BOM-v2 QUANTITY GENERATORS.
//    board 2000A 65kA neutral 100%; 3 sections × 30" frame → run 90".
//    sched[2000] barsPerPhase 3.
//    GEN-BUS-MAIN phase qty = barsPerPhase×3 = 9.
//    neutral = ceil(3 × 100/100) = 3.
//    GEN-GLASTIC qty = ceil(90/10)+1 = 10  (65kA → spacing 10").
//    GEN-HW-JOINT = (sections-1)×barsPerPhase×3 = 2×3×3 = 18.
//    GEN-LABEL arc-flash = max(sections,1) = 3.
// ─────────────────────────────────────────────────────────────────────────
{
  const board = { id: 'b1', name: 'B', boardData: { mainBusRating: 2000, shortCircuitRating: 65, neutralRating: '100%' } };
  const sections = [1, 2, 3].map((i) => ({ id: 's' + i, sectionIndex: i, layout: { frame: { width_in: 30 } }, computed: { remainingHeightIn: 0 } }));
  const std = { busSchedule: STD.busSchedule, busSupportSpacing: STD.busSupportSpacing, safetyItemsMap: [] };
  const out = compileBomV2(board, sections, [], std, null);
  const find = (frag) => out.rows.find((r) => (r.description || '').includes(frag));
  ok('2a GEN-BUS phase qty = barsPerPhase×3 = 9', find('Phase bus').quantity === 9, find('Phase bus').quantity);
  ok('2b neutral qty = ceil(3×100%) = 3', find('Neutral bus').quantity === 3, find('Neutral bus').quantity);
  ok('2c ground qty 1', find('Ground bus').quantity === 1, find('Ground bus').quantity);
  ok('2d GEN-GLASTIC qty = ceil(90/10)+1 = 10', find('Bus support (glastic)').quantity === 10, find('Bus support (glastic)').quantity);
  ok('2e GEN-HW-JOINT = (3-1)×3×3 = 18', find('Bus joint kit').quantity === 18, find('Bus joint kit').quantity);
  ok('2f GEN-LABEL arc-flash = 3 sections', find('Arc-flash').quantity === 3, find('Arc-flash').quantity);
}

// CASE 2g: neutral pct rounding. 1600A row barsPerPhase 2; 200% neutral.
//   neutral = ceil(2 × 200/100) = ceil(4) = 4.  Use 800A row (bpp 1), 200% → ceil(2)=2.
{
  const board = { id: 'b2', name: 'B', boardData: { mainBusRating: 800, shortCircuitRating: 65, neutralRating: '200%' } };
  const sections = [{ id: 's1', sectionIndex: 1, layout: { frame: { width_in: 20 } }, computed: {} }];
  const std = { busSchedule: STD.busSchedule, busSupportSpacing: STD.busSupportSpacing, safetyItemsMap: [] };
  const out = compileBomV2(board, sections, [], std, null);
  const n = out.rows.find((r) => (r.description || '').includes('Neutral bus'));
  ok('2g neutral 200% on bpp1 = ceil(1×2) = 2', n.quantity === 2, n.quantity);
  // single section → no joint kits
  ok('2g no joint kit for single section', !out.rows.some((r) => (r.description || '').includes('Bus joint kit')));
}

// CASE 2h: COPPER_RATE_PER_LB anti-double-count — copper enters BOM as a
//   priced ESTIMATED material row; the quote lookup zeroes COPPER_RATE_PER_LB
//   so pricingEngine's copper path adds nothing on top.
{
  const board = { id: 'b3', name: 'B', boardData: { mainBusRating: 800, shortCircuitRating: 65, neutralRating: '100%' } };
  const sections = [{ id: 's1', sectionIndex: 1, layout: { frame: { width_in: 20 } }, computed: {} }];
  const std = { busSchedule: STD.busSchedule, busSupportSpacing: STD.busSupportSpacing, safetyItemsMap: [] };
  const copperEst = { estimatedLbs: 100, costUsd: 495, pricePerLb: 4.5 };
  const out = compileBomV2(board, sections, [], std, copperEst);
  const cu = out.rows.find((r) => r.generator_id === 'GEN-COPPER-EST');
  ok('2h copper row priced via costUsd', cu && cu.unit_cost === 495 && cu.price_status === 'ESTIMATED', cu && cu.unit_cost);
  ok('2h copper row qty 1 (lot)', cu && cu.quantity === 1 && cu.unit === 'lot', cu && cu.unit);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. LABOUR ENGINE — hours = Σ lbr_<cat> × qty;  cost = hours × rate.
//    Two rows: (qty2, lbr_cu .5)=1h cu; (qty1, lbr_asm 2, lbr_eng 1).
//    cu=1, asm=2, eng=1. rates cu 85 asm 75 eng 130.
//    cost cu=85, asm=150, eng=130; total = 365.
// ─────────────────────────────────────────────────────────────────────────
{
  const rows = [
    { quantity: 2, lbr_cu: 0.5 },
    { quantity: 1, lbr_asm: 2, lbr_eng: 1 },
  ];
  const agg = labour.aggregateHoursFromBomRows(rows);
  ok('3a cu hours = 0.5×2 = 1', approx(agg.hours.CU, 1), agg.hours.CU);
  ok('3b asm hours = 2', approx(agg.hours.ASM, 2), agg.hours.ASM);
  ok('3c eng hours = 1', approx(agg.hours.ENG, 1), agg.hours.ENG);
  ok('3d hours_total = 4', approx(agg.totals.hours_total, 4), agg.totals.hours_total);
  const lookup = { LBR_CU_rate: 85, LBR_ASM_rate: 75, LBR_ENG_rate: 130 };
  const c = labour.costFromHours(agg.hours, lookup);
  ok('3e cu cost 85', approx(c.costs.CU, 85), c.costs.CU);
  ok('3f asm cost 150', approx(c.costs.ASM, 150), c.costs.ASM);
  ok('3g eng cost 130', approx(c.costs.ENG, 130), c.costs.ENG);
  ok('3h cost_total 365', approx(c.totals.cost_total, 365), c.totals.cost_total);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. PRICING ENGINE — GROSS MARGIN math (CRITICAL).
//    price = cost / (1 − GM%)  (NOT cost×(1+GM%)).
//    cost 1000, GM 0.30 → target = 1000/0.70 = 1428.571…
//    roundup_factor -1 → round UP to nearest 10 → 1430.
//    actual_profit = 1430−1000 = 430; actual_gm = 430/1430 = 0.30070.
// ─────────────────────────────────────────────────────────────────────────
{
  const p = pricing.computePricing({ totalCost: 1000, pricing: { strategy: 'DESIRED GM%', desired_gm_pct: 0.30, roundup_factor: -1 } });
  ok('4a target = cost/(1−GM) = 1428.57', approx(p.target_price, 1428.5714, 0.01), p.target_price);
  ok('4a NOT markup (would be 1300)', Math.abs(p.target_price - 1300) > 100, p.target_price);
  ok('4b roundup -1 → 1430', p.rounded_price === 1430, p.rounded_price);
  ok('4c actual_profit 430', approx(p.actual_profit, 430), p.actual_profit);
  ok('4d actual_gm 0.30070', approx(p.actual_gm, 0.300699, 0.0001), p.actual_gm);
  // GM ≥ 1 must throw
  let threw = false;
  try { pricing.computePricing({ totalCost: 100, pricing: { strategy: 'DESIRED GM%', desired_gm_pct: 30 } }); } catch (e) { threw = true; }
  ok('4e GM≥1 throws (30 not 0.30)', threw);
}

// CASE 4f: Excel ROUNDUP semantics. roundup(1428.57, -1) = 1430;
//   roundup(1428.57, -2)=1500; roundup(1.234, 2)=1.24.
{
  ok('4f roundup(-1) nearest 10 up', pricing.roundup(1428.57, -1) === 1430, pricing.roundup(1428.57, -1));
  ok('4f roundup(-2) nearest 100 up', pricing.roundup(1428.57, -2) === 1500, pricing.roundup(1428.57, -2));
  ok('4f roundup(2) two decimals up', approx(pricing.roundup(1.234, 2), 1.24), pricing.roundup(1.234, 2));
}

// CASE 4g: full computeQuote — one section, material 1000, eng 2h@130, cad 1h@110.
//   labour = 2×130 + 1×110 = 370.  section_cost = 1000+370 = 1370.
//   overhead 10% → 137.  copper rate 0 → 0.  total = 1370+137 = 1507.
//   GM 0.25 → target = 1507/0.75 = 2009.33; roundup -1 → 2010.
{
  const q = pricing.computeQuote({
    sections: [{ id: 's1', description: 'S', qty: 1, unit_material_cost: 1000, copper_weight_per_unit: 0, labor_hours_per_unit: { ENG: 2, CAD: 1 }, line_items: [] }],
    lookup: { LBR_ENG_rate: 130, LBR_CAD_rate: 110, OVERHEAD_PCT: 0.10, COPPER_RATE_PER_LB: 0 },
    pricing: { strategy: 'DESIRED GM%', desired_gm_pct: 0.25, roundup_factor: -1 },
    schedule: {},
  });
  ok('4g material_total 1000', approx(q.totals.material_total, 1000), q.totals.material_total);
  ok('4g labour eng cost 260', approx(q.labor_costs.ENG, 260), q.labor_costs.ENG);
  ok('4g labour cad cost 110', approx(q.labor_costs.CAD, 110), q.labor_costs.CAD);
  ok('4g section_cost_total 1370', approx(q.totals.section_cost_total, 1370), q.totals.section_cost_total);
  ok('4g overhead 137', approx(q.totals.overhead_amount, 137), q.totals.overhead_amount);
  ok('4g total_cost 1507', approx(q.total_cost, 1507), q.total_cost);
  ok('4g target 2009.33', approx(q.pricing.target_price, 2009.333, 0.01), q.pricing.target_price);
  ok('4g rounded 2010', q.pricing.rounded_price === 2010, q.pricing.rounded_price);
}

// CASE 4h: copper double-count guard at quote level. Same as 4g but feed
//   copper_weight 50 + COPPER_RATE_PER_LB 4 → copper_cost = 200 ADDED.
//   This proves the rate path WOULD add cost; v2QuoteService sets it to 0
//   precisely because copper is already a priced BOM material row.
{
  const q = pricing.computeQuote({
    sections: [{ id: 's1', qty: 1, unit_material_cost: 1000, copper_weight_per_unit: 50, labor_hours_per_unit: {}, line_items: [] }],
    lookup: { OVERHEAD_PCT: 0, COPPER_RATE_PER_LB: 4 },
    pricing: { strategy: 'DESIRED GM%', desired_gm_pct: 0, roundup_factor: 0 },
    schedule: {},
  });
  ok('4h copper_cost = 50×4 = 200 (why rate is zeroed in v2)', approx(q.totals.copper_cost, 200), q.totals.copper_cost);
  ok('4h total = 1000 + 200', approx(q.total_cost, 1200), q.total_cost);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. MULTI-UNIT DESIGN-HOUR PRORATION (v2QuoteService logic, replicated).
//    Design (ENG+CAD) charged ONCE; everything else ×units.
//    Say per-unit total_cost 1507 of which designWithOverhead = (260+110)×1.10 = 407.
//    base = 1507 − 407 = 1100.  units 3.
//    totalCostN = 1100×3 + 407 = 3707.  perUnitCost = 3707/3 = 1235.67.
//    perUnitPrice = roundup(1235.67/(1−0.25), -1) = roundup(1647.56,-1)=1650.
//    totalPrice = 1650×3 = 4950.
// ─────────────────────────────────────────────────────────────────────────
{
  const { roundup } = pricing;
  const total_cost = 1507, designWithOverhead = (260 + 110) * 1.10, units = 3, gmPct = 0.25, rf = -1;
  const base = total_cost - designWithOverhead;            // 1100
  const totalCostN = base * units + designWithOverhead;     // 3707
  const perUnitCost = totalCostN / units;                   // 1235.667
  const perUnitPrice = roundup(perUnitCost / (1 - gmPct), rf); // 1650
  const totalPrice = perUnitPrice * units;                  // 4950
  ok('5a designWithOverhead 407', approx(designWithOverhead, 407), designWithOverhead);
  ok('5b base (non-design) 1100', approx(base, 1100), base);
  ok('5c totalCostN 3707 (design once)', approx(totalCostN, 3707), totalCostN);
  ok('5d perUnitCost 1235.67', approx(perUnitCost, 1235.667, 0.01), perUnitCost);
  ok('5e perUnitPrice 1650', perUnitPrice === 1650, perUnitPrice);
  ok('5f totalPrice 4950', totalPrice === 4950, totalPrice);
  // sanity: prorating design once is cheaper than naive ×units (which would
  // be 1507×3 = 4521 cost → more). design-once cost 3707 < naive 4521.
  ok('5g design-once cost < naive ×units', totalCostN < total_cost * units, [totalCostN, total_cost * units]);
}

// ─────────────────────────────────────────────────────────────────────────
console.log(`\nBACKEND ENGINES: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of fails) console.log('  FAIL:', f.name, '->', JSON.stringify(f.detail)); }
process.exit(fail ? 1 : 0);
