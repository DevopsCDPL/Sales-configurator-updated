/**
 * load-calculation-v2.ts — Phase B spec §4 (Module 10 rewrite, UL regime)
 *
 * NEC-based load calculation:
 *   designCurrent = 1.25 × continuous + 1.00 × non-continuous (NEC 210.19/215.2)
 *   Motor loads via NEC 430.250 FLA lookup (largest motor ×1.25 handled at
 *   section aggregation by the caller flagging isLargestMotor).
 *   Rounding on the NEC 240.6 device ladder.
 *   80%/100%-rated breaker checks per §4.4.
 *
 * Pure: inputs in, outputs out. Standards injected (never hardcoded).
 */

import { StandardsSet, getVoltageSystem, motorFla, nextLadder } from './us-standards';

export type LoadInputMode = 'kW' | 'kVA' | 'A' | 'HP';

export interface LoadInputV2 {
  voltageSystemCode: string;
  loadInputMode: LoadInputMode;
  loadValue: number;
  powerFactor?: number;        // default 0.85, used for kW only
  continuous?: boolean;        // default true (conservative)
  demandFactor?: number;       // default 1.0
  diversityFactor?: number;    // default 1.0
  isLargestMotorInSection?: boolean; // NEC 430.24 ×1.25 applied here for HP mode
  userDefinedCurrent?: number | null; // Design Current Override
}

export interface LoadResultV2 {
  baseCurrentA: number;        // I before factors
  adjustedCurrentA: number;    // × demand × diversity
  designCurrentA: number;      // continuous split applied
  recommendedRatingA: number | null; // next NEC 240.6 ladder step
  effectiveCurrentA: number;   // MAX(override, designCurrent)
  overrideBelowDesign: boolean;
  errors: string[];
  warnings: string[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function computeLoadV2(std: StandardsSet, input: LoadInputV2): LoadResultV2 {
  const errors: string[] = [];
  const warnings: string[] = [];
  const vs = getVoltageSystem(std, input.voltageSystemCode);
  if (!vs) {
    return {
      baseCurrentA: 0, adjustedCurrentA: 0, designCurrentA: 0,
      recommendedRatingA: null, effectiveCurrentA: 0, overrideBelowDesign: false,
      errors: [`Unknown voltage system "${input.voltageSystemCode}"`], warnings,
    };
  }
  if (!Number.isFinite(input.loadValue) || input.loadValue <= 0) {
    return {
      baseCurrentA: 0, adjustedCurrentA: 0, designCurrentA: 0,
      recommendedRatingA: null, effectiveCurrentA: 0, overrideBelowDesign: false,
      errors: ['Load value must be a positive number'], warnings,
    };
  }

  const pf = input.powerFactor ?? 0.85;
  const sqrt3 = Math.sqrt(3);
  let I = 0;

  switch (input.loadInputMode) {
    case 'kW':
      I = vs.phase === 3
        ? (input.loadValue * 1000) / (sqrt3 * vs.vLL * pf)
        : (input.loadValue * 1000) / (vs.vLL * pf);
      break;
    case 'kVA':
      I = vs.phase === 3
        ? (input.loadValue * 1000) / (sqrt3 * vs.vLL)
        : (input.loadValue * 1000) / vs.vLL;
      break;
    case 'A':
      I = input.loadValue;
      break;
    case 'HP': {
      const fla = motorFla(std, input.loadValue, vs.vLL);
      if (fla == null) {
        errors.push(`No FLA table entry for ${input.loadValue} HP`);
        I = 0;
      } else {
        I = fla * (input.isLargestMotorInSection ? 1.25 : 1.0); // NEC 430.24
      }
      break;
    }
  }

  const df = input.demandFactor ?? 1.0;
  const dv = input.diversityFactor ?? 1.0;
  if (df <= 0 || df > 1 || dv <= 0 || dv > 1) {
    errors.push('Demand/diversity factors must be in (0, 1]');
  }
  const adjusted = I * Math.min(Math.max(df, 0.01), 1) * Math.min(Math.max(dv, 0.01), 1);

  const continuous = input.continuous ?? true;
  // HP-mode motor loads already carry their NEC 430 factor — no double 1.25.
  const continuousFactor = input.loadInputMode === 'HP' ? 1.0 : (continuous ? 1.25 : 1.0);
  const design = adjusted * continuousFactor;

  const recommended = nextLadder(std.deviceLadder_A, design);
  if (recommended == null) errors.push('Design current exceeds the device rating ladder');

  const override = input.userDefinedCurrent ?? null;
  const overrideBelowDesign = override != null && override < design;
  if (overrideBelowDesign) {
    warnings.push('User-defined current is below the calculated load requirement');
  }
  const effective = override != null ? Math.max(override, design) : design;

  return {
    baseCurrentA: r1(I),
    adjustedCurrentA: r1(adjusted),
    designCurrentA: r1(design),
    recommendedRatingA: recommended,
    effectiveCurrentA: r1(effective),
    overrideBelowDesign,
    errors,
    warnings,
  };
}

/**
 * 80% / 100%-rated breaker admission — Phase B §4.4.
 * For 80%-rated devices designCurrent already embeds the 125% continuous
 * factor, so rating ≥ designCurrent. For 100%-rated devices NEC 210.19
 * exception applies: rating ≥ adjusted (un-inflated) current.
 */
export function breakerAdmits(
  ratingA: number,
  pctRated: 80 | 100,
  result: Pick<LoadResultV2, 'designCurrentA' | 'adjustedCurrentA'>
): boolean {
  if (pctRated === 100) return ratingA >= result.adjustedCurrentA;
  return ratingA >= result.designCurrentA;
}
