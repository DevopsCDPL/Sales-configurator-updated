/**
 * Cross Section Interaction Logic
 *
 * Controls load distribution, inter-section dependency, and power flow
 * behavior across all sections in a switchboard.
 * Pure logic — no UI, no side effects.
 *
 * This module coordinates behavior BETWEEN sections.
 * It does NOT override section-level validation (Module 06).
 * All current values use effectiveCurrent from the Load Engine.
 *
 * Triggered via Event Engine when:
 *  - effectiveCurrent changes (any section)
 *  - sectionType changes
 *  - breaker selection changes
 *  - bus configuration changes
 */

import type { SectionInput } from "./system-validation";

// ── Interfaces ──

export interface CrossSectionInputs {
  /** All sections (1–6) with their current state */
  sections: SectionInput[];
  /** Bus configuration from System Parameters: "Single Bus" | "Double Bus" | "Sectionalized Bus" | "" */
  busConfiguration: string;
}

export interface IncomerLoadAssignment {
  /** Section number of the incomer */
  sectionNumber: number;
  /** Load assigned to this incomer (amps) */
  assignedLoad: number;
  /** Breaker rated current of this incomer (amps) — null if no breaker */
  breakerRatedCurrent: number | null;
  /** Whether this incomer can support its assigned load */
  isValid: boolean;
}

export interface CrossSectionResult {
  /** Per-incomer load distribution */
  incomerLoadDistribution: IncomerLoadAssignment[];
  /** Total feeder load (sum of effectiveCurrent of feeder sections only) */
  totalFeederLoad: number;
  /** Whether all cross-section interaction rules pass */
  systemInteractionValid: boolean;
  /** Blocking errors */
  errors: string[];
  /** Non-blocking advisories */
  warnings: string[];
}

// ── Classification Helpers ──

/** Determine effective section classification from sectionType or feederType */
function classifySection(s: SectionInput): "Incomer" | "Feeder" | "BusCoupler" | "Other" {
  const st = s.sectionType || s.feederType || "";
  if (st === "Incomer") return "Incomer";
  if (st === "Bus Coupler") return "BusCoupler";
  // Feeder, Outgoing, Capacitor, Motor Feeder, Tie — all treated as load-bearing feeders
  if (
    st === "Feeder" ||
    st === "Outgoing" ||
    st === "Capacitor" ||
    st === "Motor Feeder" ||
    st === "Tie"
  ) {
    return "Feeder";
  }
  return "Other";
}

// ── Main Engine ──

/**
 * Evaluate cross-section interactions.
 *
 * Steps:
 * 1. Section classification
 * 2. Load aggregation (feeder side)
 * 3. Incomer load distribution
 * 4. Incomer validation (interaction level)
 * 5. Bus coupler behavior
 * 6. Load flow consistency
 * 7. Section isolation logic
 * 8. Cascade failure handling
 * 9. Bus configuration handling
 * 10. Load balancing validation
 */
export function evaluateCrossSectionInteraction(
  inputs: CrossSectionInputs,
): CrossSectionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const configured = inputs.sections.filter((s) => s.configured);

  // If nothing is configured, return clean state
  if (configured.length === 0) {
    return {
      incomerLoadDistribution: [],
      totalFeederLoad: 0,
      systemInteractionValid: true,
      errors: [],
      warnings: [],
    };
  }

  // ── Step 1: Section Classification ──
  const incomerSections: SectionInput[] = [];
  const feederSections: SectionInput[] = [];
  const busCouplerSections: SectionInput[] = [];

  for (const s of configured) {
    const cls = classifySection(s);
    if (cls === "Incomer") incomerSections.push(s);
    else if (cls === "Feeder") feederSections.push(s);
    else if (cls === "BusCoupler") busCouplerSections.push(s);
    // "Other" sections are ignored for cross-section logic
  }

  // ── Step 7: Section Isolation Logic ──
  // Exclude load from sections that failed section-level validation
  const validFeeders = feederSections.filter(
    (s) => s.sectionValid !== false,
  );
  const invalidFeeders = feederSections.filter(
    (s) => s.sectionValid === false,
  );

  if (invalidFeeders.length > 0) {
    const nums = invalidFeeders.map((s) => s.sectionNumber).join(", ");
    warnings.push(
      `Section${invalidFeeders.length > 1 ? "s" : ""} ${nums} excluded from load distribution (failed section validation)`,
    );
  }

  // ── Step 2: Load Aggregation (Feeder Side) ──
  // Only sum feeder sections — ignore incomers and bus couplers
  const totalFeederLoad = validFeeders.reduce(
    (sum, s) => sum + (s.effectiveCurrent ?? 0),
    0,
  );

  // ── Step 8: Cascade Failure Handling ──
  // Remove incomers that failed section-level validation from the active pool
  let activeIncomers = incomerSections.filter(
    (s) => s.sectionValid !== false,
  );
  const failedIncomers = incomerSections.filter(
    (s) => s.sectionValid === false,
  );

  if (failedIncomers.length > 0) {
    const nums = failedIncomers.map((s) => s.sectionNumber).join(", ");
    warnings.push(
      `Incomer section${failedIncomers.length > 1 ? "s" : ""} ${nums} removed from active pool (failed validation)`,
    );
  }

  // ── Step 9: Bus Configuration Handling ──
  let feederLoadForDistribution = totalFeederLoad;
  let incomersForDistribution = activeIncomers;
  // Hoisted up-front (originally declared below the Double/Sectionalized Bus blocks
  // in the source; the verbatim port required hoisting to satisfy strict TDZ checks).
  const incomerLoadDistribution: IncomerLoadAssignment[] = [];

  if (inputs.busConfiguration === "Double Bus") {
    // Double Bus: Feeders are divided into two groups.
    // Each bus section is fed by its own incomer(s).
    // Split feeders into two approximately equal groups (by order / section number).
    // Each group's load is served by half the incomers.
    if (activeIncomers.length >= 2) {
      const midpoint = Math.ceil(validFeeders.length / 2);
      const group1Feeders = validFeeders.slice(0, midpoint);
      const group2Feeders = validFeeders.slice(midpoint);

      const group1Load = group1Feeders.reduce((sum, s) => sum + (s.effectiveCurrent ?? 0), 0);
      const group2Load = group2Feeders.reduce((sum, s) => sum + (s.effectiveCurrent ?? 0), 0);

      const incomerMid = Math.ceil(activeIncomers.length / 2);
      const group1Incomers = activeIncomers.slice(0, incomerMid);
      const group2Incomers = activeIncomers.slice(incomerMid);

      // Distribute load within each group independently
      const distributeGroup = (feedLoad: number, groupIncomers: SectionInput[]): IncomerLoadAssignment[] => {
        const perIncomer = groupIncomers.length > 0 ? feedLoad / groupIncomers.length : 0;
        return groupIncomers.map((inc) => {
          const isValid =
            inc.breakerRatedCurrent === null ||
            inc.breakerRatedCurrent <= 0 ||
            inc.breakerRatedCurrent >= perIncomer;
          return {
            sectionNumber: inc.sectionNumber,
            assignedLoad: Math.round(perIncomer * 100) / 100,
            breakerRatedCurrent: inc.breakerRatedCurrent,
            isValid,
          };
        });
      };

      const group1Dist = distributeGroup(group1Load, group1Incomers);
      const group2Dist = distributeGroup(group2Load, group2Incomers);

      incomerLoadDistribution.push(...group1Dist, ...group2Dist);

      warnings.push(
        "Double Bus configuration: feeders split into two bus groups with independent incomer assignments",
      );

      // Skip the default distribution below
      incomersForDistribution = [];
    } else {
      // Fewer than 2 incomers: fall back to single-bus behavior with warning
      warnings.push(
        "Double Bus configuration requires at least 2 incomers for proper bus splitting",
      );
    }
  } else if (inputs.busConfiguration === "Sectionalized Bus") {
    // Sectionalized Bus: Similar to double bus but connected by bus coupler.
    // Bus coupler is normally open — each section independent.
    // Split feeders into groups per section, each served by its own incomer(s).
    if (busCouplerSections.length === 0 && activeIncomers.length > 1) {
      warnings.push(
        "Sectionalized Bus requires a bus coupler between sections",
      );
    }

    if (activeIncomers.length >= 2) {
      const midpoint = Math.ceil(validFeeders.length / 2);
      const group1Feeders = validFeeders.slice(0, midpoint);
      const group2Feeders = validFeeders.slice(midpoint);

      const group1Load = group1Feeders.reduce((sum, s) => sum + (s.effectiveCurrent ?? 0), 0);
      const group2Load = group2Feeders.reduce((sum, s) => sum + (s.effectiveCurrent ?? 0), 0);

      const incomerMid = Math.ceil(activeIncomers.length / 2);
      const group1Incomers = activeIncomers.slice(0, incomerMid);
      const group2Incomers = activeIncomers.slice(incomerMid);

      const distributeGroup = (feedLoad: number, groupIncomers: SectionInput[]): IncomerLoadAssignment[] => {
        const perIncomer = groupIncomers.length > 0 ? feedLoad / groupIncomers.length : 0;
        return groupIncomers.map((inc) => {
          const isValid =
            inc.breakerRatedCurrent === null ||
            inc.breakerRatedCurrent <= 0 ||
            inc.breakerRatedCurrent >= perIncomer;
          return {
            sectionNumber: inc.sectionNumber,
            assignedLoad: Math.round(perIncomer * 100) / 100,
            breakerRatedCurrent: inc.breakerRatedCurrent,
            isValid,
          };
        });
      };

      const group1Dist = distributeGroup(group1Load, group1Incomers);
      const group2Dist = distributeGroup(group2Load, group2Incomers);

      incomerLoadDistribution.push(...group1Dist, ...group2Dist);

      warnings.push(
        "Sectionalized Bus configuration: feeders split into bus sections with independent incomer assignments",
      );

      // Skip the default distribution below
      incomersForDistribution = [];
    } else {
      // Fall back to single-bus behavior
      warnings.push(
        "Sectionalized Bus with fewer than 2 incomers: using single-bus distribution",
      );
    }
  }
  // Single Bus (default): all feeders on same load pool — no adjustment needed

  // ── Step 3: Incomer Load Distribution ──
  // (declaration moved above to satisfy TDZ — see hoisted note up-stream.)

  if (incomersForDistribution.length === 1) {
    // CASE 1: Single Incomer — carries full feeder load
    const inc = incomersForDistribution[0];
    const isValid =
      inc.breakerRatedCurrent === null ||
      inc.breakerRatedCurrent <= 0 ||
      inc.breakerRatedCurrent >= feederLoadForDistribution;

    incomerLoadDistribution.push({
      sectionNumber: inc.sectionNumber,
      assignedLoad: Math.round(feederLoadForDistribution * 100) / 100,
      breakerRatedCurrent: inc.breakerRatedCurrent,
      isValid,
    });
  } else if (incomersForDistribution.length > 1) {
    // CASE 2: Multiple Incomers — equal load distribution
    const assignedLoadPerIncomer =
      feederLoadForDistribution / incomersForDistribution.length;

    for (const inc of incomersForDistribution) {
      const isValid =
        inc.breakerRatedCurrent === null ||
        inc.breakerRatedCurrent <= 0 ||
        inc.breakerRatedCurrent >= assignedLoadPerIncomer;

      incomerLoadDistribution.push({
        sectionNumber: inc.sectionNumber,
        assignedLoad: Math.round(assignedLoadPerIncomer * 100) / 100,
        breakerRatedCurrent: inc.breakerRatedCurrent,
        isValid,
      });
    }
  }

  // ── Step 4: Incomer Validation (Interaction Level) ──
  for (const dist of incomerLoadDistribution) {
    if (!dist.isValid) {
      errors.push(
        `Incomer (Section ${dist.sectionNumber}) cannot support assigned load based on system distribution`,
      );
    }
  }

  // ── Step 5: Bus Coupler Behavior ──
  if (busCouplerSections.length > 0) {
    // Rule 1: Minimum 2 incomers required
    if (incomerSections.length < 2) {
      errors.push(
        "Bus coupler requires minimum 2 incomers",
      );
    }

    // Rule 4: Bus coupler breaker must be rated ≥ largest incomer assigned load
    if (incomerLoadDistribution.length > 0) {
      const largestIncomerLoad = Math.max(
        ...incomerLoadDistribution.map((d) => d.assignedLoad),
      );

      for (const bc of busCouplerSections) {
        if (
          bc.breakerRatedCurrent !== null &&
          bc.breakerRatedCurrent > 0 &&
          largestIncomerLoad > 0 &&
          bc.breakerRatedCurrent < largestIncomerLoad
        ) {
          errors.push(
            `Bus coupler (Section ${bc.sectionNumber}) rating insufficient for load transfer condition`,
          );
        }
      }
    }
  }

  // ── Step 6: Load Flow Consistency ──
  if (validFeeders.length > 0 && activeIncomers.length === 0) {
    errors.push("Feeder has no valid upstream power source");
  }

  // ── Step 10: Load Balancing Validation ──
  if (incomerLoadDistribution.length > 1) {
    const loads = incomerLoadDistribution.map((d) => d.assignedLoad);
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);

    if (maxLoad > 0 && minLoad > 0) {
      const imbalance = ((maxLoad - minLoad) / maxLoad) * 100;
      if (imbalance > 20) {
        warnings.push(
          "Load distribution imbalance across incomers",
        );
      }
    }
  }

  // ── Step 11: Output ──
  const systemInteractionValid = errors.length === 0;

  return {
    incomerLoadDistribution,
    totalFeederLoad: Math.round(totalFeederLoad * 100) / 100,
    systemInteractionValid,
    errors,
    warnings,
  };
}
