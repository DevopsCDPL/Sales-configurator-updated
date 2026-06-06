/**
 * Layout Dependency Logic
 *
 * Translates electrical configuration into physically valid switchgear
 * panel layout constraints. All dimensions are system-driven — no manual
 * override allowed.
 * Pure logic — no UI, no side effects.
 *
 * Triggered via Event Engine when:
 *  - breaker selection changes
 *  - mountingType changes
 *  - busbar rating changes
 *  - cable entry changes
 */

// ── Interfaces ──

export interface BreakerDimensions {
  /** Height of the breaker compartment in mm */
  height: number;
  /** Width of the breaker compartment in mm */
  width: number;
  /** Depth of the breaker compartment in mm */
  depth: number;
}

export interface BreakerLayoutInput {
  /** Breaker type: "ACB" | "MCCB" | "MCB" */
  breakerType: string;
  /** Rated current in amps */
  ratedCurrentA: number | null;
  /** Mounting type from the breaker entry: "Fixed" | "Drawout" */
  mountingType: string;
  /** Raw dimensions string from catalog (e.g. "Fixed 3P -301 x 276 x 209mm") */
  catalogDimensions: string;
}

export interface LayoutDependencyInputs {
  /** Breakers placed in this section */
  breakers: BreakerLayoutInput[];
  /** Section type: "Incomer" | "Feeder" | "Bus Coupler" etc. */
  sectionType: string;
  /** Mounting structure from Layout & Hardware: "Fixed" | "Drawout" */
  mountingStructure: string;
  /** Stacking mode: "Single Tier" | "Double Tier" | "Multi Tier" */
  stacking: string;
  /** Section height from System Parameters in mm (e.g. "2200") */
  sectionHeight: string;
  /** Section width from System Parameters in mm (e.g. "800") */
  sectionWidth: string;
  /** Section depth from System Parameters in mm (e.g. "1000") */
  sectionDepth: string;
  /** Main busbar rating in amps from System Parameters */
  busbarRating: string;
  /** Cable entry: "Top" | "Bottom" | "Top & Bottom" */
  cableEntry: string;
  /** Cable exit: "Top" | "Bottom" | "Top & Bottom" */
  cableExit: string;
  /** Access type: "Front Access" | "Rear Access" | "Front & Rear Access" */
  accessType: string;
}

export interface LayoutDependencyResult {
  /** Whether the section layout is physically valid */
  layoutValid: boolean;
  /** Total required height in mm */
  requiredHeight: number;
  /** Total required width in mm */
  requiredWidth: number;
  /** Total required depth in mm */
  requiredDepth: number;
  /** Available height after cable entry/exit reservations */
  availableHeight: number;
  /** Available width */
  availableWidth: number;
  /** Available depth after access clearances */
  availableDepth: number;
  /** Blocking errors — layout cannot proceed */
  errors: string[];
  /** Non-blocking advisories */
  warnings: string[];
}

// ── Constants ──

/** Minimum compartment dimensions by breaker type (mm) */
const COMPARTMENT_SPECS: Record<string, { minHeight: number; maxHeight: number; minWidth: number; maxWidth: number; minDepth: number; maxDepth: number }> = {
  ACB: { minHeight: 800, maxHeight: 800, minWidth: 400, maxWidth: 400, minDepth: 1000, maxDepth: 1000 },
  MCCB: { minHeight: 300, maxHeight: 600, minWidth: 200, maxWidth: 400, minDepth: 600, maxDepth: 800 },
  MCB: { minHeight: 150, maxHeight: 300, minWidth: 100, maxWidth: 100, minDepth: 400, maxDepth: 600 },
};

/** Thermal spacing between breakers by type (mm) */
const THERMAL_SPACING: Record<string, number> = {
  ACB: 100,
  MCCB: 50,
  MCB: 20,
};

/** Additional depth required for drawout mounting (mm) */
const DRAWOUT_DEPTH_ADDITION = 200;

/** Space reservation for cable entry/exit (mm) */
const CABLE_SPACE_RESERVATION = 200;

/** Rear access clearance (mm) */
const REAR_ACCESS_CLEARANCE = 150;

/** Busbar clearance multiplier for ratings > 1600A */
const HIGH_BUSBAR_CLEARANCE_FACTOR = 1.2;

// ── Parse Helpers ──

/**
 * Parse catalog dimensions string like "Fixed 3P -301 x 276 x 209mm"
 * into { height, width, depth } in mm.
 * Falls back to type-based defaults if parsing fails.
 */
function parseCatalogDimensions(raw: string): { h: number; w: number; d: number } | null {
  if (!raw) return null;
  // Extract all numbers from dimension strings
  const nums = raw.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  // Catalog format is typically H x W x D
  const values = nums.map(Number).filter(Number.isFinite);
  if (values.length < 3) return null;
  return { h: values[0], w: values[1], d: values[2] };
}

/** Get compartment dimensions for a breaker, using catalog data or type-based defaults */
function getBreakerCompartmentDimensions(breaker: BreakerLayoutInput): BreakerDimensions {
  const catalogDims = parseCatalogDimensions(breaker.catalogDimensions);

  const spec = COMPARTMENT_SPECS[breaker.breakerType];
  if (!spec) {
    // Unknown breaker type — use MCCB as conservative default
    const fallback = COMPARTMENT_SPECS.MCCB;
    return {
      height: catalogDims?.h ?? fallback.minHeight,
      width: catalogDims?.w ?? fallback.minWidth,
      depth: catalogDims?.d ?? fallback.minDepth,
    };
  }

  // Use catalog dimensions if available, but enforce minimums from spec
  return {
    height: Math.max(catalogDims?.h ?? spec.minHeight, spec.minHeight),
    width: Math.max(catalogDims?.w ?? spec.minWidth, spec.minWidth),
    depth: Math.max(catalogDims?.d ?? spec.minDepth, spec.minDepth),
  };
}

// ── Main Engine ──

/**
 * Evaluate layout constraints for a single section.
 *
 * Steps:
 * 1. Breaker size classification
 * 2. Minimum compartment requirement
 * 3. Mounting type impact
 * 4. Stacking logic (vertical)
 * 5. Horizontal space validation
 * 6. Busbar clearance requirement
 * 7. Cable entry impact
 * 8. Access type validation
 * 9. Thermal spacing
 * 10. Section validity
 */
export function evaluateLayoutDependency(
  inputs: LayoutDependencyInputs,
): LayoutDependencyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Parse section dimensions
  const sectionHeight = parseFloat(inputs.sectionHeight);
  const sectionWidth = parseFloat(inputs.sectionWidth);
  const sectionDepth = parseFloat(inputs.sectionDepth);
  const busbarRating = parseFloat(inputs.busbarRating);

  // If no breakers or no section dimensions, return clean state
  if (inputs.breakers.length === 0) {
    return {
      layoutValid: true,
      requiredHeight: 0,
      requiredWidth: 0,
      requiredDepth: 0,
      availableHeight: Number.isFinite(sectionHeight) ? sectionHeight : 0,
      availableWidth: Number.isFinite(sectionWidth) ? sectionWidth : 0,
      availableDepth: Number.isFinite(sectionDepth) ? sectionDepth : 0,
      errors: [],
      warnings: [],
    };
  }

  // ── Step 1 & 2: Breaker Size Classification & Compartment Requirements ──
  const compartments = inputs.breakers.map((b) => ({
    breaker: b,
    dims: getBreakerCompartmentDimensions(b),
    spacing: THERMAL_SPACING[b.breakerType] ?? THERMAL_SPACING.MCCB,
  }));

  // ── Step 3: Mounting Type Impact ──
  let depthAddition = 0;
  const effectiveMounting = inputs.mountingStructure || "";
  if (effectiveMounting.toLowerCase() === "drawout") {
    depthAddition = DRAWOUT_DEPTH_ADDITION;
  }

  // ── Step 9: Thermal Spacing (computed per breaker) ──
  // Total spacing = (n-1) gaps between breakers
  const totalThermalSpacing =
    compartments.length > 1
      ? compartments
          .slice(0, -1)
          .reduce((sum, c) => sum + c.spacing, 0)
      : 0;

  // ── Step 4: Stacking Logic (Vertical) ──
  const totalBreakerHeight =
    compartments.reduce((sum, c) => sum + c.dims.height, 0) +
    totalThermalSpacing;

  // ── Step 5: Horizontal Space (cumulative width for side-by-side layout) ──
  const totalBreakerWidth = compartments.reduce(
    (sum, c) => sum + c.dims.width, 0,
  );

  // ── Step 3 (continued): Depth requirement ──
  const maxBreakerDepth =
    Math.max(...compartments.map((c) => c.dims.depth)) + depthAddition;

  // ── Step 6: Busbar Clearance Requirement ──
  let busbarClearanceMultiplier = 1;
  if (Number.isFinite(busbarRating) && busbarRating > 1600) {
    busbarClearanceMultiplier = HIGH_BUSBAR_CLEARANCE_FACTOR;
    warnings.push(
      "High busbar rating (>1600A): increased compartment clearances applied",
    );
  }

  const requiredHeight = Math.ceil(totalBreakerHeight * busbarClearanceMultiplier);
  const requiredWidth = Math.ceil(totalBreakerWidth);
  const requiredDepth = Math.ceil(maxBreakerDepth);

  // ── Step 7: Cable Entry Impact ──
  let cableHeightReservation = 0;
  const entry = (inputs.cableEntry || "").toLowerCase();
  const exit = (inputs.cableExit || "").toLowerCase();

  if (entry.includes("bottom") || exit.includes("bottom")) {
    cableHeightReservation += CABLE_SPACE_RESERVATION;
  }
  if (entry.includes("top") || exit.includes("top")) {
    cableHeightReservation += CABLE_SPACE_RESERVATION;
  }

  // ── Step 8: Access Type Validation ──
  let depthClearanceReduction = 0;
  const access = (inputs.accessType || "").toLowerCase();
  if (access.includes("rear") || access.includes("front & rear")) {
    depthClearanceReduction = REAR_ACCESS_CLEARANCE;
  }
  if (access === "front access") {
    // Front-only: all components must be front-serviceable
    // Drawout mounting satisfies this; fixed mounting with large breakers does not
    if (effectiveMounting.toLowerCase() !== "drawout" && effectiveMounting) {
      const hasACB = compartments.some(
        (c) => c.breaker.breakerType === "ACB",
      );
      if (hasACB) {
        errors.push(
          "Front-only access requires drawout mounting for ACB breakers",
        );
      }
    }
  }

  // ── Compute available space ──
  const availableHeight =
    (Number.isFinite(sectionHeight) ? sectionHeight : 0) -
    cableHeightReservation;
  const availableWidth = Number.isFinite(sectionWidth) ? sectionWidth : 0;
  const availableDepth =
    (Number.isFinite(sectionDepth) ? sectionDepth : 0) -
    depthClearanceReduction;

  // ── Step 10: Section Validity ──
  if (Number.isFinite(sectionHeight) && sectionHeight > 0) {
    if (requiredHeight > availableHeight) {
      errors.push(
        `Selected breakers exceed available section height (${requiredHeight}mm required, ${availableHeight}mm available)`,
      );
    }
  }

  if (Number.isFinite(sectionWidth) && sectionWidth > 0) {
    if (requiredWidth > availableWidth) {
      errors.push(
        `Breaker configuration exceeds section width (${requiredWidth}mm required, ${availableWidth}mm available)`,
      );
    }
  }

  if (Number.isFinite(sectionDepth) && sectionDepth > 0) {
    if (requiredDepth > availableDepth) {
      errors.push(
        `Breaker depth exceeds available section depth (${requiredDepth}mm required, ${availableDepth}mm available)`,
      );
    }
  }

  // Warn if section dimensions are not defined
  if (!Number.isFinite(sectionHeight) || sectionHeight <= 0) {
    if (inputs.breakers.length > 0) {
      warnings.push("Section height not defined — cannot validate vertical fit");
    }
  }
  if (!Number.isFinite(sectionWidth) || sectionWidth <= 0) {
    if (inputs.breakers.length > 0) {
      warnings.push("Section width not defined — cannot validate horizontal fit");
    }
  }

  const layoutValid = errors.length === 0;

  return {
    layoutValid,
    requiredHeight,
    requiredWidth,
    requiredDepth,
    availableHeight,
    availableWidth,
    availableDepth,
    errors,
    warnings,
  };
}
