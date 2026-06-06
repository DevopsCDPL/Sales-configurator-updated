/**
 * Shared Calculation Utilities — Frontend
 *
 * Mirrors backend/src/utils/calculations.js so both sides use
 * identical arithmetic.  Import these instead of inline math.
 */

// ─── Line-total ────────────────────────────────────────────────────────────────

export type CostMode = 'unit' | 'weight';

interface LineItemFields {
  quantity?: number | string;
  unit_cost?: number | string;
  unit_price?: number | string;
  weight?: number | string;
  cost_per_weight?: number | string;
}

/**
 * Calculate the total for a single line item.
 */
export function calculateLineTotal(item: LineItemFields, costMode: CostMode = 'unit'): number {
  if (costMode === 'weight') {
    return (Number(item.quantity) || 0) * (Number(item.weight) || 0) * (Number(item.cost_per_weight) || 0);
  }
  const price = Number(item.unit_cost) || Number(item.unit_price) || 0;
  return (Number(item.quantity) || 0) * price;
}

// ─── Subtotal ──────────────────────────────────────────────────────────────────

interface SubtotalItem {
  line_total?: number | string;
  selected?: boolean;
}

/**
 * Sum of line totals for items (optionally only selected ones).
 */
export function calculateSubtotal(
  items: SubtotalItem[],
  { onlySelected = false }: { onlySelected?: boolean } = {},
): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items
    .filter(i => !onlySelected || i.selected !== false)
    .reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);
}

// ─── Tax ───────────────────────────────────────────────────────────────────────

/**
 * Parse a tax rate from tax_type + optional explicit percent.
 * Returns a decimal (e.g. 0.18 for 18%).
 */
export function parseTaxRate(taxType?: string, taxPercent?: number): number {
  if (!taxType || taxType.toLowerCase() === 'exempt') return 0;
  if (taxPercent !== undefined && taxPercent !== null) return (Number(taxPercent) || 0) / 100;
  const match = String(taxType).match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return parseFloat(match[1]) / 100;
  return 0;
}

export function calculateTaxAmount(subtotal: number, taxType?: string, taxPercent?: number): number {
  return subtotal * parseTaxRate(taxType, taxPercent);
}

// ─── Grand total ───────────────────────────────────────────────────────────────

export function calculateGrandTotal(params: {
  subtotal: number;
  taxAmount: number;
  shippingCharges?: number;
}): number {
  return (Number(params.subtotal) || 0) + (Number(params.taxAmount) || 0) + (Number(params.shippingCharges) || 0);
}

// ─── Normalise line items ──────────────────────────────────────────────────────

interface NormalisableItem {
  quantity?: number | string;
  unit_price?: number | string;
  [key: string]: unknown;
}

/**
 * Recalculate line_total = qty × unit_price for each item.
 */
export function normalizeLineItems<T extends NormalisableItem>(items: T[]): (T & { quantity: number; unit_price: number; line_total: number })[] {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const q = Number(item.quantity) || 0;
    const u = Number(item.unit_price) || 0;
    return { ...item, quantity: q, unit_price: u, line_total: q * u };
  });
}

// ─── Currency formatting ───────────────────────────────────────────────────────

export function fmtCurrency(n: number | string): string {
  const val = Number(n) || 0;
  return `$ ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Estimation quantity helper ────────────────────────────────────────────────

/**
 * Extract the correct quantity from a custom part, handling bulk pricing.
 * For bulk_order_variable_price parts, quantity comes from pricing_tiers[0].
 * This mirrors backend buildEstimateLineItems logic.
 */
export function getPartQuantity(part: {
  quantity?: number | string;
  bulk_order_variable_price?: boolean;
  pricing_tiers?: { quantity?: number | string }[];
}): number {
  if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
    return Number(part.pricing_tiers[0].quantity) || Number(part.quantity) || 0;
  }
  return Number(part.quantity) || 0;
}

/**
 * Extract the correct unit price from a custom part, handling bulk pricing.
 */
export function getPartUnitPrice(part: {
  job_cost_per_unit?: number | string;
  bulk_order_variable_price?: boolean;
  pricing_tiers?: { unit_price?: number | string }[];
}): number {
  if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
    return Number(part.pricing_tiers[0].unit_price) || Number(part.job_cost_per_unit) || 0;
  }
  return Number(part.job_cost_per_unit) || 0;
}

// ─── Standardized Description Builder ──────────────────────────────────────────

interface PartDataForDescription {
  job_description?: string;
  part_name?: string;
  material?: string;
  material_category?: string;
  material_grade?: string;
  condition?: string;
  raw_material_dimension?: string;
  dimensions?: string | Record<string, unknown>;
  drawing_part_no?: string;
  part_number?: string;
  drawing_revision?: string;
}

interface DescriptionResult {
  description: string;
  drawingDisplay: string;
}

/**
 * Build a standardized description string for UI display and PDFs.
 * 
 * FORMAT: Part Name | Material Category | Material Grade | Condition | Dimensions
 * 
 * Drawing Number is returned SEPARATELY and should be displayed below the description.
 */
export function buildDescription(partData: PartDataForDescription): DescriptionResult {
  if (!partData) return { description: '-', drawingDisplay: '' };

  // Extract Part Name (priority: job_description > part_name)
  const partName = partData.job_description || partData.part_name || '';

  // Extract Material Category (priority: material > material_category)
  const materialCategory = partData.material || partData.material_category || '';

  // Extract Material Grade
  const materialGrade = partData.material_grade || '';

  // Extract Condition
  const condition = partData.condition || '';

  // Extract Dimensions (use raw_material_dimension if available, otherwise format dimensions object)
  let dimensions = '';
  if (partData.raw_material_dimension && typeof partData.raw_material_dimension === 'string') {
    dimensions = partData.raw_material_dimension.trim();
  } else if (partData.dimensions) {
    if (typeof partData.dimensions === 'string') {
      dimensions = partData.dimensions.trim();
    } else if (typeof partData.dimensions === 'object') {
      // Format dimensions object: { length, width, height, diameter, unit, ... }
      const dim = partData.dimensions as Record<string, unknown>;
      const parts: string[] = [];
      if (dim.diameter) {
        parts.push(`Ø${dim.diameter}`);
        if (dim.height || dim.length) {
          parts.push(String(dim.height || dim.length));
        }
      } else {
        if (dim.length) parts.push(String(dim.length));
        if (dim.width) parts.push(String(dim.width));
        if (dim.height) parts.push(String(dim.height));
      }
      if (parts.length > 0) {
        const unit = (dim.unit || dim.unit_system || '') as string;
        // Format: "L x W x H mm" or "L x W x H" with unit suffix
        dimensions = parts.join(' x ');
        if (unit) {
          // Normalize unit display
          const unitDisplay = unit.toLowerCase() === 'imperial' ? '"' : 
                              unit.toLowerCase() === 'metric' ? 'mm' : unit;
          if (unitDisplay === '"') {
            // For inches, add " after each dimension
            dimensions = parts.map(p => `${p}"`).join(' x ');
          } else if (unitDisplay) {
            dimensions = `${dimensions} ${unitDisplay}`;
          }
        }
      }
    }
  }

  // Build description parts (only include non-empty values)
  const descParts = [partName, materialCategory, materialGrade, condition, dimensions]
    .filter(part => part && part.trim());

  // Join with " | " separator
  const description = descParts.length > 0 ? descParts.join(' | ') : '-';

  // Build drawing display (separate from description)
  let drawingDisplay = '';
  const drawingNo = partData.drawing_part_no || partData.part_number || '';
  const drawingRev = partData.drawing_revision || '';
  if (drawingNo) {
    drawingDisplay = `Drawing / Part No: ${drawingNo}${drawingRev ? ' - ' + drawingRev : ''}`;
  }

  return { description, drawingDisplay };
}
