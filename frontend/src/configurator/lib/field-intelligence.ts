/**
 * Architecture-Aware Field Intelligence Engine
 *
 * Controls dynamic field behavior, guided configuration flow, intelligent
 * filtering, auto-fill behavior, field locking, conditional visibility,
 * dependency orchestration, and state preservation across the entire
 * switchgear configurator system.
 *
 * Pure logic — no UI, no side effects, no validation, no calculations.
 *
 * THIS MODULE IS RESPONSIBLE ONLY FOR:
 *   - Field behavior (visible, locked, filtered, auto-filled, recommended)
 *   - UI interaction orchestration
 *   - Intelligent defaults
 *   - Filtering dropdown options
 *   - State handling (intelligent reset / preserve)
 *   - Conditional field control
 *
 * THIS MODULE DOES NOT:
 *   - Perform validation (owned by Modules 05-09, 12)
 *   - Perform calculations (owned by Module 10)
 *   - Execute recompute logic (owned by Module 11)
 *   - Create independent event handlers
 *   - Bypass Event Engine
 *
 * Priority Order (always respected):
 *   1. Electrical Safety Rules
 *   2. UL / Construction Constraints
 *   3. System Validation Rules
 *   4. Layout Constraints
 *   5. User Preferences
 *   6. Recommendations
 */

import type { PipelineOutputs, SectionComputedState } from "./event-engine";

// ─────────────────────────────────────────────────────────────────────────────
// Field Directive — the core output for each field
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldDirective {
  /** Whether the field is visible in the UI */
  visible: boolean;
  /** Whether the field is locked (disabled / greyed out / read-only) */
  locked: boolean;
  /** If set, the system should auto-fill this value into the field */
  autoFillValue?: string;
  /** If set, only these options should appear in the dropdown (replaces defaults) */
  filteredOptions?: string[];
  /** If set, this option should be highlighted as the recommended choice */
  recommendedValue?: string;
  /** Human-readable recommendation text */
  recommendationText?: string;
  /** Warning message to display alongside the field */
  warningMessage?: string;
  /** Reason for the current field state (tooltip / debug) */
  reason?: string;
}

/** Default field directive — visible, unlocked, no special behavior */
const DEFAULT_DIRECTIVE: FieldDirective = Object.freeze({
  visible: true,
  locked: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Trigger — traceability for each field dependency
// ─────────────────────────────────────────────────────────────────────────────

export interface DependencyTrigger {
  controllingField: string;
  affectedField: string;
  behaviorType:
    | "auto-fill"
    | "auto-select"
    | "auto-lock"
    | "auto-filter"
    | "conditional-visibility"
    | "intelligent-reset"
    | "recommendation";
  resetOwnership: string;
  validationOwnership: string;
  eventTriggerOwnership: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset Directive
// ─────────────────────────────────────────────────────────────────────────────

export interface ResetDirective {
  /** null = system-level field */
  section: number | null;
  /** Panel within section (definition / electricalProtection / layoutHardware / breakerFilters) */
  panel: string;
  /** Field name to reset */
  field: string;
  /** Human-readable reason */
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field Intelligence Result — the complete output of the engine
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionFieldDirectives {
  definition: Record<string, FieldDirective>;
  electricalProtection: Record<string, FieldDirective>;
  layoutHardware: Record<string, FieldDirective>;
  breakerFilters: Record<string, FieldDirective>;
}

export interface FieldIntelligenceResult {
  /** System parameter field directives, keyed by field name */
  system: Record<string, FieldDirective>;
  /** Per-section field directives, keyed by section number */
  sections: Record<number, SectionFieldDirectives>;
  /** Fields that should be reset (cleared) */
  resetFields: ResetDirective[];
  /** Field paths whose values were preserved despite upstream change */
  preservedFields: string[];
  /** Dependency triggers for tracing / debugging */
  triggeredDependencies: DependencyTrigger[];
  /** System-level intelligence warnings (not validation errors) */
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldIntelligenceInputs {
  systemParameters: {
    switchboardType: string;
    applicationType: string;
    standards: string;
    specialEnvironment: string;
    designMode: string;
    systemVoltage: string;
    frequency: string;
    phase: string;
    shortCircuitRating: string;
    mainBusRating: string;
    neutralRating: string;
    connectionType: string;
    numberOfSections: string;
    accessType: string;
    cableType: string;
    sectionWidth: string;
    depth: string;
    height: string;
    cableEntry: string;
    cableExit: string;
    specialConnections: string;
    installationLocation: string;
    ipRating: string;
    ambientTemp: string;
    busMaterial: string;
    plating: string;
    busConfiguration: string;
  };
  sections: SectionIntelligenceInput[];
  /** Pipeline results for computed values */
  pipelineResults: PipelineOutputs | null;
  /** Previous field intelligence result (for change detection / state preservation) */
  previousResult: FieldIntelligenceResult | null;
}

export interface SectionIntelligenceInput {
  sectionNumber: number;
  definition: {
    sectionName: string;
    sectionType: string;
    sectionFunction: string;
  };
  electricalProtection: {
    sectionRatedCurrent: string;
    loadType: string;
    connectedLoad: string;
    demandFactor: string;
    diversityFactor: string;
    continuousLoad: string;
    feederType: string;
    parentSection: string;
    redundancyType: string;
    protectionLevel: string;
    earthFaultProtection: string;
    arcFlashProtection: string;
    interlockingRequirement: string;
  };
  layoutHardware: {
    position: string;
    compartmentSize: string;
    mountingStructure: string;
    stacking: string;
    busConnection: string;
    tapOffType: string;
    cableEntry: string;
    cableExit: string;
    cableTerminationType: string;
    metering: string;
    ctRequirement: string;
    ctType: string;
    controlType: string;
    indications: string;
  };
  breakerTypeFilter: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate field intelligence for the entire configurator state.
 *
 * This is the ONLY entry point. All field behavior decisions flow through here.
 * Returns declarative directives — does not mutate any state.
 */
export function evaluateFieldIntelligence(
  inputs: FieldIntelligenceInputs,
): FieldIntelligenceResult {
  const result: FieldIntelligenceResult = {
    system: {},
    sections: {},
    resetFields: [],
    preservedFields: [],
    triggeredDependencies: [],
    warnings: [],
  };

  // ── System Parameter Intelligence ──
  evaluateSystemFields(inputs, result);

  // ── Per-Section Intelligence ──
  for (const section of inputs.sections) {
    const sn = section.sectionNumber;
    result.sections[sn] = {
      definition: {},
      electricalProtection: {},
      layoutHardware: {},
      breakerFilters: {},
    };

    const pipelineSection =
      inputs.pipelineResults?.sections?.find((s) => s.sectionNumber === sn) ??
      null;

    evaluateSectionRatedCurrent(section, pipelineSection, result);
    evaluateSectionTypeIntelligence(inputs, section, result);
    evaluateLoadTypeIntelligence(section, result);
    evaluateBreakerIntelligence(inputs, section, result);
    evaluateAccessoryIntelligence(section, result);
    evaluateFeederTypeIntelligence(section, result);
    evaluateInheritanceRules(inputs, section, result);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// System Field Evaluators
// ─────────────────────────────────────────────────────────────────────────────

function evaluateSystemFields(
  inputs: FieldIntelligenceInputs,
  result: FieldIntelligenceResult,
): void {
  const sp = inputs.systemParameters;

  // ── Frequency: Fixed at 60Hz (only supported value) ──
  result.system.frequency = {
    visible: true,
    locked: true,
    autoFillValue: "60",
    reason:
      "Only 60Hz is currently supported. Field preserved for future extensibility.",
  };
  addDep(result, "system.frequency", "system.frequency", "auto-lock", "field-intelligence", "module-06", "module-11");

  // ── Design Mode: Fixed at Auto (only supported value) ──
  result.system.designMode = {
    visible: true,
    locked: true,
    autoFillValue: "Auto",
    reason:
      "Only Auto mode is currently supported. Manual mode planned for future.",
  };
  addDep(result, "system.designMode", "system.designMode", "auto-lock", "field-intelligence", "module-06", "module-11");

  // ── Dimension Fields: Controlled by Design Mode ──
  const isAutoMode = (sp.designMode || "Auto") === "Auto";

  if (isAutoMode) {
    // In Auto mode, dimension fields are system-controlled (derived from Module 09).
    // They remain visible but locked. The pipeline / layout engine determines values.
    result.system.sectionWidth = {
      visible: true,
      locked: true,
      reason:
        "Design Mode is Auto. Dimensions are derived from Layout Dependency Logic (Module 09).",
    };
    result.system.depth = {
      visible: true,
      locked: true,
      reason:
        "Design Mode is Auto. Dimensions are derived from Layout Dependency Logic (Module 09).",
    };
    result.system.height = {
      visible: true,
      locked: true,
      reason:
        "Design Mode is Auto. Dimensions are derived from Layout Dependency Logic (Module 09).",
    };
    addDep(result, "system.designMode", "system.sectionWidth", "auto-lock", "field-intelligence", "module-09", "module-11");
    addDep(result, "system.designMode", "system.depth", "auto-lock", "field-intelligence", "module-09", "module-11");
    addDep(result, "system.designMode", "system.height", "auto-lock", "field-intelligence", "module-09", "module-11");
  }
  // Future: When Manual mode is enabled, dimension fields become editable
  // but layout validation rules (Module 09) remain active.
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Rated Current — Auto-Calculated from Pipeline
// ─────────────────────────────────────────────────────────────────────────────

function evaluateSectionRatedCurrent(
  section: SectionIntelligenceInput,
  pipelineSection: SectionComputedState | null,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const loadCalc = pipelineSection?.loadCalc ?? null;

  // Section Rated Current = recommended breaker rating from load calculation.
  // Calculation flow:
  //   Connected Load → Demand Factor → Diversity Factor
  //   → Calculated Current → effectiveCurrent → Recommended Breaker
  //   → Section Rated Current
  const recommendedBreaker = loadCalc?.recommendedBreaker;
  const effectiveCurrent = loadCalc?.effectiveCurrent;
  const autoValue =
    recommendedBreaker != null ? String(recommendedBreaker) : undefined;

  sec.electricalProtection.sectionRatedCurrent = {
    visible: true,
    locked: true,
    autoFillValue: autoValue,
    reason: autoValue
      ? `Auto-calculated: effective current ${effectiveCurrent}A → recommended breaker ${recommendedBreaker}A`
      : "Waiting for load definition (connected load, demand/diversity factors) to calculate.",
  };

  addDep(result, `section.${sn}.connectedLoad`, `section.${sn}.sectionRatedCurrent`, "auto-fill", "field-intelligence", "module-10", "module-11");
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Type Intelligence
// ─────────────────────────────────────────────────────────────────────────────

function evaluateSectionTypeIntelligence(
  inputs: FieldIntelligenceInputs,
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const sectionType = section.definition.sectionType;

  if (!sectionType) return;

  switch (sectionType) {
    case "Incomer": {
      // Breaker type: ACB only
      sec.breakerFilters.breakerType = {
        visible: true,
        locked: false,
        filteredOptions: ["ACB"],
        autoFillValue: "ACB",
        reason: "Incomer sections require ACB breaker type.",
      };

      // Recommend drawout mounting
      sec.layoutHardware.mountingStructure = {
        visible: true,
        locked: false,
        recommendedValue: "Drawout",
        recommendationText:
          "Drawout mounting is recommended for incomer sections for ease of maintenance.",
      };

      // Feeder type auto-set
      sec.electricalProtection.feederType = {
        visible: true,
        locked: false,
        filteredOptions: ["Incomer"],
        autoFillValue: "Incomer",
        reason: "Feeder type auto-set to Incomer for incomer sections.",
      };

      // Parent section not applicable
      sec.electricalProtection.parentSection = {
        visible: false,
        locked: false,
        reason: "Incomer sections do not have parent sections.",
      };

      addDep(result, `section.${sn}.sectionType`, `section.${sn}.breakerType`, "auto-filter", "field-intelligence", "module-06", "module-11");
      addDep(result, `section.${sn}.sectionType`, `section.${sn}.mountingStructure`, "recommendation", "field-intelligence", "module-06", "module-11");
      addDep(result, `section.${sn}.sectionType`, `section.${sn}.feederType`, "auto-fill", "field-intelligence", "module-06", "module-11");
      break;
    }

    case "Bus Coupler": {
      // Breaker type: ACB only
      sec.breakerFilters.breakerType = {
        visible: true,
        locked: false,
        filteredOptions: ["ACB"],
        autoFillValue: "ACB",
        reason: "Bus coupler sections require ACB breaker type.",
      };

      // Recommend drawout, transfer-rated configuration
      sec.layoutHardware.mountingStructure = {
        visible: true,
        locked: false,
        recommendedValue: "Drawout",
        recommendationText:
          "Drawout mounting with transfer-rated configuration is recommended for bus coupler sections.",
      };

      // Feeder type
      sec.electricalProtection.feederType = {
        visible: true,
        locked: false,
        filteredOptions: ["Bus Coupler", "Tie"],
        reason: "Bus coupler sections allow Bus Coupler or Tie feeder types.",
      };

      // Parent section not applicable for bus coupler
      sec.electricalProtection.parentSection = {
        visible: false,
        locked: false,
        reason: "Bus coupler sections do not have parent sections.",
      };

      addDep(result, `section.${sn}.sectionType`, `section.${sn}.breakerType`, "auto-filter", "field-intelligence", "module-06", "module-11");
      addDep(result, `section.${sn}.sectionType`, `section.${sn}.mountingStructure`, "recommendation", "field-intelligence", "module-06", "module-11");
      break;
    }

    case "Feeder":
    case "Outgoing": {
      // Allow MCCB, MCB, ACB (high-current)
      sec.breakerFilters.breakerType = {
        visible: true,
        locked: false,
        filteredOptions: ["ACB", "MCCB", "MCB"],
        reason:
          "Feeder/Outgoing sections support ACB, MCCB, and MCB breaker types.",
      };

      // Feeder type
      sec.electricalProtection.feederType = {
        visible: true,
        locked: false,
        filteredOptions: ["Outgoing"],
        autoFillValue: "Outgoing",
        reason: "Feeder/Outgoing sections use Outgoing feeder type.",
      };

      addDep(result, `section.${sn}.sectionType`, `section.${sn}.breakerType`, "auto-filter", "field-intelligence", "module-06", "module-11");
      break;
    }

    case "Motor Feeder": {
      sec.breakerFilters.breakerType = {
        visible: true,
        locked: false,
        filteredOptions: ["MCCB", "MCB"],
        reason: "Motor feeder sections typically use MCCB or MCB.",
      };

      // Auto-fill load type
      sec.electricalProtection.loadType = {
        visible: true,
        locked: false,
        autoFillValue: "Motor Load",
        reason: "Motor feeder sections default to Motor Load type.",
      };

      // Feeder type
      sec.electricalProtection.feederType = {
        visible: true,
        locked: false,
        filteredOptions: ["Outgoing"],
        autoFillValue: "Outgoing",
        reason: "Motor feeder sections use Outgoing feeder type.",
      };

      addDep(result, `section.${sn}.sectionType`, `section.${sn}.loadType`, "auto-fill", "field-intelligence", "module-06", "module-11");
      break;
    }

    case "Capacitor": {
      sec.breakerFilters.breakerType = {
        visible: true,
        locked: false,
        filteredOptions: ["MCCB", "MCB"],
        reason: "Capacitor sections typically use MCCB or MCB.",
      };

      sec.electricalProtection.loadType = {
        visible: true,
        locked: false,
        autoFillValue: "Capacitive Load",
        reason: "Capacitor sections default to Capacitive Load type.",
      };

      sec.electricalProtection.feederType = {
        visible: true,
        locked: false,
        filteredOptions: ["Outgoing"],
        autoFillValue: "Outgoing",
        reason: "Capacitor sections use Outgoing feeder type.",
      };

      addDep(result, `section.${sn}.sectionType`, `section.${sn}.loadType`, "auto-fill", "field-intelligence", "module-06", "module-11");
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Type Intelligence
// ─────────────────────────────────────────────────────────────────────────────

function evaluateLoadTypeIntelligence(
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const loadType = section.electricalProtection.loadType;

  if (!loadType) return;

  switch (loadType) {
    case "Motor Load": {
      // Recommend demand / diversity defaults for motor loads
      if (!section.electricalProtection.demandFactor) {
        sec.electricalProtection.demandFactor = {
          visible: true,
          locked: false,
          recommendedValue: "0.8",
          recommendationText: "0.8 demand factor is recommended for motor loads.",
        };
      }
      if (!section.electricalProtection.diversityFactor) {
        sec.electricalProtection.diversityFactor = {
          visible: true,
          locked: false,
          recommendedValue: "0.9",
          recommendationText: "0.9 diversity factor is recommended for motor loads.",
        };
      }
      // Recommend continuous load
      sec.electricalProtection.continuousLoad = {
        visible: true,
        locked: false,
        recommendedValue: "Yes",
        recommendationText: "Motor loads are typically continuous-duty.",
      };
      addDep(result, `section.${sn}.loadType`, `section.${sn}.demandFactor`, "recommendation", "field-intelligence", "module-10", "module-11");
      addDep(result, `section.${sn}.loadType`, `section.${sn}.diversityFactor`, "recommendation", "field-intelligence", "module-10", "module-11");
      break;
    }

    case "Lighting Load": {
      if (!section.electricalProtection.diversityFactor) {
        sec.electricalProtection.diversityFactor = {
          visible: true,
          locked: false,
          recommendedValue: "0.7",
          recommendationText:
            "Lower diversity factor is recommended for lighting loads.",
        };
      }
      addDep(result, `section.${sn}.loadType`, `section.${sn}.diversityFactor`, "recommendation", "field-intelligence", "module-10", "module-11");
      break;
    }

    case "Non-Linear Load": {
      // Warning about neutral sizing considerations
      result.warnings.push(
        `Section ${sn}: Non-linear load detected. Neutral conductor sizing must account for harmonic currents.`,
      );
      sec.electricalProtection.loadType = {
        ...(sec.electricalProtection.loadType ?? DEFAULT_DIRECTIVE),
        visible: true,
        locked: false,
        warningMessage:
          "Non-linear load: Neutral sizing considerations required. Check for harmonic-sensitive behavior.",
      };
      break;
    }

    case "Mixed Load": {
      if (!section.electricalProtection.demandFactor) {
        sec.electricalProtection.demandFactor = {
          visible: true,
          locked: false,
          recommendedValue: "0.7",
          recommendationText: "0.7 demand factor is recommended for mixed loads.",
        };
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Breaker Intelligence
// ─────────────────────────────────────────────────────────────────────────────

/** Valid breaker voltages for filtering */
const ALL_BREAKER_VOLTAGES = ["230", "400", "415", "440", "480", "690"];

/** Valid breaking capacities for filtering */
const ALL_BREAKING_CAPACITIES = [
  "25", "36", "50", "65", "70", "85", "100", "120", "150",
];

function evaluateBreakerIntelligence(
  inputs: FieldIntelligenceInputs,
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const sp = inputs.systemParameters;
  const breakerType = section.breakerTypeFilter;

  // ── Breaker type → mounting structure ──
  if (breakerType) {
    switch (breakerType) {
      case "ACB": {
        // ACB: recommend drawout, allow Fixed and Drawout
        const existing = sec.layoutHardware.mountingStructure;
        sec.layoutHardware.mountingStructure = {
          visible: true,
          locked: false,
          filteredOptions: ["Fixed", "Drawout"],
          recommendedValue: existing?.recommendedValue ?? "Drawout",
          recommendationText:
            existing?.recommendationText ??
            "Drawout mounting is recommended for ACB installations.",
          reason: existing?.reason,
        };
        break;
      }
      case "MCCB": {
        const existing = sec.layoutHardware.mountingStructure;
        sec.layoutHardware.mountingStructure = {
          visible: true,
          locked: false,
          filteredOptions: ["Fixed", "Drawout"],
          recommendedValue: existing?.recommendedValue ?? "Fixed",
          recommendationText:
            existing?.recommendationText ??
            "Fixed mounting is typical for MCCB installations.",
          reason: existing?.reason,
        };
        break;
      }
      case "MCB": {
        // MCBs are always fixed mounting
        sec.layoutHardware.mountingStructure = {
          visible: true,
          locked: false,
          filteredOptions: ["Fixed"],
          autoFillValue: "Fixed",
          reason: "MCB breakers use fixed mounting only.",
        };
        addDep(result, `section.${sn}.breakerType`, `section.${sn}.mountingStructure`, "auto-select", "field-intelligence", "module-06", "module-11");
        break;
      }
    }
  }

  // ── System voltage → breaker rated voltage filtering ──
  if (sp.systemVoltage) {
    const sysV = parseInt(sp.systemVoltage, 10);
    if (Number.isFinite(sysV)) {
      // Breaker rated voltage must be ≥ system voltage
      const validVoltages = ALL_BREAKER_VOLTAGES.filter(
        (v) => parseInt(v, 10) >= sysV,
      );
      sec.breakerFilters.ratedVoltage = {
        visible: true,
        locked: false,
        filteredOptions: validVoltages,
        reason: `Breaker rated voltage must be ≥ system voltage (${sp.systemVoltage}V).`,
      };
      addDep(result, "system.systemVoltage", `section.${sn}.ratedVoltage`, "auto-filter", "field-intelligence", "module-07", "module-11");
    }
  }

  // ── Short circuit rating → breaking capacity filtering ──
  if (sp.shortCircuitRating) {
    const sysKA = parseInt(sp.shortCircuitRating, 10);
    if (Number.isFinite(sysKA)) {
      // Breaking capacity must be ≥ system short circuit rating
      const validKA = ALL_BREAKING_CAPACITIES.filter(
        (ka) => parseInt(ka, 10) >= sysKA,
      );
      sec.breakerFilters.breakingCapacityKA = {
        visible: true,
        locked: false,
        filteredOptions: validKA,
        reason: `Breaking capacity must be ≥ system short circuit rating (${sp.shortCircuitRating}kA).`,
      };
      addDep(result, "system.shortCircuitRating", `section.${sn}.breakingCapacityKA`, "auto-filter", "field-intelligence", "module-07", "module-11");
    }
  }

  // ── Breaker type change → intelligent reset ──
  // When breaker type changes, only reset incompatible fields.
  // Compatible fields (like cable entry, cable exit) are preserved.
  if (breakerType && inputs.previousResult) {
    const prev = inputs.previousResult.sections[sn];
    const prevBreakerType = prev?.breakerFilters?.breakerType?.autoFillValue;
    if (prevBreakerType && prevBreakerType !== breakerType) {
      // Mounting structure may need reset if incompatible
      const currentMounting = section.layoutHardware.mountingStructure;
      const validMounting =
        sec.layoutHardware.mountingStructure?.filteredOptions;
      if (
        validMounting &&
        currentMounting &&
        !validMounting.includes(currentMounting)
      ) {
        result.resetFields.push({
          section: sn,
          panel: "layoutHardware",
          field: "mountingStructure",
          reason: `Mounting structure "${currentMounting}" is incompatible with ${breakerType} breaker type.`,
        });
        addDep(result, `section.${sn}.breakerType`, `section.${sn}.mountingStructure`, "intelligent-reset", "field-intelligence", "module-06", "module-11");
      }

      // Preserve unrelated fields
      result.preservedFields.push(
        `section.${sn}.layoutHardware.cableEntry`,
        `section.${sn}.layoutHardware.cableExit`,
        `section.${sn}.layoutHardware.busConnection`,
        `section.${sn}.layoutHardware.metering`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessory Intelligence — CT conditional visibility
// ─────────────────────────────────────────────────────────────────────────────

function evaluateAccessoryIntelligence(
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const ctReq = section.layoutHardware.ctRequirement;
  const metering = section.layoutHardware.metering;

  // CT fields visible only when CT is required OR metering needs CTs
  const ctNeeded =
    ctReq === "Required" || metering === "Ammeter" || metering === "MFM";

  if (!ctNeeded) {
    // Hide CT type field; clear incompatible hidden values
    sec.layoutHardware.ctType = {
      visible: false,
      locked: false,
      reason:
        "CT type is not relevant when CT is not required and metering does not need CTs.",
    };

    // If ctType had a value, request cleanup
    if (section.layoutHardware.ctType) {
      result.resetFields.push({
        section: sn,
        panel: "layoutHardware",
        field: "ctType",
        reason: "CT type cleared because CT is not required.",
      });
    }

    addDep(result, `section.${sn}.ctRequirement`, `section.${sn}.ctType`, "conditional-visibility", "field-intelligence", "module-06", "module-11");
  } else {
    sec.layoutHardware.ctType = {
      visible: true,
      locked: false,
    };
  }

  // When metering requires CT, auto-lock ctRequirement
  if (metering === "Ammeter" || metering === "MFM") {
    sec.layoutHardware.ctRequirement = {
      visible: true,
      locked: true,
      autoFillValue: "Required",
      reason: `CT is required for ${metering} metering.`,
    };
    addDep(result, `section.${sn}.metering`, `section.${sn}.ctRequirement`, "auto-fill", "field-intelligence", "module-06", "module-11");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feeder Type Intelligence
// ─────────────────────────────────────────────────────────────────────────────

function evaluateFeederTypeIntelligence(
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  const sn = section.sectionNumber;
  const sec = result.sections[sn];
  const sectionType = section.definition.sectionType;

  // Parent section visibility: only relevant for feeders/outgoing
  if (sectionType === "Incomer" || sectionType === "Bus Coupler") {
    sec.electricalProtection.parentSection = {
      visible: false,
      locked: false,
      reason: `${sectionType} sections do not have parent sections.`,
    };
  }

  // Redundancy type: only relevant for sections that can have redundancy
  if (sectionType === "Capacitor" || sectionType === "Motor Feeder") {
    sec.electricalProtection.redundancyType = {
      visible: true,
      locked: false,
      filteredOptions: ["None"],
      autoFillValue: "None",
      reason: `${sectionType} sections do not support redundancy.`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parent-Child Section Inheritance
// ─────────────────────────────────────────────────────────────────────────────

function evaluateInheritanceRules(
  inputs: FieldIntelligenceInputs,
  section: SectionIntelligenceInput,
  result: FieldIntelligenceResult,
): void {
  // Feeder sections inherit system voltage, fault level constraints,
  // and bus topology constraints from the parent incomer through the
  // Event Engine (Module 11). This function records the dependency
  // relationships — actual propagation occurs via the pipeline.
  const sn = section.sectionNumber;
  const sectionType = section.definition.sectionType;

  if (
    sectionType === "Feeder" ||
    sectionType === "Outgoing" ||
    sectionType === "Motor Feeder" ||
    sectionType === "Capacitor"
  ) {
    addDep(result, "system.systemVoltage", `section.${sn}.breakerVoltage`, "auto-filter", "field-intelligence", "module-05", "module-11");
    addDep(result, "system.shortCircuitRating", `section.${sn}.breakingCapacity`, "auto-filter", "field-intelligence", "module-05", "module-11");
    addDep(result, "system.busConfiguration", `section.${sn}.busConnection`, "auto-filter", "field-intelligence", "module-05", "module-11");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Get Field Directive with safe fallback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve a field directive from the result, falling back to DEFAULT_DIRECTIVE
 * if no directive exists for that field. Safe to call for any field path.
 */
export function getSystemDirective(
  result: FieldIntelligenceResult | null,
  fieldName: string,
): FieldDirective {
  return result?.system[fieldName] ?? DEFAULT_DIRECTIVE;
}

export function getSectionDirective(
  result: FieldIntelligenceResult | null,
  sectionNumber: number,
  panel: keyof SectionFieldDirectives,
  fieldName: string,
): FieldDirective {
  return (
    result?.sections[sectionNumber]?.[panel]?.[fieldName] ?? DEFAULT_DIRECTIVE
  );
}

/**
 * Collect all auto-fill values from the result for batch application.
 * Returns a flat list of { scope, field, value } entries.
 */
export function collectAutoFills(
  result: FieldIntelligenceResult,
): Array<{
  scope: "system" | "section";
  sectionNumber?: number;
  panel?: keyof SectionFieldDirectives;
  field: string;
  value: string;
}> {
  const fills: Array<{
    scope: "system" | "section";
    sectionNumber?: number;
    panel?: keyof SectionFieldDirectives;
    field: string;
    value: string;
  }> = [];

  // System auto-fills
  for (const [field, directive] of Object.entries(result.system)) {
    if (directive.autoFillValue != null) {
      fills.push({ scope: "system", field, value: directive.autoFillValue });
    }
  }

  // Section auto-fills
  for (const [snStr, panels] of Object.entries(result.sections)) {
    const sectionNumber = Number(snStr);
    for (const panelName of [
      "definition",
      "electricalProtection",
      "layoutHardware",
      "breakerFilters",
    ] as const) {
      for (const [field, directive] of Object.entries(panels[panelName])) {
        if (directive.autoFillValue != null) {
          fills.push({
            scope: "section",
            sectionNumber,
            panel: panelName,
            field,
            value: directive.autoFillValue,
          });
        }
      }
    }
  }

  return fills;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function addDep(
  result: FieldIntelligenceResult,
  controlling: string,
  affected: string,
  behavior: DependencyTrigger["behaviorType"],
  resetOwner: string,
  validationOwner: string,
  eventOwner: string,
): void {
  result.triggeredDependencies.push({
    controllingField: controlling,
    affectedField: affected,
    behaviorType: behavior,
    resetOwnership: resetOwner,
    validationOwnership: validationOwner,
    eventTriggerOwnership: eventOwner,
  });
}
