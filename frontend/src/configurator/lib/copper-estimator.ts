/**
 * copper-estimator.ts — Phase D spec §4 (parametric copper estimate)
 *
 * Two-pass model, pass 1: geometry-derived copper weight at quote time.
 * Pass 2 (SolidWorks exact) reconciles via the backend (Phase D §5).
 * Pure module; COMEX price and costing settings injected.
 */

import { StandardsSet, busScheduleFor, supportSpacingFor } from './us-standards';

export const CU_DENSITY_LB_IN3 = 0.323;
export const AL_DENSITY_LB_IN3 = 0.098;

export interface CopperSettings {
  fabFactor: number;        // COPPER_FAB_FACTOR  [SEED 1.15]
  contingencyPct: number;   // COPPER_CONTINGENCY_PCT [SEED 10]
  stubLenIn: number;        // COPPER_STUB_LEN_IN [SEED 24]
}

export const DEFAULT_COPPER_SETTINGS: CopperSettings = {
  fabFactor: 1.15,
  contingencyPct: 10,
  stubLenIn: 24,
};

export interface CopperEstimateInput {
  mainBusRatingA: number;
  material: 'Cu' | 'Al';
  neutralPct: number;             // 100 | 200
  sccrKA: number;
  sectionWidthsIn: number[];      // per section
  busZoneHeightsIn: number[];     // per section (frame topBusZone)
  devices: { ratedA: number; poles: number; sectionIndex: number }[];
  groundBar: { thkIn: number; wIn: number }; // [SEED 0.25 × 2]
  pricePerLb: number;             // COMEX snapshot
}

export interface CopperEstimateResult {
  mainBusLbs: number;
  neutralLbs: number;
  groundLbs: number;
  riserLbs: number;
  stubLbs: number;
  rawLbs: number;
  estimatedLbs: number;           // × fabFactor
  costUsd: number;                // × price × (1 + contingency)
  supports: number;               // glastic supports (GEN-GLASTIC)
  perSection: { sectionIndex: number; lbs: number }[];
  notes: string[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function estimateCopper(
  std: StandardsSet,
  input: CopperEstimateInput,
  settings: CopperSettings = DEFAULT_COPPER_SETTINGS
): CopperEstimateResult {
  const notes: string[] = [];
  const density = input.material === 'Cu' ? CU_DENSITY_LB_IN3 : AL_DENSITY_LB_IN3;

  const row = busScheduleFor(std, input.mainBusRatingA, input.material);
  if (!row) {
    return {
      mainBusLbs: 0, neutralLbs: 0, groundLbs: 0, riserLbs: 0, stubLbs: 0,
      rawLbs: 0, estimatedLbs: 0, costUsd: 0, supports: 0, perSection: [],
      notes: [`No bus schedule row for ${input.mainBusRatingA} A ${input.material}`],
    };
  }
  if (row.seed) notes.push('Bus schedule row is [SEED] — unverified by TPS engineering');

  const barArea = row.barThk_in * row.barW_in;
  const mainRunIn = input.sectionWidthsIn.reduce((a, b) => a + b, 0);

  const mainBusLbs = row.barsPerPhase * barArea * mainRunIn * 3 * density;
  const neutralLbs = row.barsPerPhase * barArea * mainRunIn * density * (input.neutralPct / 100);
  const groundLbs = input.groundBar.thkIn * input.groundBar.wIn * mainRunIn * density;

  // Risers per section — sized to section's largest device rating [SEED rule]
  let riserLbs = 0;
  const perSection: { sectionIndex: number; lbs: number }[] = [];
  input.sectionWidthsIn.forEach((w, i) => {
    const sectionIdx = i + 1;
    const sectionDevices = input.devices.filter((d) => d.sectionIndex === sectionIdx);
    const maxA = sectionDevices.length ? Math.max(...sectionDevices.map((d) => d.ratedA)) : 0;
    let sectionRiser = 0;
    if (maxA > 0) {
      const riserRow = busScheduleFor(std, maxA, input.material) ?? row;
      const zone = input.busZoneHeightsIn[i] ?? 12;
      sectionRiser = riserRow.barsPerPhase * (riserRow.barThk_in * riserRow.barW_in) * zone * 3 * density;
    }
    riserLbs += sectionRiser;
    const widthShare = mainRunIn > 0 ? w / mainRunIn : 0;
    perSection.push({
      sectionIndex: sectionIdx,
      lbs: r2(sectionRiser + (mainBusLbs + neutralLbs + groundLbs) * widthShare),
    });
  });

  // Device stubs
  let stubLbs = 0;
  for (const d of input.devices) {
    const stubRow = busScheduleFor(std, d.ratedA, input.material) ?? row;
    stubLbs += (stubRow.barThk_in * stubRow.barW_in) * settings.stubLenIn * d.poles * density;
  }

  const rawLbs = mainBusLbs + neutralLbs + groundLbs + riserLbs + stubLbs;
  const estimatedLbs = rawLbs * settings.fabFactor;
  const costUsd = estimatedLbs * input.pricePerLb * (1 + settings.contingencyPct / 100);

  // Glastic supports (GEN-GLASTIC): per phase-run, spacing per SCCR
  const spacingRow = supportSpacingFor(std, input.sccrKA);
  const spacing = spacingRow?.maxSpacing_in ?? 10;
  const supports = mainRunIn > 0 ? (Math.ceil(mainRunIn / spacing) + 1) : 0;

  return {
    mainBusLbs: r2(mainBusLbs),
    neutralLbs: r2(neutralLbs),
    groundLbs: r2(groundLbs),
    riserLbs: r2(riserLbs),
    stubLbs: r2(stubLbs),
    rawLbs: r2(rawLbs),
    estimatedLbs: r2(estimatedLbs),
    costUsd: r2(costUsd),
    supports,
    perSection,
    notes,
  };
}

/** Phase D §5 — reconciliation verdict. */
export function reconcileCopper(
  estimatedLbs: number,
  exactLbs: number,
  pricePerLb: number,
  thresholdPct = 5
): { deltaPct: number; status: 'ok' | 'review'; marginImpactUsd: number } {
  const deltaPct = estimatedLbs > 0 ? ((exactLbs - estimatedLbs) / estimatedLbs) * 100 : 0;
  const status = Math.abs(deltaPct) <= thresholdPct ? 'ok' : 'review';
  return {
    deltaPct: r2(deltaPct),
    status,
    marginImpactUsd: r2((exactLbs - estimatedLbs) * pricePerLb),
  };
}
