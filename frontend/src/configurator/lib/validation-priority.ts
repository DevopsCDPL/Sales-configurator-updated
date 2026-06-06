/**
 * Centralized Validation & Error Priority System
 *
 * Collects ALL validation outputs from modules 05–10, classifies by severity,
 * determines blocking state, and returns a unified prioritized result.
 *
 * Execution order: Runs AFTER all modules complete (final step in pipeline).
 *
 * Rules:
 *  - Does NOT generate new validation rules
 *  - Does NOT modify validation logic in other modules
 *  - Collects, classifies, deduplicates, and prioritizes only
 *  - System behavior is deterministic and transparent
 */

// ── Severity Levels ──

export type ErrorSeverity = "critical" | "major" | "warning";

// ── Structured Error Entry ──

export interface ValidationEntry {
  message: string;
  severity: ErrorSeverity;
  sourceModule: SourceModule;
  affectedSection: number | null; // null = system-level
}

export type SourceModule =
  | "load-calculation"
  | "section-validation"
  | "breaker-filtering"
  | "layout-dependency"
  | "system-validation"
  | "cross-section-interaction";

// ── Input: Raw module outputs ──

export interface ModuleValidationOutput {
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export interface SectionModuleOutputs {
  sectionNumber: number;
  loadCalc: ModuleValidationOutput;
  sectionValidation: ModuleValidationOutput;
  breakerFilter: ModuleValidationOutput;
  layoutResult: ModuleValidationOutput;
}

export interface ValidationPriorityInputs {
  sections: SectionModuleOutputs[];
  systemValidation: ModuleValidationOutput;
  crossSectionInteraction: ModuleValidationOutput;
}

// ── Output ──

export interface ValidationPriorityResult {
  /** TRUE if any LEVEL 1 (critical) error exists — entire system blocked */
  systemBlocked: boolean;
  /** Section numbers that are individually blocked (LEVEL 2 errors) */
  blockedSections: number[];
  /** LEVEL 1: Critical errors that block the entire system */
  criticalErrors: ValidationEntry[];
  /** LEVEL 2: Major errors that block individual sections */
  majorErrors: ValidationEntry[];
  /** LEVEL 3: Warnings that allow continuation */
  warnings: ValidationEntry[];
  /** All entries sorted by display priority */
  displayOrder: ValidationEntry[];
  /** Per-section grouped errors (deduplicated) */
  sectionGrouped: Record<number, ValidationEntry[]>;
  /** System-level grouped errors (deduplicated) */
  systemGrouped: ValidationEntry[];
  /** Source-type grouping per spec Step 1 */
  bySource: {
    sectionErrors: ValidationEntry[];
    systemErrors: ValidationEntry[];
    layoutErrors: ValidationEntry[];
    crossSectionErrors: ValidationEntry[];
    warnings: ValidationEntry[];
  };
}

// ── Classification Rules ──

/**
 * LEVEL 1 — CRITICAL (BLOCK SYSTEM)
 * Matches against error message patterns from existing modules.
 */
const CRITICAL_PATTERNS: RegExp[] = [
  /total load exceeds main bus rating/i,
  /at least one incomer.*required/i,
  /no valid.*power source/i,
  /feeder has no valid upstream power source/i,
  /interrupting capacity below system fault level/i,
  /short circuit/i,
  /incomer breaker is undersized for total system load/i,
  /incomers are undersized for shared load/i,
  /bus coupler requires minimum two incomers/i,
  /cross-section interaction validation failed/i,
];

/**
 * LEVEL 2 — MAJOR (BLOCK SECTION)
 * Matches against error message patterns from existing modules.
 */
const MAJOR_PATTERNS: RegExp[] = [
  /breaker is undersized for calculated load/i,
  /load must be defined before selecting breaker/i,
  /breaker is not valid for current configuration/i,
  /requires ACB breaker type/i,
  /MCB is not permitted/i,
  /mounting.*mismatch/i,
  /breaker.*mounting type does not match/i,
  /exceeds available.*height/i,
  /exceeds available.*width/i,
  /exceeds available.*depth/i,
  /no eligible breakers/i,
  /section.*incomplete/i,
];

// ── Classification Engine ──

function classifyError(message: string): ErrorSeverity {
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(message)) return "critical";
  }
  for (const pattern of MAJOR_PATTERNS) {
    if (pattern.test(message)) return "major";
  }
  // Default: unmatched errors are treated as major (safe default)
  return "major";
}

// ── Core Logic ──

/**
 * Evaluate all module validation outputs and produce a prioritized, grouped result.
 *
 * This function:
 *  1. Aggregates all errors/warnings from all modules
 *  2. Classifies each by severity level
 *  3. Deduplicates per-section
 *  4. Determines system/section blocking state
 *  5. Returns sorted display order
 */
export function evaluateValidationPriority(
  inputs: ValidationPriorityInputs,
): ValidationPriorityResult {
  const allEntries: ValidationEntry[] = [];
  const sectionGrouped: Record<number, ValidationEntry[]> = {};
  const systemGrouped: ValidationEntry[] = [];

  // ── Collect section-level module outputs ──
  for (const section of inputs.sections) {
    const sn = section.sectionNumber;
    const seenMessages = new Set<string>();
    sectionGrouped[sn] = [];

    // Load Calculation errors
    for (const msg of section.loadCalc.errors) {
      if (seenMessages.has(msg)) continue;
      seenMessages.add(msg);
      const entry: ValidationEntry = {
        message: msg,
        severity: classifyError(msg),
        sourceModule: "load-calculation",
        affectedSection: sn,
      };
      allEntries.push(entry);
      sectionGrouped[sn].push(entry);
    }

    // Section Validation errors
    for (const msg of section.sectionValidation.errors) {
      if (seenMessages.has(msg)) continue;
      seenMessages.add(msg);
      const entry: ValidationEntry = {
        message: msg,
        severity: classifyError(msg),
        sourceModule: "section-validation",
        affectedSection: sn,
      };
      allEntries.push(entry);
      sectionGrouped[sn].push(entry);
    }

    // Breaker Filtering errors
    for (const msg of section.breakerFilter.errors) {
      if (seenMessages.has(msg)) continue;
      seenMessages.add(msg);
      const entry: ValidationEntry = {
        message: msg,
        severity: classifyError(msg),
        sourceModule: "breaker-filtering",
        affectedSection: sn,
      };
      allEntries.push(entry);
      sectionGrouped[sn].push(entry);
    }

    // Layout errors
    for (const msg of section.layoutResult.errors) {
      if (seenMessages.has(msg)) continue;
      seenMessages.add(msg);
      const entry: ValidationEntry = {
        message: msg,
        severity: classifyError(msg),
        sourceModule: "layout-dependency",
        affectedSection: sn,
      };
      allEntries.push(entry);
      sectionGrouped[sn].push(entry);
    }

    // Warnings from all section modules
    const allSectionWarnings = [
      ...section.loadCalc.warnings.map((m) => ({ msg: m, src: "load-calculation" as SourceModule })),
      ...section.sectionValidation.warnings.map((m) => ({ msg: m, src: "section-validation" as SourceModule })),
      ...section.breakerFilter.warnings.map((m) => ({ msg: m, src: "breaker-filtering" as SourceModule })),
      ...section.layoutResult.warnings.map((m) => ({ msg: m, src: "layout-dependency" as SourceModule })),
    ];

    for (const { msg, src } of allSectionWarnings) {
      if (seenMessages.has(msg)) continue;
      seenMessages.add(msg);
      const entry: ValidationEntry = {
        message: msg,
        severity: "warning",
        sourceModule: src,
        affectedSection: sn,
      };
      allEntries.push(entry);
      sectionGrouped[sn].push(entry);
    }
  }

  // ── Collect system-level module outputs ──
  const systemSeenMessages = new Set<string>();

  // System Validation errors
  for (const msg of inputs.systemValidation.errors) {
    if (systemSeenMessages.has(msg)) continue;
    systemSeenMessages.add(msg);
    const entry: ValidationEntry = {
      message: msg,
      severity: classifyError(msg),
      sourceModule: "system-validation",
      affectedSection: null,
    };
    allEntries.push(entry);
    systemGrouped.push(entry);
  }

  // Cross Section Interaction errors
  for (const msg of inputs.crossSectionInteraction.errors) {
    if (systemSeenMessages.has(msg)) continue;
    systemSeenMessages.add(msg);
    const entry: ValidationEntry = {
      message: msg,
      severity: classifyError(msg),
      sourceModule: "cross-section-interaction",
      affectedSection: null,
    };
    allEntries.push(entry);
    systemGrouped.push(entry);
  }

  // System-level warnings
  const systemWarnings = [
    ...inputs.systemValidation.warnings.map((m) => ({ msg: m, src: "system-validation" as SourceModule })),
    ...inputs.crossSectionInteraction.warnings.map((m) => ({ msg: m, src: "cross-section-interaction" as SourceModule })),
  ];

  for (const { msg, src } of systemWarnings) {
    if (systemSeenMessages.has(msg)) continue;
    systemSeenMessages.add(msg);
    const entry: ValidationEntry = {
      message: msg,
      severity: "warning",
      sourceModule: src,
      affectedSection: null,
    };
    allEntries.push(entry);
    systemGrouped.push(entry);
  }

  // ── Classify into priority buckets ──
  const criticalErrors = allEntries.filter((e) => e.severity === "critical");
  const majorErrors = allEntries.filter((e) => e.severity === "major");
  const warnings = allEntries.filter((e) => e.severity === "warning");

  // ── Determine blocking state ──
  const systemBlocked = criticalErrors.length > 0;

  // Sections blocked by LEVEL 2 errors (only if system is NOT already blocked)
  const blockedSections: number[] = [];
  if (!systemBlocked) {
    for (const section of inputs.sections) {
      const sn = section.sectionNumber;
      const hasMajor = majorErrors.some((e) => e.affectedSection === sn);
      if (hasMajor) {
        blockedSections.push(sn);
      }
    }
  }

  // ── Build display order: LEVEL 1 → LEVEL 2 → LEVEL 3, within same level: System → Section → Component ──
  const sortKey = (entry: ValidationEntry): number => {
    let base = 0;
    if (entry.severity === "critical") base = 0;
    else if (entry.severity === "major") base = 1000;
    else base = 2000;

    // Within same level: system-level first (null section), then by section number
    if (entry.affectedSection === null) {
      base += 0;
    } else {
      base += entry.affectedSection;
    }
    return base;
  };

  const displayOrder = [...allEntries].sort((a, b) => sortKey(a) - sortKey(b));

  // ── Source-type grouping per spec Step 1 ──
  const bySource = {
    sectionErrors: allEntries.filter(
      (e) => e.severity !== "warning" &&
        (e.sourceModule === "section-validation" || e.sourceModule === "load-calculation" || e.sourceModule === "breaker-filtering"),
    ),
    systemErrors: allEntries.filter(
      (e) => e.severity !== "warning" && e.sourceModule === "system-validation",
    ),
    layoutErrors: allEntries.filter(
      (e) => e.severity !== "warning" && e.sourceModule === "layout-dependency",
    ),
    crossSectionErrors: allEntries.filter(
      (e) => e.severity !== "warning" && e.sourceModule === "cross-section-interaction",
    ),
    warnings,
  };

  return {
    systemBlocked,
    blockedSections,
    criticalErrors,
    majorErrors,
    warnings,
    displayOrder,
    sectionGrouped,
    systemGrouped,
    bySource,
  };
}
