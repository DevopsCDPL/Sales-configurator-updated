'use strict';
/**
 * PARITY GATE — Phase A spec §9.3 (release blocker)
 *
 * v1 path  : expandConfig → sectionsFromBomRows → computeQuote
 * v2 path  : v2PricingAdapter (reuses the same bomEngine functions)
 * Totals must match to the cent. Run: node parityGate.test.js
 *
 * NOTE: synthetic fixture here; the staging gate additionally replays
 * every REAL client configuration from the production DB dump.
 */
const { expandConfig, sectionsFromBomRows } = require('../bomEngine');
const { computeQuote } = require('../pricingEngine');
const { computeQuoteFromV2 } = require('../v2PricingAdapter');

const comps = [
  { id: 'c-enc', part_number: 'TPS-ENC-3036', name: 'Enclosure 30x36', category: 'ENCLOSURE', mat_cost: '3100.0000', lbr_asm: '13.7500', lbr_qc: '1.0000' },
  { id: 'c-acb', part_number: 'NW20H1', name: 'ACB 2000A', category: 'CIRCUIT BREAKER', mat_cost: '25000.0000', lbr_asm: '4.0000', lbr_tst: '2.0000' },
  { id: 'c-mccb', part_number: 'NSX400', name: 'MCCB 400A', category: 'CIRCUIT BREAKER', mat_cost: '2000.0000', lbr_asm: '1.0000' },
  { id: 'c-spd', part_number: 'SPD-100', name: 'SPD 100kA', category: 'SPD', mat_cost: '1500.0000', lbr_cnt: '0.5000' },
  { id: 'c-ct', part_number: 'CT-2000-5', name: 'CT 2000:5', category: 'CURRENT TRANSFORMER', mat_cost: '180.0000', lbr_cnt: '0.2500' },
];
const catalog = { byId: new Map(comps.map((c) => [c.id, c])), byPartNumber: new Map(comps.map((c) => [c.part_number, c])) };
const lookup = { LBR_CU_rate: 95, LBR_ASM_rate: 65, LBR_CNT_rate: 70, LBR_QC_rate: 80, LBR_TST_rate: 85, LBR_ENG_rate: 110, LBR_CAD_rate: 90 };
const pricing = { strategy: 'DESIRED GM%', desired_gm_pct: 0.32, roundup_factor: 10 };

const v1 = {
  system_design: { selected_components: [
    { component_id: 'c-acb', quantity: 1, section_number: 1 },
    { component_id: 'c-mccb', quantity: 3, section_number: 2 },
  ] },
  enclosure: { selected_components: [
    { component_id: 'c-enc', quantity: 1, section_number: 1 },
    { component_id: 'c-enc', quantity: 1, section_number: 2 },
  ] },
  spd_ats: { selected_components: [{ component_id: 'c-spd', quantity: 1 }] },
  ct_vt_cpt: { selected_components: [{ component_id: 'c-ct', quantity: 6, section_number: 2 }] },
};
const v2board = {
  sections: [
    { sectionIndex: 1, deviceLines: [{ componentId: 'c-acb', category: 'CIRCUIT BREAKER', quantity: 1, scope: 'section', sectionIndex: 1 }] },
    { sectionIndex: 2, deviceLines: [{ componentId: 'c-mccb', category: 'CIRCUIT BREAKER', quantity: 3, scope: 'section', sectionIndex: 2 }] },
  ],
  componentLines: [
    { componentId: 'c-enc', category: 'ENCLOSURE', quantity: 1, scope: 'section', sectionIndex: 1 },
    { componentId: 'c-enc', category: 'ENCLOSURE', quantity: 1, scope: 'section', sectionIndex: 2 },
    { componentId: 'c-spd', category: 'SPD', quantity: 1, scope: 'board' },
    { componentId: 'c-ct', category: 'CURRENT TRANSFORMER', quantity: 6, scope: 'section', sectionIndex: 2 },
  ],
  laborAdjustments: [],
};

const v1quote = computeQuote({ sections: sectionsFromBomRows(expandConfig(v1, catalog).rows), lookup, pricing });
const v2quote = computeQuoteFromV2(v2board, catalog, lookup, pricing);
const pick = (qq) => ({ material: qq.totals?.material_total ?? qq.totals?.section_cost_total, total_cost: qq.total_cost, rounded: qq.pricing?.rounded_price, gm: qq.pricing?.actual_gm, labor: qq.labor_costs });
const a = JSON.stringify(pick(v1quote));
const b = JSON.stringify(pick(v2quote));
if (a !== b) { console.error('PARITY FAILED\nv1:', a, '\nv2:', b); process.exit(1); }

const adj = computeQuoteFromV2({ ...v2board, laborAdjustments: [{ bucket: 'ASM', hours: 10, reason: 'field wiring allowance' }] }, catalog, lookup, pricing);
if (Math.abs((adj.total_cost - v2quote.total_cost) - 650) > 1e-9) { console.error('labour adjustment delta wrong'); process.exit(1); }
console.log('PARITY GATE: identical to the cent ✓  (labour adjustment path ✓)');
