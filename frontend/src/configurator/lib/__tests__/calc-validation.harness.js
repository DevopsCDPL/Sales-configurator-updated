'use strict';
/* eslint-disable no-console */
/**
 * calc-validation.harness.js — INDEPENDENT reference-case validation of the
 * frontend calculation engines (load calc v1/v2, NEC 240.6 ladder, lineup
 * proposal packing, copper estimator).
 *
 * The repo CRA/babel toolchain cannot parse the existing engines-v2.test.ts
 * (legacy `<any>` cast syntax → babel SyntaxError), so this harness runs the
 * engines transpiled with `tsc` to CommonJS. Build + run:
 *
 *   cd frontend
 *   npx tsc --outDir /tmp/cv --module commonjs --target ES2019 --esModuleInterop \
 *     --skipLibCheck --moduleResolution node --resolveJsonModule \
 *     src/configurator/lib/us-standards.ts src/configurator/lib/load-calculation-v2.ts \
 *     src/configurator/lib/load-calculation.ts src/configurator/lib/copper-estimator.ts \
 *     src/configurator/lib/lineup-proposal.ts src/configurator/lib/safety-rules.ts
 *   LIB=/tmp/cv node src/configurator/lib/__tests__/calc-validation.harness.js
 *
 * Every expected value below is HAND-COMPUTED from the cited NEC / UL 891
 * rule with the arithmetic shown — never copied from engine output.
 */

const LIB = process.env.LIB || '/tmp/cv';
const { DEFAULT_STANDARDS, nextLadder, motorFla } = require(LIB + '/us-standards.js');
const { computeLoadV2, breakerAdmits } = require(LIB + '/load-calculation-v2.js');
const { calculateSectionLoad } = require(LIB + '/load-calculation.js');
const { estimateCopper, CU_DENSITY_LB_IN3 } = require(LIB + '/copper-estimator.js');
const { proposeLineup } = require(LIB + '/lineup-proposal.js');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; } else { fail++; fails.push({ name, detail }); }
}
const approx = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= (tol == null ? 0.5 : tol);

// ─────────────────────────────────────────────────────────────────────────
// 1. LOAD CALC v2 — design current per feeder (NEC 215.2 / 210.19 / 430.250)
//    I_3ph = kVA*1000/(√3*Vll);  I_1ph = kVA*1000/Vll;  √3 = 1.7320508
// ─────────────────────────────────────────────────────────────────────────

// CASE 1a: 100 kW, 480Y/277 3Ø, PF 0.90, continuous.
//   I = 100000/(1.7320508*480*0.90) = 100000/748.246 = 133.65 A
//   design (continuous ×1.25) = 133.65*1.25 = 167.06 A
//   NEC 240.6 next standard ≥167.06 = 175 A
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'kW', loadValue: 100, powerFactor: 0.9, continuous: true });
  ok('1a kW3Ø base 133.65A', approx(r.baseCurrentA, 133.65, 0.2), r.baseCurrentA);
  ok('1a kW3Ø design 167.06A', approx(r.designCurrentA, 167.06, 0.3), r.designCurrentA);
  ok('1a NEC240.6 ladder → 175A', r.recommendedRatingA === 175, r.recommendedRatingA);
}

// CASE 1b: same but non-continuous → no 1.25.  design = 133.65 A → ladder 150 A
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'kW', loadValue: 100, powerFactor: 0.9, continuous: false });
  ok('1b non-continuous design = base', approx(r.designCurrentA, 133.65, 0.2), r.designCurrentA);
  ok('1b ladder → 150A', r.recommendedRatingA === 150, r.recommendedRatingA);
}

// CASE 1c: 500 kVA, 208Y/120 3Ø.
//   I = 500000/(1.7320508*208) = 500000/360.266 = 1387.86 A
//   design ×1.25 = 1734.83 A → NEC 240.6 next ≥ = 2000 A
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '208Y/120', loadInputMode: 'kVA', loadValue: 500 });
  ok('1c kVA208 base 1387.9A', approx(r.baseCurrentA, 1387.86, 1.5), r.baseCurrentA);
  ok('1c design 1734.8A', approx(r.designCurrentA, 1734.83, 2), r.designCurrentA);
  ok('1c ladder → 2000A', r.recommendedRatingA === 2000, r.recommendedRatingA);
}

// CASE 1d: 1Ø, 24 kW, 240/120-1, PF 1.0.
//   I = 24000/240 = 100.0 A; design ×1.25 = 125.0 A → ladder 125 A (exact hit)
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '240/120-1', loadInputMode: 'kW', loadValue: 24, powerFactor: 1 });
  ok('1d 1Ø 24kW = 100A', approx(r.baseCurrentA, 100, 0.1), r.baseCurrentA);
  ok('1d design 125A', approx(r.designCurrentA, 125, 0.1), r.designCurrentA);
  ok('1d ladder exact 125A', r.recommendedRatingA === 125, r.recommendedRatingA);
}

// CASE 1e: HP mode — 50 HP @ 460V column (480Y vLL=480 → 245<480≤500 → v460).
//   NEC 430.250 FLA(50HP,460V) = 65 A.  Largest motor in section ×1.25 (430.24)
//   = 81.25 A.  HP mode must NOT also apply the 1.25 continuous factor.
//   ladder ≥81.25 = 90 A.
{
  const fla = motorFla(DEFAULT_STANDARDS, 50, 480);
  ok('1e FLA(50HP,460V) = 65A', fla === 65, fla);
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'HP', loadValue: 50, isLargestMotorInSection: true });
  ok('1e design 81.25A (no double 1.25)', approx(r.designCurrentA, 81.25, 0.1), r.designCurrentA);
  ok('1e ladder → 90A', r.recommendedRatingA === 90, r.recommendedRatingA);
}

// CASE 1f: kVA 1Ø — 10 kVA @ 240/120-1 → 10000/240 = 41.67 A; ×1.25 = 52.08 → 60A
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '240/120-1', loadInputMode: 'kVA', loadValue: 10 });
  ok('1f kVA1Ø base 41.67A', approx(r.baseCurrentA, 41.67, 0.1), r.baseCurrentA);
  ok('1f ladder → 60A', r.recommendedRatingA === 60, r.recommendedRatingA);
}

// CASE 1g: demand + diversity factors. 200 kW 480Y PF .85 df .8 dv .9 continuous.
//   I = 200000/(1.7320508*480*.85) = 200000/706.677 = 283.01 A
//   adjusted = 283.01*.8*.9 = 203.77 A; design ×1.25 = 254.71 → ladder 300A
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'kW', loadValue: 200, powerFactor: 0.85, demandFactor: 0.8, diversityFactor: 0.9, continuous: true });
  ok('1g base 283.0A', approx(r.baseCurrentA, 283.01, 0.5), r.baseCurrentA);
  ok('1g adjusted 203.8A', approx(r.adjustedCurrentA, 203.77, 0.5), r.adjustedCurrentA);
  ok('1g design 254.7A', approx(r.designCurrentA, 254.71, 0.6), r.designCurrentA);
  ok('1g ladder → 300A', r.recommendedRatingA === 300, r.recommendedRatingA);
}

// CASE 1h: breakerAdmits — 100%-rated device admits at adjusted (un-inflated)
//   current (NEC 210.19(A)(1) Exception); 80%-rated needs ≥ designCurrent.
{
  const r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'A', loadValue: 160, continuous: true });
  // adjusted = 160, design = 200. A 200A 80%-rated admits; a 175A would not.
  ok('1h 80%-rated 200A admits design200', breakerAdmits(200, 80, r) === true);
  ok('1h 80%-rated 175A rejects design200', breakerAdmits(175, 80, r) === false);
  ok('1h 100%-rated 175A admits adjusted160', breakerAdmits(175, 100, r) === true);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. NEC 240.6(A) DEVICE LADDER — verify array + round-UP direction.
//    Authoritative 240.6(A) set: 15,20,25,30,35,40,45,50,60,70,80,90,100,110,
//    125,150,175,200,225,250,300,350,400,450,500,600,700,800,1000,1200,1600,
//    2000,2500,3000,4000,5000,6000.
// ─────────────────────────────────────────────────────────────────────────
{
  const NEC_240_6 = [15,20,25,30,35,40,45,50,60,70,80,90,100,110,125,150,175,200,225,250,300,350,400,450,500,600,700,800,1000,1200,1600,2000,2500,3000,4000,5000,6000];
  const eng = DEFAULT_STANDARDS.deviceLadder_A;
  ok('2a deviceLadder matches NEC 240.6(A) exactly', JSON.stringify(eng) === JSON.stringify(NEC_240_6), eng);
  ok('2b nextLadder rounds UP (101 → 110)', nextLadder(eng, 101) === 110);
  ok('2c nextLadder exact hit (200 → 200)', nextLadder(eng, 200) === 200);
  ok('2d nextLadder over-range (7000 → null)', nextLadder(eng, 7000) === null);
  ok('2e nextLadder tiny (1 → 15)', nextLadder(eng, 1) === 15);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. LOAD CALC v1 (legacy load-calculation.ts) — independent sanity.
//    Note v1 uses kW directly with NO power factor (treats kW≈kVA).
//    100 kW, 415V 3Ø, df=dv=1: I = 100*1000/(√3*415)=139.12 A; ×1.25=173.9 A
//    v1 STANDARD_RATINGS=[63,100,160,250,...]; next ≥173.9 = 250 A
// ─────────────────────────────────────────────────────────────────────────
{
  const r = calculateSectionLoad({ connectedLoad: '100', demandFactor: '1', diversityFactor: '1', systemVoltage: '415', phase: 'Three Phase (3P)', userDefinedCurrent: '' });
  ok('3a v1 raw 139.1A', approx(r.rawCurrent, 139.12, 0.2), r.rawCurrent);
  ok('3a v1 design 173.9A', approx(r.calculatedCurrent, 173.9, 0.3), r.calculatedCurrent);
  ok('3a v1 ladder → 250A', r.recommendedBreaker === 250, r.recommendedBreaker);
  // 1Ø 10kW @230 df dv 1: I=10000/230=43.48; ×1.25=54.35 → next ≥ =63A
  const r2 = calculateSectionLoad({ connectedLoad: '10', demandFactor: '1', diversityFactor: '1', systemVoltage: '230', phase: 'Single Phase (1P)', userDefinedCurrent: '' });
  ok('3b v1 1Ø raw 43.48A', approx(r2.rawCurrent, 43.48, 0.1), r2.rawCurrent);
  ok('3b v1 1Ø ladder → 63A', r2.recommendedBreaker === 63, r2.recommendedBreaker);
}

// ─────────────────────────────────────────────────────────────────────────
// 4. COPPER ESTIMATOR — geometry → weight (Cu density 0.323 lb/in³).
//    busSchedule[2000A] = barsPerPhase 3, 0.25"×4" = 1.0 in² area.
//    Run = three 30" sections = 90".  neutral 100%.  ground 0.25×2 = 0.5 in².
//    mainBus = 3 bars × 1.0 in² × 90" × 3 phases × 0.323 = 261.63 lb
//    neutral = 3 × 1.0 × 90 × 0.323 × (100/100) = 87.21 lb
//    ground  = 0.25 × 2 × 90 × 0.323 = 14.535 lb
//    supports @65kA → spacing 10": ceil(90/10)+1 = 9+1 = 10
//    est = raw × 1.15; cost = est × price × (1 + 10/100)
// ─────────────────────────────────────────────────────────────────────────
{
  ok('4-pre Cu density 0.323', CU_DENSITY_LB_IN3 === 0.323);
  const est = estimateCopper(DEFAULT_STANDARDS, {
    mainBusRatingA: 2000, material: 'Cu', neutralPct: 100, sccrKA: 65,
    sectionWidthsIn: [30, 30, 30], busZoneHeightsIn: [12, 12, 12],
    devices: [], groundBar: { thkIn: 0.25, wIn: 2 }, pricePerLb: 4.5,
  });
  ok('4a mainBus 261.63 lb', approx(est.mainBusLbs, 261.63, 0.3), est.mainBusLbs);
  ok('4b neutral 87.21 lb', approx(est.neutralLbs, 87.21, 0.2), est.neutralLbs);
  ok('4c ground 14.54 lb', approx(est.groundLbs, 14.54, 0.1), est.groundLbs);
  ok('4d raw = Σ parts', approx(est.rawLbs, est.mainBusLbs + est.neutralLbs + est.groundLbs + est.riserLbs + est.stubLbs, 0.05), est.rawLbs);
  ok('4e est = raw×1.15', approx(est.estimatedLbs, est.rawLbs * 1.15, 0.05), [est.estimatedLbs, est.rawLbs]);
  // cost = est × 4.5 × 1.10 — verify contingency applied ONCE (not also on lbs)
  ok('4f cost = est×price×1.10', approx(est.costUsd, est.estimatedLbs * 4.5 * 1.10, 0.05), est.costUsd);
  ok('4g supports ceil(90/10)+1 = 10', est.supports === 10, est.supports);
  ok('4h perSection length 3', est.perSection.length === 3, est.perSection.length);
  // perSection sum (no risers, no stubs) should ≈ mainBus+neutral+ground
  const psSum = est.perSection.reduce((a, p) => a + p.lbs, 0);
  ok('4i perSection sum = body lbs', approx(psSum, est.mainBusLbs + est.neutralLbs + est.groundLbs, 0.1), psSum);
}

// CASE 4j: device stub. one 400A 3-pole device (sched 400A: 0.25×2=0.5 in²).
//   stub = 0.5 × 24" × 3 poles × 0.323 = 11.628 lb
{
  const est = estimateCopper(DEFAULT_STANDARDS, {
    mainBusRatingA: 400, material: 'Cu', neutralPct: 100, sccrKA: 65,
    sectionWidthsIn: [20], busZoneHeightsIn: [12],
    devices: [{ ratedA: 400, poles: 3, sectionIndex: 1 }],
    groundBar: { thkIn: 0.25, wIn: 2 }, pricePerLb: 4,
  });
  ok('4j stub 11.628 lb', approx(est.stubLbs, 11.628, 0.05), est.stubLbs);
}

// ─────────────────────────────────────────────────────────────────────────
// 5. LINEUP PROPOSAL — main sizing, MAIN_TIE_MAIN halving, packing cap,
//    pickCheapest provenance ranking.
// ─────────────────────────────────────────────────────────────────────────
const mkCand = (over) => Object.assign({
  componentId: 'c', partNumber: 'P', manufacturer: 'M', frameModel: 'fm',
  ratedA: 400, interruptingKA: 65, poles: 3, mounting: 'Fixed', pctRated: 80,
  deviceClass: 'MCCB', heightIn: 9, widthIn: 10, depthIn: 10,
  price: 1000, priceStatus: 'FIRM', priceSource: 'manual',
}, over);

// CASE 5a: provenance rank. vendor-import beats cheaper manual.
{
  const cands = [
    mkCand({ componentId: 'cheap-manual', price: 500, priceSource: 'manual' }),
    mkCand({ componentId: 'vendor', price: 900, priceSource: 'vendor-import' }),
    mkCand({ componentId: 'rfq', price: 600, priceSource: 'rfq' }),
  ];
  const p = proposeLineup(DEFAULT_STANDARDS, {
    voltageSystemCode: '480Y/277', serviceEntrance: false, utilityFaultKA: 65,
    sourceScheme: 'SINGLE', environment: 'Indoor', specialEnvironment: 'None',
    feeders: [{ rowId: 'r1', description: 'f', loadType: 'General', loadInputMode: 'A', loadValue: 300, continuous: true }],
  }, { candidateProvider: () => cands });
  const picked = p.sections.flatMap((s) => s.devices).find((d) => d.role === 'FEEDER')?.device;
  ok('5a vendor-import wins over cheaper manual', picked && picked.componentId === 'vendor', picked && picked.componentId);
}

// CASE 5b: MAIN_TIE_MAIN halving. feeder 300A continuous → design 375A.
//   totalFeederLoad ≈375; perMain = 375/2 = 187.5 → main device ladder ≥187.5=200A.
//   mainBus ladder uses loadBasis=375 → mainBusLadder next ≥375 = 400A.
{
  const cands = [mkCand({ ratedA: 250, priceSource: 'vendor-import' })];
  const p = proposeLineup(DEFAULT_STANDARDS, {
    voltageSystemCode: '480Y/277', serviceEntrance: true, utilityFaultKA: 65,
    sourceScheme: 'MAIN_TIE_MAIN', environment: 'Indoor', specialEnvironment: 'None',
    feeders: [{ rowId: 'r1', description: 'f', loadType: 'General', loadInputMode: 'A', loadValue: 300, continuous: true }],
  }, { candidateProvider: () => cands });
  ok('5b totalFeederLoad ≈ 375A', approx(p.totalFeederLoadA, 375, 0.5), p.totalFeederLoadA);
  ok('5b mainBus ladder → 400A', p.boardPatch.mainBusRatingA === 400, p.boardPatch.mainBusRatingA);
  const mains = p.sections.flatMap((s) => s.devices).filter((d) => d.role === 'MAIN');
  const tie = p.sections.flatMap((s) => s.devices).find((d) => d.role === 'TIE');
  ok('5b two mains', mains.length === 2, mains.length);
  // perMain design current = 187.5 → device ladder ≥187.5 = 200A
  ok('5b main recommendedRating 200A (half of 375)', mains[0] && mains[0].recommendedRatingA === 200, mains[0] && mains[0].recommendedRatingA);
  ok('5b tie sized to perMain 200A', tie && tie.recommendedRatingA === 200, tie && tie.recommendedRatingA);
}

// CASE 5c: packing 80% fill cap. Frame usableDeviceHeight 62".
//   cap = 0.8 × 62 = 49.6".  Each feeder envelope 9" + 4" clearance = 13" used.
//   floor(49.6 / 13) = 3 feeders per section.  6 feeders → 2 sections.
{
  const cands = [mkCand({ heightIn: null, ratedA: 250, priceSource: 'vendor-import' })];
  const feeders = [];
  for (let i = 0; i < 6; i++) feeders.push({ rowId: 'r' + i, description: 'f' + i, loadType: 'General', loadInputMode: 'A', loadValue: 150, continuous: true });
  const p = proposeLineup(DEFAULT_STANDARDS, {
    voltageSystemCode: '480Y/277', serviceEntrance: false, utilityFaultKA: 65,
    sourceScheme: 'SINGLE', environment: 'Indoor', specialEnvironment: 'None', feeders,
  }, { candidateProvider: () => cands, maxSections: 20 });
  const feederSections = p.sections.filter((s) => s.role === 'FEEDER');
  // 6 feeders, 3 per section under the 49.6" cap → 2 feeder sections
  ok('5c 6 feeders → 2 feeder sections (3/section under 0.8 cap)', feederSections.length === 2, feederSections.map((s) => s.devices.length));
  // each used = 3×13 = 39" ≤ 49.6 cap
  ok('5c section used = 39"', feederSections.every((s) => approx(s.usedHeightIn, 39, 0.01) || approx(s.usedHeightIn, 26, 0.01)), feederSections.map((s) => s.usedHeightIn));
}

// ─────────────────────────────────────────────────────────────────────────
console.log(`\nFRONTEND ENGINES: ${pass} passed, ${fail} failed`);
if (fail) { for (const f of fails) console.log('  FAIL:', f.name, '->', JSON.stringify(f.detail)); }
process.exit(fail ? 1 : 0);
