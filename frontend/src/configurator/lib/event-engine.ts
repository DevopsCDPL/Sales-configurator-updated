/**
 * Centralized Event + Recompute Engine
 *
 * Controls all system updates through a deterministic pipeline.
 * Every user interaction triggers a controlled recomputation of
 * dependent systems in strict execution order.
 *
 * Pipeline order:
 *  STEP 1: Load Calculation Engine (Module 10)
 *  STEP 2: Section-Level Dependency Logic (Module 06)
 *  STEP 3: Circuit Breaker Filtering Logic (Module 07)
 *  STEP 4: Layout Dependency Logic (Module 09)
 *  STEP 5: Cross Section Interaction Logic (Module 08)
 *  STEP 6: System-Level Dependency Logic (Module 05)
 *  STEP 7: Validation & Error Priority System (Module 12)
 *
 * Note: Cross Section (08) runs before System-Level (05) because
 * System-Level validation consumes cross-section output as an input.
 *
 * Rules:
 *  - No module calls another module directly
 *  - Each event executes the pipeline ONCE (no loops)
 *  - Change detection prevents unnecessary recomputes (handled by React useMemo)
 *  - If any module fails → STOP pipeline → return error state (no downstream execution)
 *  - All modules are PURE: Input → Output only
 */

import { calculateSectionLoad, type LoadCalculationResult } from "./load-calculation";
import { validateSection, type SectionValidationInput, type SectionValidationResult } from "./section-validation";
import { filterBreakers, type BreakerFilterInputs, type BreakerFilterResult } from "./breaker-filtering";
import { evaluateLayoutDependency, type LayoutDependencyInputs, type LayoutDependencyResult, type BreakerLayoutInput } from "./layout-dependency";
import { validateSystem, type SectionInput, type SystemInputs, type SystemValidationResult } from "./system-validation";
import { evaluateCrossSectionInteraction, type CrossSectionResult } from "./cross-section-interaction";
import { evaluateValidationPriority, type ValidationPriorityResult } from "./validation-priority";
import type { CircuitBreakerV2Entry } from "../data/circuitBreakerV2Data";

// ── Event Types ──

export type SystemLevelEvent =
  | "systemVoltage"
  | "phase"
  | "shortCircuitRating"
  | "busRating"
  | "busConfiguration"
  | "numberOfSections"
  | "height"
  | "sectionWidth"
  | "depth"
  | "cableEntry"
  | "cableExit"
  | "accessType";

export type SectionLevelEvent =
  | "connectedLoad"
  | "demandFactor"
  | "diversityFactor"
  | "userDefinedCurrent"
  | "sectionType"
  | "feederType"
  | "incomerType"
  | "mountingStructure"
  | "stacking"
  | "breakerSelection"
  | "breakerTypeFilter"
  | "cableEntry"
  | "cableExit";

export type EventSource =
  | { level: "system"; event: SystemLevelEvent }
  | { level: "section"; sectionNumber: number; event: SectionLevelEvent };

// ── Pipeline Input Types ──

export interface SectionInputState {
  /** Section number (1-based) */
  sectionNumber: number;
  /** Electrical & Protection fields */
  electricalProtection: {
    connectedLoad: string;
    demandFactor: string;
    diversityFactor: string;
    sectionRatedCurrent: string;
    feederType: string;
    continuousLoad: string;
  };
  /** Section Definition fields */
  definition: {
    sectionType: string;
    sectionFunction: string;
    sectionName: string;
  };
  /** Layout & Hardware fields */
  layoutHardware: {
    mountingStructure: string;
    stacking: string;
    cableEntry: string;
    cableExit: string;
  };
  /** Selected breaker components for this section */
  selectedBreakers: {
    breakerType: string;
    ratedCurrentA: string;
    breakingCapacityKA: string;
    mountingType: string;
    applicationTyp: string;
    dimensions: string;
    sNo: number;
  }[];
  /** Breaker type filter from user */
  breakerTypeFilter: string;
}

export interface SystemInputState {
  systemVoltage: string;
  phase: string;
  shortCircuitRating: string;
  mainBusRating: string;
  busConfiguration: string;
  height: string;
  sectionWidth: string;
  depth: string;
  cableEntry: string;
  cableExit: string;
  accessType: string;
}

export interface PipelineInputs {
  system: SystemInputState;
  sections: SectionInputState[];
  /** Full breaker catalog for filtering */
  breakerCatalog: CircuitBreakerV2Entry[];
}

// ── Pipeline Output Types ──

export interface SectionComputedState {
  sectionNumber: number;
  /** Step 1: Load calculation result */
  loadCalc: LoadCalculationResult;
  /** Step 2: Section validation result */
  sectionValidation: SectionValidationResult;
  /** Step 3: Breaker filtering result */
  breakerFilter: BreakerFilterResult;
  /** Step 4: Layout dependency result */
  layoutResult: LayoutDependencyResult;
}

export interface PipelineOutputs {
  /** Per-section computed states */
  sections: SectionComputedState[];
  /** Step 6: System-level validation */
  systemValidation: SystemValidationResult;
  /** Step 5: Cross-section interaction */
  crossSectionResult: CrossSectionResult;
  /** Aggregate validation state (legacy) */
  validationSummary: {
    isSystemValid: boolean;
    totalErrors: string[];
    totalWarnings: string[];
    sectionErrors: Record<number, string[]>;
    sectionWarnings: Record<number, string[]>;
  };
  /** Step 7: Centralized Validation & Error Priority System */
  validationPriority: ValidationPriorityResult;
  /** Pipeline execution error — set if a module threw an exception */
  pipelineError: string | null;
}

// ── Pipeline Engine ──

/**
 * Execute the full recompute pipeline for all sections in strict order.
 *
 * This is the ONLY entry point for recomputation.
 * All modules are called in deterministic order.
 * No module calls another module directly.
 */
export function executePipeline(inputs: PipelineInputs): PipelineOutputs {
  const sectionResults: SectionComputedState[] = [];
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const sectionErrors: Record<number, string[]> = {};
  const sectionWarnings: Record<number, string[]> = {};

  // Helper: build a halted pipeline output on fatal error
  const buildErrorOutput = (error: string): PipelineOutputs => ({
    sections: sectionResults,
    systemValidation: { totalLoad: 0, isSystemValid: false, errors: [error], warnings: [] },
    crossSectionResult: { incomerLoadDistribution: [], totalFeederLoad: 0, systemInteractionValid: false, errors: [error], warnings: [] },
    validationSummary: { isSystemValid: false, totalErrors: [error, ...allErrors], totalWarnings: allWarnings, sectionErrors, sectionWarnings },
    validationPriority: { systemBlocked: true, blockedSections: [], criticalErrors: [], majorErrors: [], warnings: [], displayOrder: [], sectionGrouped: {}, systemGrouped: [], bySource: { sections: {}, system: [], crossSection: [], validationPriority: [] } as any },
    pipelineError: error,
  });

  // ── Process each section through Steps 1-4 ──
  for (const section of inputs.sections) {
    const sn = section.sectionNumber;

    // ── STEP 1: Load Calculation Engine (Module 10) ──
    let loadCalc: LoadCalculationResult;
    try {
      loadCalc = calculateSectionLoad({
        connectedLoad: section.electricalProtection.connectedLoad,
        demandFactor: section.electricalProtection.demandFactor,
        diversityFactor: section.electricalProtection.diversityFactor,
        systemVoltage: inputs.system.systemVoltage,
        phase: inputs.system.phase,
        userDefinedCurrent: section.electricalProtection.sectionRatedCurrent,
      });
    } catch (e) {
      return buildErrorOutput(`Section ${sn}: Load Calculation failed — ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── STEP 2: Section-Level Dependency Logic (Module 06) ──
    const breaker = section.selectedBreakers[0]; // Primary breaker
    const breakerRatedCurrent = breaker
      ? parseFloat(breaker.ratedCurrentA)
      : null;

    const sectionValidationInput: SectionValidationInput = {
      effectiveCurrent: loadCalc.effectiveCurrent,
      calculatedCurrent: loadCalc.calculatedCurrent,
      userDefinedCurrent: section.electricalProtection.sectionRatedCurrent,
      connectedLoad: section.electricalProtection.connectedLoad,
      sectionType: section.definition.sectionType,
      feederType: section.electricalProtection.feederType,
      breakerType: breaker?.breakerType ?? "",
      breakerRatedCurrent: Number.isFinite(breakerRatedCurrent) ? breakerRatedCurrent : null,
      breakerMountingType: breaker?.mountingType ?? "",
      configuredMountingStructure: section.layoutHardware.mountingStructure,
      breakerSelected: section.selectedBreakers.length > 0,
      breakerApplicationType: breaker?.applicationTyp ?? "",
    };

    let sectionValidation: SectionValidationResult;
    try {
      sectionValidation = validateSection(sectionValidationInput);
    } catch (e) {
      return buildErrorOutput(`Section ${sn}: Section Validation failed — ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── STEP 3: Circuit Breaker Filtering Logic (Module 07) ──
    const filterInputs: BreakerFilterInputs = {
      effectiveCurrent: loadCalc.effectiveCurrent,
      calculatedCurrent: loadCalc.calculatedCurrent,
      recommendedBreakerCurrent: loadCalc.recommendedBreaker,
      systemVoltage: inputs.system.systemVoltage,
      shortCircuitRating: inputs.system.shortCircuitRating,
      sectionType: section.definition.sectionType,
      feederType: section.electricalProtection.feederType,
      mountingType: section.layoutHardware.mountingStructure,
      breakerTypeFilter: section.breakerTypeFilter,
    };

    let breakerFilter: BreakerFilterResult;
    try {
      breakerFilter = filterBreakers(inputs.breakerCatalog, filterInputs);
    } catch (e) {
      return buildErrorOutput(`Section ${sn}: Breaker Filtering failed — ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── STEP 4: Layout Dependency Logic (Module 09) ──
    const breakers: BreakerLayoutInput[] = section.selectedBreakers.map((b) => ({
      breakerType: b.breakerType,
      ratedCurrentA: parseFloat(b.ratedCurrentA),
      mountingType: b.mountingType,
      catalogDimensions: b.dimensions,
    }));

    const layoutInputs: LayoutDependencyInputs = {
      breakers,
      sectionType: section.definition.sectionType,
      mountingStructure: section.layoutHardware.mountingStructure,
      stacking: section.layoutHardware.stacking,
      sectionHeight: inputs.system.height,
      sectionWidth: inputs.system.sectionWidth,
      sectionDepth: inputs.system.depth,
      busbarRating: inputs.system.mainBusRating,
      cableEntry: section.layoutHardware.cableEntry || inputs.system.cableEntry,
      cableExit: section.layoutHardware.cableExit || inputs.system.cableExit,
      accessType: inputs.system.accessType,
    };

    let layoutResult: LayoutDependencyResult;
    try {
      layoutResult = evaluateLayoutDependency(layoutInputs);
    } catch (e) {
      return buildErrorOutput(`Section ${sn}: Layout Dependency failed — ${e instanceof Error ? e.message : String(e)}`);
    }

    // Collect errors/warnings
    const secErrors: string[] = [
      ...sectionValidation.errors,
      ...breakerFilter.validationState.errors,
      ...layoutResult.errors,
      ...loadCalc.errors,
    ];
    const secWarnings: string[] = [
      ...sectionValidation.warnings,
      ...breakerFilter.validationState.warnings,
      ...layoutResult.warnings,
      ...loadCalc.warnings,
    ];

    sectionErrors[sn] = secErrors;
    sectionWarnings[sn] = secWarnings;
    allErrors.push(...secErrors);
    allWarnings.push(...secWarnings);

    sectionResults.push({
      sectionNumber: sn,
      loadCalc,
      sectionValidation,
      breakerFilter,
      layoutResult,
    });
  }

  // ── Build SectionInput[] for system-level modules ──
  const sectionInputs: SectionInput[] = sectionResults.map((sr) => {
    const section = inputs.sections.find((s) => s.sectionNumber === sr.sectionNumber)!;
    const breaker = section.selectedBreakers[0];
    const breakerRatedCurrent = breaker ? parseFloat(breaker.ratedCurrentA) : null;
    const breakerBreakingCapacity = breaker ? parseFloat(breaker.breakingCapacityKA) : null;

    const configured = Boolean(
      section.definition.sectionType ||
      section.definition.sectionFunction ||
      section.definition.sectionName ||
      section.electricalProtection.connectedLoad,
    );

    return {
      sectionNumber: sr.sectionNumber,
      configured,
      effectiveCurrent: sr.loadCalc.effectiveCurrent,
      sectionType: section.definition.sectionType,
      feederType: section.electricalProtection.feederType,
      breakerRatedCurrent: Number.isFinite(breakerRatedCurrent) ? breakerRatedCurrent : null,
      breakerBreakingCapacity: Number.isFinite(breakerBreakingCapacity) ? breakerBreakingCapacity : null,
      sectionValid: sr.sectionValidation.isValid,
    };
  });

  // ── STEP 5: Cross Section Interaction Logic (Module 08) ──
  // Cross-section runs before system validation because system validation
  // consumes cross-section results as inputs (data dependency).
  let crossSectionResult: CrossSectionResult;
  try {
    crossSectionResult = evaluateCrossSectionInteraction({
      sections: sectionInputs,
      busConfiguration: inputs.system.busConfiguration,
    });
  } catch (e) {
    return buildErrorOutput(`Cross Section Interaction failed — ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── STEP 6: System-Level Dependency Logic (Module 05) ──
  const mainBusRating = parseFloat(inputs.system.mainBusRating);
  const systemVoltage = parseFloat(inputs.system.systemVoltage);
  const shortCircuitRating = parseFloat(inputs.system.shortCircuitRating);

  const systemInputs: SystemInputs = {
    mainBusRating: Number.isFinite(mainBusRating) ? mainBusRating : null,
    systemVoltage: Number.isFinite(systemVoltage) ? systemVoltage : null,
    shortCircuitRating: Number.isFinite(shortCircuitRating) ? shortCircuitRating : null,
    sections: sectionInputs,
    crossSectionValid: crossSectionResult.systemInteractionValid,
    crossSectionErrors: crossSectionResult.errors,
    crossSectionWarnings: crossSectionResult.warnings,
  };

  let systemValidation: SystemValidationResult;
  try {
    systemValidation = validateSystem(systemInputs);
  } catch (e) {
    return buildErrorOutput(`System Validation failed — ${e instanceof Error ? e.message : String(e)}`);
  }

  // Collect system-level errors/warnings
  allErrors.push(...systemValidation.errors);
  allWarnings.push(...systemValidation.warnings);
  allErrors.push(...crossSectionResult.errors);
  allWarnings.push(...crossSectionResult.warnings);

  // ── STEP 7: Centralized Validation & Error Priority System ──
  const validationPriority = evaluateValidationPriority({
    sections: sectionResults.map((sr) => ({
      sectionNumber: sr.sectionNumber,
      loadCalc: {
        errors: sr.loadCalc.errors,
        warnings: sr.loadCalc.warnings,
        isValid: sr.loadCalc.isValid,
      },
      sectionValidation: {
        errors: sr.sectionValidation.errors,
        warnings: sr.sectionValidation.warnings,
        isValid: sr.sectionValidation.isValid,
      },
      breakerFilter: {
        errors: sr.breakerFilter.validationState.errors,
        warnings: sr.breakerFilter.validationState.warnings,
        isValid: sr.breakerFilter.validationState.hasEligibleBreakers,
      },
      layoutResult: {
        errors: sr.layoutResult.errors,
        warnings: sr.layoutResult.warnings,
        isValid: sr.layoutResult.layoutValid,
      },
    })),
    systemValidation: {
      errors: systemValidation.errors,
      warnings: systemValidation.warnings,
      isValid: systemValidation.isSystemValid,
    },
    crossSectionInteraction: {
      errors: crossSectionResult.errors,
      warnings: crossSectionResult.warnings,
      isValid: crossSectionResult.systemInteractionValid,
    },
  });

  // ── FINAL: Aggregate validation state ──
  return {
    sections: sectionResults,
    systemValidation,
    crossSectionResult,
    validationSummary: {
      isSystemValid: systemValidation.isSystemValid && crossSectionResult.systemInteractionValid,
      totalErrors: [...new Set(allErrors)],
      totalWarnings: [...new Set(allWarnings)],
      sectionErrors,
      sectionWarnings,
    },
    validationPriority,
    pipelineError: null,
  };
}

// ── Event Classification ──

/** Classify which sections are affected by an event */
export function getAffectedSections(
  event: EventSource,
  totalSections: number,
): number[] {
  if (event.level === "system") {
    // System events affect ALL sections
    return Array.from({ length: totalSections }, (_, i) => i + 1);
  }
  // Section events affect ONLY that section (plus system-level re-evaluation)
  return [event.sectionNumber];
}

/** Determine if a pipeline recompute is needed based on value change */
export function hasValueChanged(prev: unknown, next: unknown): boolean {
  if (prev === next) return false;
  if (typeof prev !== typeof next) return true;
  if (typeof prev === "object" && prev !== null && next !== null) {
    return JSON.stringify(prev) !== JSON.stringify(next);
  }
  return true;
}
