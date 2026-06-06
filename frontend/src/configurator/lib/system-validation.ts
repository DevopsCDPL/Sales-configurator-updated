/**
 * System-Level Dependency Logic (Module 11)
 *
 * Validates entire switchboard configuration using computed electrical load.
 * Pure logic — no UI, no side effects.
 */

export interface SectionInput {
  /** 1-based section number */
  sectionNumber: number;
  /** Whether this section has been configured at all */
  configured: boolean;
  /** Effective current in amps (computed from load engine) — null if not configured */
  effectiveCurrent: number | null;
  /** Section type from Section Setup */
  sectionType: string;
  /** Feeder type from Electrical & Protection */
  feederType: string;
  /** Rated current of the breaker selected for this section (amps) */
  breakerRatedCurrent: number | null;
  /** Breaking/interrupting capacity of the selected breaker (kA) */
  breakerBreakingCapacity: number | null;
  /** Whether this section passed section-level validation — undefined means not evaluated */
  sectionValid?: boolean;
}

export interface SystemInputs {
  /** Main bus rating in amps from System Parameters */
  mainBusRating: number | null;
  /** System voltage from System Parameters */
  systemVoltage: number | null;
  /** Short circuit rating in kA from System Parameters */
  shortCircuitRating: number | null;
  /** All sections (1–6) */
  sections: SectionInput[];
  /** Whether cross-section interaction validation passed — undefined means not evaluated */
  crossSectionValid?: boolean;
  /** Cross-section interaction errors to include — undefined means none */
  crossSectionErrors?: string[];
  /** Cross-section interaction warnings to include — undefined means none */
  crossSectionWarnings?: string[];
}

export interface SystemValidationResult {
  /** Sum of effectiveCurrent across all configured sections */
  totalLoad: number;
  /** True only if every validation step passes */
  isSystemValid: boolean;
  /** Blocking errors — system cannot proceed */
  errors: string[];
  /** Non-blocking advisories */
  warnings: string[];
}

/**
 * Compute the effective current for a single section from its Electrical & Protection fields.
 *
 * Formula:
 *   effectiveCurrent = connectedLoad(kW) × 1000 / (√3 × systemVoltage) × demandFactor × diversityFactor
 *   If continuousLoad === "Yes", multiply result by 1.25 (NEC 125% rule)
 *
 * Returns null when inputs are insufficient.
 */
export function computeEffectiveCurrent(
  connectedLoad: string,
  systemVoltage: string,
  demandFactor: string,
  diversityFactor: string,
  continuousLoad: string,
): number | null {
  const load = parseFloat(connectedLoad);
  const voltage = parseFloat(systemVoltage);
  const df = parseFloat(demandFactor);
  const divF = parseFloat(diversityFactor);

  if (!Number.isFinite(load) || load <= 0) return null;
  if (!Number.isFinite(voltage) || voltage <= 0) return null;
  if (!Number.isFinite(df) || df <= 0) return null;
  if (!Number.isFinite(divF) || divF <= 0) return null;

  let current = (load * 1000) / (Math.sqrt(3) * voltage) * df * divF;

  if (continuousLoad === "Yes") {
    current *= 1.25;
  }

  return Math.round(current * 100) / 100;
}

/**
 * Run all system-level validation steps.
 *
 * Steps:
 * 1. Total load calculation
 * 2. Busbar validation
 * 3. Incomer existence
 * 4. Incomer sizing (single)
 * 5. Multiple incomer load sharing
 * 6. Bus coupler logic
 * 7. Short circuit consistency
 * 8. Aggregate validity
 */
export function validateSystem(inputs: SystemInputs): SystemValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Step 1: Total Load Calculation ──
  const configuredSections = inputs.sections.filter(
    (s) => s.configured && s.effectiveCurrent !== null,
  );

  const totalLoad = configuredSections.reduce(
    (sum, s) => sum + (s.effectiveCurrent ?? 0),
    0,
  );

  // If no sections are configured at all, return early with a clean state
  if (inputs.sections.every((s) => !s.configured)) {
    return { totalLoad: 0, isSystemValid: true, errors: [], warnings: [] };
  }

  // ── Step 2: Busbar Validation ──
  if (inputs.mainBusRating !== null && inputs.mainBusRating > 0) {
    if (totalLoad > inputs.mainBusRating) {
      errors.push("Total load exceeds main bus rating");
    }
  }

  // ── Step 3: Incomer Identification ──
  const incomers = inputs.sections.filter(
    (s) =>
      s.configured &&
      (s.sectionType === "Incomer" || s.feederType === "Incomer"),
  );

  const hasAnySectionType = inputs.sections.some(
    (s) => s.configured && (s.sectionType || s.feederType),
  );

  if (hasAnySectionType && incomers.length === 0) {
    errors.push("At least one incomer section is required");
  }

  // ── Step 4 & 5: Incomer Sizing Validation ──
  if (incomers.length === 1) {
    // Single incomer: must handle full load
    const incomer = incomers[0];
    if (
      incomer.breakerRatedCurrent !== null &&
      incomer.breakerRatedCurrent > 0 &&
      totalLoad > 0
    ) {
      if (incomer.breakerRatedCurrent < totalLoad) {
        errors.push("Incomer breaker is undersized for total system load");
      }
    }
  } else if (incomers.length > 1) {
    // Multiple incomers: assume load sharing
    const loadPerIncomer = totalLoad / incomers.length;
    const undersized = incomers.filter(
      (inc) =>
        inc.breakerRatedCurrent !== null &&
        inc.breakerRatedCurrent > 0 &&
        inc.breakerRatedCurrent < loadPerIncomer,
    );
    if (undersized.length > 0 && totalLoad > 0) {
      errors.push("One or more incomers are undersized for shared load");
    }
  }

  // ── Step 6: Bus Coupler Logic ──
  const busCouplers = inputs.sections.filter(
    (s) =>
      s.configured &&
      (s.sectionType === "Bus Coupler" || s.feederType === "Bus Coupler"),
  );

  if (busCouplers.length > 0 && incomers.length < 2) {
    errors.push("Bus coupler requires minimum two incomers");
  }

  // ── Step 7: Short Circuit Consistency ──
  if (
    inputs.shortCircuitRating !== null &&
    inputs.shortCircuitRating > 0
  ) {
    const violating = inputs.sections.filter(
      (s) =>
        s.configured &&
        s.breakerBreakingCapacity !== null &&
        s.breakerBreakingCapacity > 0 &&
        s.breakerBreakingCapacity < inputs.shortCircuitRating!,
    );
    if (violating.length > 0) {
      errors.push("Breaker interrupting capacity below system fault level");
    }
  }

  // ── Step 7b: Section-Level Validation Gate ──
  // If any configured section failed section-level validation, block system validation
  const invalidSections = inputs.sections.filter(
    (s) => s.configured && s.sectionValid === false,
  );
  if (invalidSections.length > 0) {
    const nums = invalidSections.map((s) => s.sectionNumber).join(", ");
    errors.push(
      `Section${invalidSections.length > 1 ? "s" : ""} ${nums} failed section-level validation`,
    );
  }

  // ── Step 7c: Cross-Section Interaction Gate ──
  if (inputs.crossSectionValid === false) {
    if (inputs.crossSectionErrors && inputs.crossSectionErrors.length > 0) {
      for (const err of inputs.crossSectionErrors) {
        errors.push(err);
      }
    } else {
      errors.push("Cross-section interaction validation failed");
    }
  }
  if (inputs.crossSectionWarnings && inputs.crossSectionWarnings.length > 0) {
    for (const warn of inputs.crossSectionWarnings) {
      warnings.push(warn);
    }
  }

  // ── Step 8: System Validity ──
  const isSystemValid = errors.length === 0;

  return {
    totalLoad: Math.round(totalLoad * 100) / 100,
    isSystemValid,
    errors,
    warnings,
  };
}
