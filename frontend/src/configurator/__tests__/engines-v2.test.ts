import { DEFAULT_STANDARDS, nextLadder, busScheduleFor, busDensityOk, motorFla } from '../lib/us-standards';
import { computeLoadV2, breakerAdmits } from '../lib/load-calculation-v2';
import { evaluateSafetyRules } from '../lib/safety-rules';
import { proposeLineup, CandidateDevice } from '../lib/lineup-proposal';
import { estimateCopper, reconcileCopper } from '../lib/copper-estimator';
import { generateSld } from '../lib/sld-generator';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail?: any) => {
  if (cond) { pass++; } else { fail++; console.log('FAIL:', name, detail ?? ''); }
};
const approx = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

// ── load calc hand checks ──
// 100 kW, 480Y/277 3Ø, PF .9, continuous: I = 100000/(1.732*480*.9)=133.7 → design 167.1 → 175A
let r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'kW', loadValue: 100, powerFactor: 0.9, continuous: true });
ok('kW 3ph base', approx(r.baseCurrentA, 133.7, 0.3), r);
ok('kW 3ph design', approx(r.designCurrentA, 167.1, 0.5), r);
ok('kW 3ph recommended 175', r.recommendedRatingA === 175, r.recommendedRatingA);

// non-continuous: design = base
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'kW', loadValue: 100, powerFactor: 0.9, continuous: false });
ok('non-continuous no 1.25', approx(r.designCurrentA, 133.7, 0.3), r.designCurrentA);

// kVA: 500 kVA @208 → 500000/(1.732*208)=1387.9 → ×1.25=1734.9 → 2000A
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '208Y/120', loadInputMode: 'kVA', loadValue: 500 });
ok('kVA 208 base', approx(r.baseCurrentA, 1387.9, 1), r.baseCurrentA);
ok('kVA 208 rec 2000', r.recommendedRatingA === 2000, r.recommendedRatingA);

// 1Ø: 24 kW @240/120-1 PF1 → 100A → ×1.25 → 125A
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '240/120-1', loadInputMode: 'kW', loadValue: 24, powerFactor: 1 });
ok('1ph 24kW=100A', approx(r.baseCurrentA, 100, 0.1), r.baseCurrentA);
ok('1ph rec 125', r.recommendedRatingA === 125, r.recommendedRatingA);

// HP: 50HP @480 → FLA 65 ×1.25 = 81.25 → rec 90
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'HP', loadValue: 50, isLargestMotorInSection: true });
ok('50HP largest motor', approx(r.designCurrentA, 81.3, 0.2), r.designCurrentA);
ok('50HP rec 90', r.recommendedRatingA === 90, r.recommendedRatingA);

// override below design warns
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480Y/277', loadInputMode: 'A', loadValue: 400, userDefinedCurrent: 300 });
ok('override below warns', r.overrideBelowDesign && r.effectiveCurrentA === 500, r);

// 80/100 rated
const res = { designCurrentA: 500, adjustedCurrentA: 400 };
ok('80% needs 500', breakerAdmits(400, 80, res) === false && breakerAdmits(500, 80, res) === true);
ok('100% admits 400', breakerAdmits(400, 100, res) === true);

// demand factor validation
r = computeLoadV2(DEFAULT_STANDARDS, { voltageSystemCode: '480D', loadInputMode: 'A', loadValue: 100, demandFactor: 1.5 });
ok('df>1 errors', r.errors.length > 0);

// motor fla table
ok('FLA 100HP@460=124', motorFla(DEFAULT_STANDARDS, 100, 480) === 124);

// ladders + schedule
ok('ladder 1700→2000', nextLadder(DEFAULT_STANDARDS.mainBusLadder_A, 1700) === 2000);
ok('schedule 2000 = 3 bars', busScheduleFor(DEFAULT_STANDARDS, 2000)!.barsPerPhase === 3);
ok('density all rows ok', DEFAULT_STANDARDS.busSchedule.every(busDensityOk));

// ── safety rules ──
const sres = evaluateSafetyRules(
  { voltageSystemCode: '480Y/277', vLN: 277, wires: 4, serviceEntrance: true, environment: 'Outdoor', specialEnvironment: 'None', nemaType: '3R', mainDeviceRatingA: 2000 },
  [{ sectionIndex: 1, role: 'MAIN' }, { sectionIndex: 2, role: 'TIE' }, { sectionIndex: 3, role: 'FEEDER' }],
  [
    { lineId: 'm1', sectionIndex: 1, role: 'MAIN', frameRatingA: 2000, mounting: 'Drawout', tripUnitFeatures: ['LSI'], isMain: true },
    { lineId: 'f1', sectionIndex: 3, role: 'FEEDER', frameRatingA: 400, mounting: 'Fixed', tripUnitFeatures: [], isMain: false },
  ]
);
ok('R5 fires on 2000A no ERMS', sres.violations.some(v => v.ruleId === 'R5'));
ok('R6 fires (no G)', sres.violations.some(v => v.ruleId === 'R6'));
ok('R9 single main violation', sres.violations.some(v => v.ruleId === 'R9'));
ok('R7+R8+R10 items', ['R7','R8','R10'].every(id => sres.autoItems.some(i => i.ruleId === id)));
ok('outdoor filter 3R/4/4X', JSON.stringify(sres.enclosureFilter) === JSON.stringify(['3R','4','4X']));

// ── lineup proposal ──
const mkCand = (ratedA: number, cls: any, price: number): CandidateDevice => ({
  componentId: `c${ratedA}${cls}`, partNumber: `PN-${cls}-${ratedA}`, manufacturer: 'Schneider', frameModel: `${cls}${ratedA}`,
  ratedA, interruptingKA: 65, poles: 3, mounting: cls === 'ACB' ? 'Drawout' : 'Fixed', pctRated: 80,
  deviceClass: cls, heightIn: cls === 'ACB' ? 20 : 8, widthIn: 15, depthIn: 12, price, priceStatus: 'FIRM',
});
const ladder = [100, 225, 400, 600, 800, 1200, 1600, 2000, 2500, 3000];
const provider = (q: any) => ladder.filter(a => a >= q.designCurrentA).slice(0, 2)
  .map(a => mkCand(a, q.role === 'FEEDER' ? 'MCCB' : 'ACB', a * 10));
const proposal = proposeLineup(DEFAULT_STANDARDS, {
  voltageSystemCode: '480Y/277', serviceEntrance: true, utilityFaultKA: 'Unknown',
  sourceScheme: 'MAIN_TIE_MAIN', environment: 'Indoor', specialEnvironment: 'None', totalLoadHint: null,
  feeders: [
    { rowId: 'r1', description: 'Chiller 1', loadType: 'General', loadInputMode: 'A', loadValue: 400, qty: 2 },
    { rowId: 'r2', description: 'Pump', loadType: 'Motor', loadInputMode: 'HP', loadValue: 50 },
    { rowId: 'r3', description: 'Lighting', loadType: 'Lighting', loadInputMode: 'kW', loadValue: 50, powerFactor: 0.95 },
    { rowId: 'r4', description: 'Spare', loadType: 'Spare', loadInputMode: 'A', loadValue: 225 },
  ],
}, { maxSections: 10, candidateProvider: provider });
ok('proposal ok', proposal.ok, proposal.errors);
ok('proposal MTM = 2 mains + 1 tie sections min', proposal.sections.filter(s => s.role === 'MAIN').length === 2 && proposal.sections.filter(s => s.role === 'TIE').length === 1, proposal.sections.map(s => s.role));
ok('sccr assumed warning', proposal.boardPatch.sccrAssumed && proposal.boardPatch.sccrKA === 65);
ok('bus rating laddered', proposal.boardPatch.mainBusRatingA !== null && proposal.boardPatch.mainBusRatingA === 1200, proposal.boardPatch.mainBusRatingA);
ok('all feeders placed', proposal.unplaced.length === 0);
// determinism
const proposal2 = proposeLineup(DEFAULT_STANDARDS, {
  voltageSystemCode: '480Y/277', serviceEntrance: true, utilityFaultKA: 'Unknown',
  sourceScheme: 'MAIN_TIE_MAIN', environment: 'Indoor', specialEnvironment: 'None', totalLoadHint: null,
  feeders: [
    { rowId: 'r1', description: 'Chiller 1', loadType: 'General', loadInputMode: 'A', loadValue: 400, qty: 2 },
    { rowId: 'r2', description: 'Pump', loadType: 'Motor', loadInputMode: 'HP', loadValue: 50 },
    { rowId: 'r3', description: 'Lighting', loadType: 'Lighting', loadInputMode: 'kW', loadValue: 50, powerFactor: 0.95 },
    { rowId: 'r4', description: 'Spare', loadType: 'Spare', loadInputMode: 'A', loadValue: 225 },
  ],
}, { maxSections: 10, candidateProvider: provider });
ok('deterministic', JSON.stringify(proposal) === JSON.stringify(proposal2));

// ── copper estimator hand check ──
// 2000A Cu: 3 bars × (0.25×4=1 in²) ×, run = 3 sections × 30" = 90"
// main = 3×1×90×3×0.323 = 261.6 lb; neutral(100%) = 87.2; ground 0.25×2×90×0.323=14.5
const est = estimateCopper(DEFAULT_STANDARDS, {
  mainBusRatingA: 2000, material: 'Cu', neutralPct: 100, sccrKA: 65,
  sectionWidthsIn: [30, 30, 30], busZoneHeightsIn: [12, 12, 12],
  devices: [
    { ratedA: 2000, poles: 3, sectionIndex: 1 },
    { ratedA: 400, poles: 3, sectionIndex: 2 },
    { ratedA: 400, poles: 3, sectionIndex: 3 },
  ],
  groundBar: { thkIn: 0.25, wIn: 2 }, pricePerLb: 4.5,
});
ok('copper main bus 261.6', approx(est.mainBusLbs, 261.6, 0.5), est.mainBusLbs);
ok('copper neutral 87.2', approx(est.neutralLbs, 87.2, 0.5), est.neutralLbs);
ok('copper ground 14.5', approx(est.groundLbs, 14.5, 0.2), est.groundLbs);
ok('copper raw = sum', approx(est.rawLbs, est.mainBusLbs + est.neutralLbs + est.groundLbs + est.riserLbs + est.stubLbs, 0.1));
ok('copper est = raw×1.15', approx(est.estimatedLbs, est.rawLbs * 1.15, 0.5));
ok('supports 65kA spacing10: ceil(90/10)+1=10', est.supports === 10, est.supports);
ok('perSection count 3', est.perSection.length === 3);

const rec = reconcileCopper(500, 540, 4.5, 5);
ok('recon 8% review', rec.status === 'review' && approx(rec.deltaPct, 8, 0.1) && approx(rec.marginImpactUsd, 180, 0.1), rec);
const rec2 = reconcileCopper(500, 515, 4.5, 5);
ok('recon 3% ok', rec2.status === 'ok');

// ── SLD ──
const sld = generateSld({
  title: 'TPS Demo Board', configCode: 'CFG-0001 Rev A', voltageSystem: '480Y/277',
  mainBusRatingA: 2000, sccrKA: 65, busSegments: 2,
  devices: [
    { designation: 'M1', role: 'MAIN', ratingA: 1600, sectionIndex: 1, busSegment: 0, frameModel: 'NW16' },
    { designation: 'M2', role: 'MAIN', ratingA: 1600, sectionIndex: 5, busSegment: 1, frameModel: 'NW16' },
    { designation: 'T1', role: 'TIE', ratingA: 1600, sectionIndex: 3, busSegment: 0 },
    { designation: 'F1', role: 'FEEDER', ratingA: 400, sectionIndex: 2, busSegment: 0 },
    { designation: 'F2', role: 'FEEDER', ratingA: 400, sectionIndex: 2, busSegment: 0 },
    { designation: 'F3', role: 'FEEDER', ratingA: 225, sectionIndex: 4, busSegment: 1 },
  ],
});
ok('sld renders svg', sld.svg.startsWith('<svg') && sld.svg.includes('M1') && sld.svg.includes('T1') && sld.warnings.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
