/**
 * Circuit Breaker Filtering Logic
 *
 * Filters and validates circuit breaker selection using computed electrical load.
 * Pure logic — no UI, no side effects.
 *
 * Primary input source: effectiveCurrent from Load Calculation Engine (Module 10).
 * This module does NOT use raw user inputs for current validation.
 *
 * Triggered via Event Engine when:
 *  - effectiveCurrent changes
 *  - systemVoltage changes
 *  - shortCircuitRating changes
 *  - sectionType changes
 *  - mountingType changes
 */

import type { CircuitBreakerV2Entry } from "../data/circuitBreakerV2Data";

// ── Interfaces ──

export interface BreakerFilterInputs {
  /** Effective current in amps (from load calculation engine) — MANDATORY */
  effectiveCurrent: number | null;
  /** Calculated current before user override — used for recommendation */
  calculatedCurrent: number | null;
  /** Recommended breaker rated current from load engine (amps) — null if not available */
  recommendedBreakerCurrent: number | null;
  /** System voltage from System Parameters (e.g. "400", "415") */
  systemVoltage: string;
  /** Short circuit rating in kA from System Parameters */
  shortCircuitRating: string;
  /** Section type: "Incomer" | "Outgoing" | "Bus Coupler" | "Feeder" | "Capacitor" | "Motor Feeder" */
  sectionType: string;
  /** Feeder type from EP: "Incomer" | "Outgoing" | "Bus Coupler" | "Tie" */
  feederType: string;
  /** Required mounting type from Layout & Hardware: "Fixed" | "Drawout" | "" */
  mountingType: string;
  /** Breaker type filter from user/section config: "ACB" | "MCCB" | "MCB" | "" */
  breakerTypeFilter: string;
}

export interface BreakerFilterResult {
  /** Breakers that pass all electrical and configuration filters */
  eligibleBreakers: CircuitBreakerV2Entry[];
  /** The recommended breaker from the eligible set (closest to effectiveCurrent) — null if none */
  recommendedBreaker: CircuitBreakerV2Entry | null;
  /** Validation state for the overall filter result */
  validationState: {
    /** True if at least one eligible breaker exists */
    hasEligibleBreakers: boolean;
    /** True if a specific selected breaker passes validation */
    isSelectionValid: boolean;
    /** Blocking errors */
    errors: string[];
    /** Non-blocking advisories */
    warnings: string[];
  };
}

export interface BreakerSelectionValidation {
  /** True if the selected breaker passes all rules */
  isValid: boolean;
  /** Blocking errors */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

// ── Parse Helpers (local, deterministic) ──

/** Extract the maximum numeric amperage from a rated current string like "800", "100-400A", "630A" */
function parseMaxRatedCurrentA(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Match all numbers in the string
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  // Return the maximum (handles ranges like "100-400")
  return Math.max(...values);
}

/** Extract the minimum numeric amperage from a rated current string */
function parseMinRatedCurrentA(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.min(...values);
}

/** Extract the maximum voltage value from a voltage string like "440V,525V,690V" or "400V" */
function parseMaxVoltage(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.max(...values);
}

/** Extract numeric kA from breaking capacity string like "42kA/1sec", "100kA", "42" */
function parseBreakingCapacityKA(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Check if a breaker's application type includes the given section/feeder type */
function applicationTypeIncludes(applicationType: string, type: string): boolean {
  if (!type) return true; // No type constraint — allow all
  if (!applicationType) return false;
  const apps = applicationType.split(",").map((s) => s.trim().toLowerCase());
  const target = type.toLowerCase();
  return apps.some((a) => a.includes(target));
}

// ── Filtering Engine ──

/**
 * Filter the full breaker catalog based on computed electrical load and section configuration.
 *
 * Steps:
 * 1. Current-based filtering (breakerRatedCurrent ≥ effectiveCurrent)
 * 2. Voltage compatibility (breakerRatedVoltage ≥ systemVoltage)
 * 3. Short circuit capacity (breakerBreakingCapacity ≥ shortCircuitRating)
 * 4. Breaker type filter (ACB for Incomer/Bus Coupler, MCCB/ACB for Feeder)
 * 5. Mounting type filter (Fixed/Drawout consistency)
 * 6. Final eligible set
 * 8. Auto-suggestion (recommended breaker)
 * 9. Empty result handling
 */
export function filterBreakers(
  catalog: CircuitBreakerV2Entry[],
  inputs: BreakerFilterInputs,
): BreakerFilterResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let eligible = [...catalog];

  // Determine effective section type (prefer sectionType, fall back to feederType)
  const effectiveSectionType = inputs.sectionType || inputs.feederType || "";

  // ── Step 1: Current-Based Filtering ──
  if (inputs.effectiveCurrent !== null && inputs.effectiveCurrent > 0) {
    eligible = eligible.filter((entry) => {
      const maxCurrent = parseMaxRatedCurrentA(entry.ratedCurrentA);
      if (maxCurrent === null) return false; // Cannot determine — exclude
      return maxCurrent >= inputs.effectiveCurrent!;
    });
  }

  // ── Step 2: Voltage Compatibility ──
  const sysVoltage = parseFloat(inputs.systemVoltage);
  if (Number.isFinite(sysVoltage) && sysVoltage > 0) {
    eligible = eligible.filter((entry) => {
      const maxV = parseMaxVoltage(entry.ratedVoltage);
      if (maxV === null) return false; // Cannot determine — exclude
      return maxV >= sysVoltage;
    });
  }

  // ── Step 3: Short Circuit Capacity (AIC) ──
  const sysShortCircuit = parseFloat(inputs.shortCircuitRating);
  if (Number.isFinite(sysShortCircuit) && sysShortCircuit > 0) {
    eligible = eligible.filter((entry) => {
      const breakingKA = parseBreakingCapacityKA(entry.breakingCapacityKA);
      if (breakingKA === null) return false; // Cannot determine — exclude
      return breakingKA >= sysShortCircuit;
    });
  }

  // ── Step 4: Breaker Type Filter ──
  if (inputs.breakerTypeFilter) {
    // User/config explicitly selected a breaker type — filter to that
    eligible = eligible.filter(
      (entry) => entry.breakerType === inputs.breakerTypeFilter,
    );
  } else if (effectiveSectionType) {
    // Apply section-type rules when no explicit breaker type filter is set
    const st = effectiveSectionType;
    if (st === "Incomer" || st === "Bus Coupler") {
      // Only ACB allowed
      eligible = eligible.filter((entry) => entry.breakerType === "ACB");
    } else if (st === "Feeder" || st === "Outgoing") {
      // MCCB allowed; ACB allowed only if effectiveCurrent > 1600A
      eligible = eligible.filter((entry) => {
        if (entry.breakerType === "MCCB") return true;
        if (entry.breakerType === "ACB") {
          return (
            inputs.effectiveCurrent !== null && inputs.effectiveCurrent > 1600
          );
        }
        // MCB not permitted for feeders
        return false;
      });
    }
    // Other section types (Capacitor, Motor Feeder): no breaker type restriction
  }

  // ── Step 5: Mounting Type Filter ──
  if (inputs.mountingType) {
    const mount = inputs.mountingType.toLowerCase();
    eligible = eligible.filter((entry) => {
      const entryMount = (entry.mountingType || "").toLowerCase();
      if (mount === "drawout") {
        return (
          entryMount.includes("drawout") ||
          entryMount.includes("draw-out") ||
          entryMount.includes("withdraw")
        );
      }
      if (mount === "fixed") {
        return entryMount.includes("fixed");
      }
      return true;
    });
  }

  // ── Step 6: Final Eligible Set ──
  // (eligible is already the filtered result)

  // ── Step 8: Auto-Suggestion (Recommended Breaker) ──
  let recommendedBreaker: CircuitBreakerV2Entry | null = null;

  if (eligible.length > 0 && inputs.effectiveCurrent !== null && inputs.effectiveCurrent > 0) {
    // Sort by rated current ascending to find the smallest breaker that meets the load
    const sorted = [...eligible].sort((a, b) => {
      const aMax = parseMaxRatedCurrentA(a.ratedCurrentA) ?? Infinity;
      const bMax = parseMaxRatedCurrentA(b.ratedCurrentA) ?? Infinity;
      return aMax - bMax;
    });

    // If recommendedBreakerCurrent is specified and exists in the eligible set, prefer it
    if (
      inputs.recommendedBreakerCurrent !== null &&
      inputs.recommendedBreakerCurrent > 0
    ) {
      const matchRecommended = sorted.find((entry) => {
        const maxCurrent = parseMaxRatedCurrentA(entry.ratedCurrentA);
        return maxCurrent !== null && maxCurrent === inputs.recommendedBreakerCurrent;
      });
      if (matchRecommended) {
        recommendedBreaker = matchRecommended;
      }
    }

    // Fall back to smallest eligible breaker that meets effective current
    if (!recommendedBreaker) {
      recommendedBreaker = sorted[0] ?? null;
    }
  }

  // ── Step 9: Empty Result Handling ──
  if (eligible.length === 0) {
    errors.push("No valid breaker found for selected configuration");
    if (inputs.effectiveCurrent !== null && inputs.effectiveCurrent > 1600) {
      warnings.push("Consider using ACB breaker type for high current applications");
    }
    if (Number.isFinite(sysShortCircuit) && sysShortCircuit > 65) {
      warnings.push("High fault level — verify breaker breaking capacity requirements");
    }
  }

  return {
    eligibleBreakers: eligible,
    recommendedBreaker,
    validationState: {
      hasEligibleBreakers: eligible.length > 0,
      isSelectionValid: eligible.length > 0,
      errors,
      warnings,
    },
  };
}

// ── Step 7: Selection Validation ──

/**
 * Validate a specific user-selected breaker against the computed effective current
 * and other electrical constraints.
 *
 * This must be called AFTER filterBreakers to check the user's specific selection.
 */
export function validateBreakerSelection(
  selectedBreaker: CircuitBreakerV2Entry,
  inputs: BreakerFilterInputs,
  eligibleBreakers: CircuitBreakerV2Entry[],
): BreakerSelectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule 1: Breaker rated current must be ≥ effectiveCurrent
  if (inputs.effectiveCurrent !== null && inputs.effectiveCurrent > 0) {
    const maxCurrent = parseMaxRatedCurrentA(selectedBreaker.ratedCurrentA);
    if (maxCurrent !== null && maxCurrent < inputs.effectiveCurrent) {
      errors.push("Breaker rating is below required load current");
    }
  }

  // Rule 2: Selected breaker must be in the eligible set
  const isInEligible = eligibleBreakers.some(
    (eb) => eb.sNo === selectedBreaker.sNo,
  );
  if (!isInEligible) {
    errors.push("Selected breaker is not valid for current configuration");
  }

  // Rule 3: Voltage check
  const sysVoltage = parseFloat(inputs.systemVoltage);
  if (Number.isFinite(sysVoltage) && sysVoltage > 0) {
    const maxV = parseMaxVoltage(selectedBreaker.ratedVoltage);
    if (maxV !== null && maxV < sysVoltage) {
      errors.push("Selected breaker voltage rating is below system voltage");
    }
  }

  // Rule 4: Short circuit check
  const sysShortCircuit = parseFloat(inputs.shortCircuitRating);
  if (Number.isFinite(sysShortCircuit) && sysShortCircuit > 0) {
    const breakingKA = parseBreakingCapacityKA(
      selectedBreaker.breakingCapacityKA,
    );
    if (breakingKA !== null && breakingKA < sysShortCircuit) {
      errors.push("Selected breaker breaking capacity is below system fault level");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
