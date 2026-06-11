'use strict';

/**
 * copperEstimator.js — Phase D spec §4, backend twin of
 * frontend/src/configurator/lib/copper-estimator.ts (same math, same
 * [SEED] settings). Pass-1 parametric estimate; pass-2 SolidWorks exact
 * reconciles via copper_reconciliations.
 */

const CU_DENSITY_LB_IN3 = 0.323;
const AL_DENSITY_LB_IN3 = 0.098;

const DEFAULT_SETTINGS = {
  fabFactor: 1.15,        // COPPER_FAB_FACTOR [SEED]
  contingencyPct: 10,     // COPPER_CONTINGENCY_PCT [SEED]
  stubLenIn: 24,          // COPPER_STUB_LEN_IN [SEED]
};

const r2 = (x) => Math.round(x * 100) / 100;

function busScheduleFor(busSchedule, ratingA, material = 'Cu') {
  return (busSchedule || [])
    .filter((r) => r.ratingA >= ratingA && (r.material || 'Cu') === material)
    .sort((a, b) => a.ratingA - b.ratingA)[0] || null;
}

function supportSpacingFor(busSupportSpacing, sccrKA) {
  return (busSupportSpacing || [])
    .filter((r) => r.sccr_kA >= sccrKA)
    .sort((a, b) => a.sccr_kA - b.sccr_kA)[0] || null;
}

/**
 * @param {Object} std   { busSchedule, busSupportSpacing }
 * @param {Object} input { mainBusRatingA, material, neutralPct, sccrKA,
 *                         sectionWidthsIn[], busZoneHeightsIn[],
 *                         devices:[{ratedA,poles,sectionIndex}],
 *                         groundBar:{thkIn,wIn}, pricePerLb }
 */
function estimateCopper(std, input, settings = DEFAULT_SETTINGS) {
  const notes = [];
  const density = input.material === 'Cu' ? CU_DENSITY_LB_IN3 : AL_DENSITY_LB_IN3;

  const row = busScheduleFor(std.busSchedule, input.mainBusRatingA, input.material);
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
  const perSection = [];
  input.sectionWidthsIn.forEach((w, i) => {
    const sectionIdx = i + 1;
    const sectionDevices = input.devices.filter((d) => d.sectionIndex === sectionIdx);
    const maxA = sectionDevices.length ? Math.max(...sectionDevices.map((d) => d.ratedA)) : 0;
    let sectionRiser = 0;
    if (maxA > 0) {
      const riserRow = busScheduleFor(std.busSchedule, maxA, input.material) || row;
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
    const stubRow = busScheduleFor(std.busSchedule, d.ratedA, input.material) || row;
    stubLbs += (stubRow.barThk_in * stubRow.barW_in) * settings.stubLenIn * (d.poles || 3) * density;
  }

  const rawLbs = mainBusLbs + neutralLbs + groundLbs + riserLbs + stubLbs;
  const estimatedLbs = rawLbs * settings.fabFactor;
  const costUsd = estimatedLbs * (input.pricePerLb || 0) * (1 + settings.contingencyPct / 100);

  const spacingRow = supportSpacingFor(std.busSupportSpacing, input.sccrKA);
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
    pricePerLb: input.pricePerLb || 0,
    supports,
    perSection,
    notes,
  };
}

module.exports = {
  estimateCopper, busScheduleFor, supportSpacingFor,
  DEFAULT_SETTINGS, CU_DENSITY_LB_IN3, AL_DENSITY_LB_IN3,
};
