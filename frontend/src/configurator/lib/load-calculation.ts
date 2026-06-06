/**
 * Electrical Load Calculation Engine (Module 10)
 *
 * Computes per-section electrical load, design current, and recommended
 * breaker rating from section configuration and system parameters.
 * Pure logic — no UI, no side effects.
 *
 * This module feeds:
 *  - Circuit Breaker Filtering (Module 07)
 *  - Layout Dependency Logic (Module 09)
 *  - System-Level Logic (Module 05)
 *  - Cross Section Logic (Module 08)
 *  - Section-Level Validation (Module 06)
 *
 * Recalculates when any of these change:
 *  - connectedLoad
 *  - demandFactor
 *  - diversityFactor
 *  - systemVoltage
 *  - phase
 *  - userDefinedCurrent
 */

// ── Constants ──

/** Standard breaker ratings in amps (ascending) */
const STANDARD_RATINGS = [
  63, 100, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200,
] as const;

/** Safety margin multiplier (NEC 125% rule) */
const SAFETY_MARGIN = 1.25;

// ── Interfaces ──

export interface LoadCalculationInput {
  /** Connected load in kW — string from EP field */
  connectedLoad: string;
  /** Demand factor — string from EP field (e.g. "0.8", "1") */
  demandFactor: string;
  /** Diversity factor — string from EP field (e.g. "0.9", "1") */
  diversityFactor: string;
  /** System voltage in volts — string from System Parameters (e.g. "400", "415") */
  systemVoltage: string;
  /** Phase configuration — string from System Parameters (e.g. "Single Phase (1P)", "Three Phase (3P)") */
  phase: string;
  /** Optional user-defined current override — string from sectionRatedCurrent (amps) */
  userDefinedCurrent: string;
}

export interface LoadCalculationResult {
  /** Adjusted load in kW after demand and diversity factors */
  adjustedLoad: number | null;
  /** Calculated design current in amps (including 125% safety margin) */
  calculatedCurrent: number | null;
  /** Raw current before 125% safety margin */
  rawCurrent: number | null;
  /** Recommended breaker rating — next standard rating ≥ designCurrent */
  recommendedBreaker: number | null;
  /** Final effective current considering user override */
  effectiveCurrent: number | null;
  /** Whether inputs are valid for calculation */
  isValid: boolean;
  /** Errors preventing calculation */
  errors: string[];
  /** Non-blocking warnings */
  warnings: string[];
}

// ── Helpers ──

/** Determine if phase is single-phase */
function isSinglePhase(phase: string): boolean {
  const p = (phase || "").toLowerCase();
  return p.includes("single") || p.includes("1p");
}

/**
 * Find the next standard breaker rating ≥ the given current.
 * Returns null if current exceeds all standard ratings.
 */
function nextStandardRating(current: number): number | null {
  for (const rating of STANDARD_RATINGS) {
    if (rating >= current) return rating;
  }
  // Current exceeds all standard ratings
  return null;
}

// ── Main Engine ──

/**
 * Compute the full electrical load calculation for a single section.
 *
 * Steps:
 * 1. Apply load factors → adjustedLoad
 * 2. Current calculation (phase-aware)
 * 3. Safety margin (125%)
 * 4. Rounding to standard rating
 * 5. Final output
 * 6. User override handling
 * 7. Data output
 */
export function calculateSectionLoad(
  input: LoadCalculationInput,
): LoadCalculationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Step 10: Validation ──
  const load = parseFloat(input.connectedLoad);
  const voltage = parseFloat(input.systemVoltage);
  const df = parseFloat(input.demandFactor);
  const divF = parseFloat(input.diversityFactor);

  // Skip calculation if no load
  if (!Number.isFinite(load) || load <= 0) {
    return {
      adjustedLoad: null,
      calculatedCurrent: null,
      rawCurrent: null,
      recommendedBreaker: null,
      effectiveCurrent: null,
      isValid: false,
      errors: [],
      warnings: [],
    };
  }

  // Validate required inputs
  if (!Number.isFinite(voltage) || voltage <= 0) {
    errors.push("Invalid load parameters");
    return {
      adjustedLoad: null,
      calculatedCurrent: null,
      rawCurrent: null,
      recommendedBreaker: null,
      effectiveCurrent: null,
      isValid: false,
      errors,
      warnings,
    };
  }

  const effectiveDf = Number.isFinite(df) && df > 0 ? df : 1;
  const effectiveDivF = Number.isFinite(divF) && divF > 0 ? divF : 1;

  if (!Number.isFinite(df) || df <= 0) {
    warnings.push("Demand factor not set — defaulting to 1.0");
  }
  if (!Number.isFinite(divF) || divF <= 0) {
    warnings.push("Diversity factor not set — defaulting to 1.0");
  }

  // ── Step 1: Apply Load Factors ──
  const adjustedLoad = load * effectiveDf * effectiveDivF;

  // ── Step 2: Current Calculation ──
  let rawCurrent: number;
  if (isSinglePhase(input.phase)) {
    // Single Phase: I = (P × 1000) / V
    rawCurrent = (adjustedLoad * 1000) / voltage;
  } else {
    // Three Phase (default): I = (P × 1000) / (√3 × V)
    rawCurrent = (adjustedLoad * 1000) / (Math.sqrt(3) * voltage);
  }

  // ── Step 3: Safety Margin (125% rule) ──
  const calculatedCurrent = rawCurrent * SAFETY_MARGIN;

  // ── Step 4: Rounding to Standard Rating ──
  const recommendedBreaker = nextStandardRating(calculatedCurrent);

  if (recommendedBreaker === null) {
    warnings.push(
      `Design current (${Math.round(calculatedCurrent)}A) exceeds maximum standard rating (${STANDARD_RATINGS[STANDARD_RATINGS.length - 1]}A)`,
    );
  }

  // ── Step 6: User Override Handling ──
  let effectiveCurrent = calculatedCurrent;
  const userDefined = parseFloat(input.userDefinedCurrent);

  if (Number.isFinite(userDefined) && userDefined > 0) {
    effectiveCurrent = Math.max(userDefined, calculatedCurrent);
    if (userDefined < calculatedCurrent) {
      warnings.push("Selected current is below calculated load requirement");
    }
  }

  // ── Step 5 & 7: Final Output ──
  return {
    adjustedLoad: Math.round(adjustedLoad * 100) / 100,
    calculatedCurrent: Math.round(calculatedCurrent * 100) / 100,
    rawCurrent: Math.round(rawCurrent * 100) / 100,
    recommendedBreaker,
    effectiveCurrent: Math.round(effectiveCurrent * 100) / 100,
    isValid: true,
    errors,
    warnings,
  };
}
