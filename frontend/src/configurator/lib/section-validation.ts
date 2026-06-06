/**
 * Section-Level Dependency Logic
 *
 * Validates individual section configuration for electrical correctness,
 * breaker sizing, type enforcement, and mounting consistency.
 * Pure logic — no UI, no side effects.
 *
 * Triggered via Event Engine (Module 11) when:
 *  - effectiveCurrent changes
 *  - breaker selection changes
 *  - sectionType changes
 *  - mountingType changes
 *  - userDefinedCurrent changes
 */

// ── Interfaces ──

export interface SectionValidationInput {
  /** Effective current in amps (from load calculation engine / computeEffectiveCurrent) */
  effectiveCurrent: number | null;
  /** Calculated current before user override (same formula, ignoring userDefinedCurrent) */
  calculatedCurrent: number | null;
  /** User-defined current override (from sectionRatedCurrent field) — empty string if not set */
  userDefinedCurrent: string;
  /** Connected load in kW — empty string if not set */
  connectedLoad: string;
  /** Section type: "Incomer" | "Outgoing" | "Bus Coupler" | "Feeder" | "Capacitor" | "Motor Feeder" */
  sectionType: string;
  /** Feeder type from EP: "Incomer" | "Outgoing" | "Bus Coupler" | "Tie" */
  feederType: string;
  /** Breaker type of the selected breaker: "ACB" | "MCCB" | "MCB" | "" */
  breakerType: string;
  /** Rated current of the selected breaker in amps — null if no breaker selected */
  breakerRatedCurrent: number | null;
  /** Mounting type of the selected breaker: "Fixed" | "Drawout" | "" */
  breakerMountingType: string;
  /** Mounting structure from Layout & Hardware: "Fixed" | "Drawout" | "" */
  configuredMountingStructure: string;
  /** Whether a breaker has been selected at all */
  breakerSelected: boolean;
  /** Application types the selected breaker supports (comma-separated from catalog) — "" if none */
  breakerApplicationType: string;
}

export interface SectionValidationResult {
  /** True only if the section passes all validation rules */
  isValid: boolean;
  /** Blocking errors — section cannot proceed */
  errors: string[];
  /** Non-blocking advisories */
  warnings: string[];
  /** The resolved effective current after user override logic */
  resolvedEffectiveCurrent: number | null;
}

// ── Validation Engine ──

/**
 * Run all section-level validation steps.
 *
 * Steps:
 * 1. Current validation (breaker ≥ effectiveCurrent)
 * 2. User override validation
 * 3. Breaker selection validity
 * 4. Section type enforcement (ACB for Incomer/Bus Coupler, MCCB/ACB for Feeder)
 * 5. Mounting consistency
 * 6. Load presence validation
 * 7. Electrical completeness check
 */
export function validateSection(
  input: SectionValidationInput,
): SectionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Step 2 (run first): User Override Validation ──
  // Determine the resolved effective current
  let resolvedEffectiveCurrent = input.effectiveCurrent;
  const userDefined = parseFloat(input.userDefinedCurrent);

  if (Number.isFinite(userDefined) && userDefined > 0) {
    const calc = input.calculatedCurrent;
    if (calc !== null && calc > 0) {
      resolvedEffectiveCurrent = Math.max(userDefined, calc);
      if (userDefined < calc) {
        warnings.push(
          "User-defined current is below calculated requirement",
        );
      }
    } else {
      // No calculated current available — use user-defined directly
      resolvedEffectiveCurrent = userDefined;
    }
  }

  // ── Step 6: Load Presence Validation ──
  const load = parseFloat(input.connectedLoad);
  const hasLoad = Number.isFinite(load) && load > 0;

  if (!hasLoad) {
    if (input.breakerSelected) {
      errors.push("Load must be defined before selecting breaker");
    }
    // If no load, remaining breaker-specific checks are moot
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      resolvedEffectiveCurrent,
    };
  }

  // ── Step 1: Current Validation (Core Rule) ──
  if (
    resolvedEffectiveCurrent !== null &&
    resolvedEffectiveCurrent > 0 &&
    input.breakerRatedCurrent !== null &&
    input.breakerRatedCurrent > 0
  ) {
    if (input.breakerRatedCurrent < resolvedEffectiveCurrent) {
      errors.push("Selected breaker is undersized for calculated load");
    }
  }

  // ── Step 3: Breaker Selection Validity ──
  if (!input.breakerSelected) {
    warnings.push("Breaker selection required");
  } else {
    // Check if breaker application type matches section type / feeder type
    const applicationType = input.breakerApplicationType;
    if (applicationType) {
      const allowedApps = applicationType
        .split(",")
        .map((s) => s.trim().toLowerCase());

      const sectionTypeLC = (input.sectionType || "").toLowerCase();
      const feederTypeLC = (input.feederType || "").toLowerCase();

      // The breaker must be valid for either the section type or the feeder type
      const matchesSectionType =
        !sectionTypeLC || allowedApps.some((a) => a.includes(sectionTypeLC));
      const matchesFeederType =
        !feederTypeLC || allowedApps.some((a) => a.includes(feederTypeLC));

      if (sectionTypeLC && !matchesSectionType && feederTypeLC && !matchesFeederType) {
        errors.push(
          "Selected breaker is not valid for current configuration",
        );
      } else if (sectionTypeLC && !matchesSectionType && !feederTypeLC) {
        errors.push(
          "Selected breaker is not valid for current configuration",
        );
      }
    }
  }

  // ── Step 4: Section Type Enforcement ──
  if (input.breakerSelected && input.breakerType) {
    const st = input.sectionType || input.feederType || "";

    if (st === "Incomer" || st === "Bus Coupler") {
      if (input.breakerType !== "ACB") {
        errors.push(
          `${st} section requires ACB breaker type`,
        );
      }
    }

    if (st === "Feeder" || st === "Outgoing") {
      // Feeders allow MCCB, or ACB if current > 1600A
      if (input.breakerType === "ACB") {
        if (
          resolvedEffectiveCurrent !== null &&
          resolvedEffectiveCurrent <= 1600
        ) {
          warnings.push(
            "ACB is typically used for currents above 1600A on feeder sections",
          );
        }
      }
      // MCB is not allowed for feeders in this context (only MCCB and ACB)
      if (input.breakerType === "MCB") {
        errors.push(
          "MCB is not permitted for feeder sections",
        );
      }
    }
  }

  // ── Step 5: Mounting Consistency ──
  if (
    input.breakerSelected &&
    input.breakerMountingType &&
    input.configuredMountingStructure
  ) {
    const breakerMount = input.breakerMountingType.toLowerCase();
    const configMount = input.configuredMountingStructure.toLowerCase();

    if (breakerMount !== configMount) {
      errors.push(
        `Mounting mismatch: breaker is ${input.breakerMountingType} but section requires ${input.configuredMountingStructure}`,
      );
    }
  }

  // ── Step 7: Electrical Completeness Check ──
  const isElectricallyComplete =
    resolvedEffectiveCurrent !== null &&
    resolvedEffectiveCurrent > 0 &&
    input.breakerSelected &&
    errors.length === 0;

  if (
    hasLoad &&
    resolvedEffectiveCurrent !== null &&
    resolvedEffectiveCurrent > 0 &&
    !input.breakerSelected
  ) {
    // Load is defined, current is calculated, but no breaker yet — just a warning (already covered above)
  }

  // ── Step 8: Validation Output ──
  return {
    isValid: isElectricallyComplete,
    errors,
    warnings,
    resolvedEffectiveCurrent,
  };
}
