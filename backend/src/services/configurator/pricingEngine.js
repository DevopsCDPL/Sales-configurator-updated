'use strict';

/**
 * pricingEngine.js — pure functions, no I/O, no DB.
 *
 * Direct port of `config/backend/app/services/quotation_calc.py`
 * (CALC_VERSION 1.1.0). Numerical results MUST match the Python
 * implementation operator-for-operator so the new Forge backend
 * produces identical quotes to the legacy configurator.
 *
 * Inputs / outputs mirror the Pydantic models in
 * `config/backend/app/schemas/quotation_calc.py` (see LABOR_CATEGORIES).
 */

const CALC_VERSION = '1.1.0';

/** Order matters — matches Python LABOR_CATEGORIES list. */
const LABOR_CATEGORIES = ['CU', 'ASM', 'CNT', 'QC', 'TST', 'ENG', 'CAD'];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Excel-style ROUNDUP. Mirrors the Python helper exactly:
 *   factor < 0  → round UP to the nearest 10**abs(factor)
 *   factor >= 0 → ceil(value * 10**factor) / 10**factor   (decimal shift)
 */
function roundup(value, factor) {
  if (factor < 0) {
    const base = Math.pow(10, Math.abs(factor));
    return Math.ceil(value / base) * base;
  }
  const base = Math.pow(10, factor);
  return Math.ceil(value * base) / base;
}

/**
 * Add `businessDays` skipping weekends and the optional holidays Set.
 * Matches the Python `business_day_add` helper.
 *
 * @param {Date} start
 * @param {number} businessDays
 * @param {Set<string>} [holidaySet]  ISO `YYYY-MM-DD` strings
 * @returns {Date}
 */
function businessDayAdd(start, businessDays, holidaySet) {
  if (!businessDays || businessDays <= 0) return new Date(start.getTime());
  const holidays = holidaySet || new Set();
  const current = new Date(start.getTime());
  let added = 0;
  while (added < businessDays) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dow = current.getUTCDay(); // 0=Sun .. 6=Sat
    if (dow === 0 || dow === 6) continue;
    const iso = current.toISOString().slice(0, 10);
    if (holidays.has(iso)) continue;
    added += 1;
  }
  return current;
}

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ── Sub-engines (pure — exposed for testability) ───────────────────────────

/**
 * Compute the per-section material/labour/copper breakdown.
 * Mirrors the per-section loop inside Python `compute_quote`.
 */
function computeSectionBreakdown(sections, lookup) {
  const sectionBreakdowns = [];
  const labourCosts = Object.fromEntries(LABOR_CATEGORIES.map((c) => [c, 0]));
  const labourHours = Object.fromEntries(LABOR_CATEGORIES.map((c) => [c, 0]));
  let materialTotal = 0;
  let sectionCostTotal = 0;
  let copperTotal = 0;

  for (const sec of sections) {
    const qty = num(sec.qty, 0);
    const unitMaterial = num(sec.unit_material_cost, 0);
    const matTotal = unitMaterial * qty;
    materialTotal += matTotal;

    const copper = num(sec.copper_weight_per_unit, 0) * qty;
    copperTotal += copper;

    const perCat = {};
    let labourSumCost = 0;
    const hpu = sec.labor_hours_per_unit || {};
    for (const cat of LABOR_CATEGORIES) {
      const hoursPerUnit = num(hpu[cat], 0);
      const hours = hoursPerUnit * qty;
      const rate = num(lookup[`LBR_${cat}_rate`], 0);
      const cost = hours * rate;
      perCat[cat] = { hours, cost, rate };
      labourCosts[cat] += cost;
      labourHours[cat] += hours;
      labourSumCost += cost;
    }

    const sectionTotal = matTotal + labourSumCost;
    sectionCostTotal += sectionTotal;

    sectionBreakdowns.push({
      id: sec.id,
      description: sec.description || '',
      qty,
      material_total: matTotal,
      labor: perCat,
      section_total: sectionTotal,
      copper_total: copper,
    });
  }

  return {
    section_breakdown: sectionBreakdowns,
    labor_costs: labourCosts,
    labor_hours: labourHours,
    material_total: materialTotal,
    section_cost_total: sectionCostTotal,
    copper_total: copperTotal,
  };
}

/**
 * Group cross-section line-item adders by `desc`.
 * Mirrors the Python adders_grouped + total_line_adders block.
 */
function aggregateAdders(sections) {
  const map = new Map();
  for (const sec of sections) {
    for (const li of sec.line_items || []) {
      const desc = String(li.desc || '');
      map.set(desc, num(map.get(desc), 0) + num(li.value, 0));
    }
  }
  // sort keys ascending — Python uses sorted(adders_map.items())
  const grouped = Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([desc, total]) => ({ desc, total }));
  const totalLineAdders = grouped.reduce((acc, a) => acc + a.total, 0);
  return { adders_grouped: grouped, total_line_adders: totalLineAdders };
}

/**
 * Compute target / rounded price + actual gross-margin.
 * Mirrors the pricing block at the bottom of Python `compute_quote`.
 */
function computePricing({ totalCost, pricing }) {
  const strategy = pricing.strategy || 'DESIRED GM%';
  let targetPrice;
  if (strategy === 'DESIRED GM%') {
    const gm = num(pricing.desired_gm_pct, 0);
    if (gm >= 1) {
      throw new Error('desired_gm_pct must be < 1 (i.e. 0.30 not 30)');
    }
    targetPrice = totalCost / (1 - gm);
  } else {
    targetPrice = num(pricing.desired_price, totalCost);
  }
  const roundupFactor = Number.isInteger(pricing.roundup_factor)
    ? pricing.roundup_factor
    : -1;
  const roundedPrice = roundup(targetPrice, roundupFactor);
  const actualProfit = roundedPrice - totalCost;
  const actualGm = roundedPrice ? actualProfit / roundedPrice : 0;
  return {
    target_price: targetPrice,
    rounded_price: roundedPrice,
    actual_profit: actualProfit,
    actual_gm: actualGm,
    roundup_factor: roundupFactor,
  };
}

/**
 * Compute the dependent schedule dates.
 * Mirrors the schedule block of Python `compute_quote`.
 */
function computeSchedule(schedule, holidays = []) {
  const now = new Date();
  const orderDate = schedule.order_date
    ? new Date(schedule.order_date)
    : new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const holidaySet = new Set((holidays || []).map((d) => String(d).slice(0, 10)));

  const weeksToBd = (weeks) => weeks * 5;

  const longLeadSubDate = schedule.long_lead_sub_weeks
    ? businessDayAdd(orderDate, weeksToBd(schedule.long_lead_sub_weeks), holidaySet)
    : null;
  const engSubDate = schedule.eng_sub_weeks
    ? businessDayAdd(orderDate, weeksToBd(schedule.eng_sub_weeks), holidaySet)
    : null;
  const releaseDate = engSubDate && schedule.sub_approve_weeks
    ? businessDayAdd(engSubDate, weeksToBd(schedule.sub_approve_weeks), holidaySet)
    : engSubDate;

  const totalRtsWeeks = num(schedule.lead_time_weeks, 0) + num(schedule.mfg_time_weeks, 0);
  const rtsDate = releaseDate && totalRtsWeeks
    ? businessDayAdd(releaseDate, weeksToBd(totalRtsWeeks), holidaySet)
    : releaseDate;

  const longLeadApproveDate = schedule.long_lead_approve_weeks
    ? businessDayAdd(orderDate, weeksToBd(schedule.long_lead_approve_weeks), holidaySet)
    : null;

  return {
    order_date: orderDate.toISOString(),
    long_lead_sub_date: longLeadSubDate ? longLeadSubDate.toISOString() : null,
    long_lead_approve_date: longLeadApproveDate ? longLeadApproveDate.toISOString() : null,
    eng_sub_date: engSubDate ? engSubDate.toISOString() : null,
    release_date: releaseDate ? releaseDate.toISOString() : null,
    rts_date: rtsDate ? rtsDate.toISOString() : null,
  };
}

// ── Top-level entry ────────────────────────────────────────────────────────

/**
 * Compute a full quote — direct port of Python `compute_quote(QuoteInput)`.
 *
 * Input shape (verbatim from Pydantic schema):
 *   {
 *     sections: SectionInput[],
 *     lookup:   LookupRates,
 *     pricing:  PricingStrategy,
 *     schedule: ScheduleInput,
 *     holidays?: string[]   // ISO YYYY-MM-DD
 *   }
 *
 * Output shape mirrors `QuoteComputationResult`.
 *
 * Determinism contract: given identical inputs, output MUST equal the
 * Python implementation to the float-precision limit. No rounding is
 * introduced beyond the final `roundup(targetPrice, …)` call.
 */
function computeQuote(data) {
  if (!data || !Array.isArray(data.sections)) {
    throw new Error('computeQuote: data.sections must be an array');
  }
  if (!data.lookup) throw new Error('computeQuote: data.lookup is required');
  if (!data.pricing) throw new Error('computeQuote: data.pricing is required');

  const generatedAt = new Date().toISOString();

  const breakdown = computeSectionBreakdown(data.sections, data.lookup);
  const adders = aggregateAdders(data.sections);

  // Overhead / copper enhancements (optional, piggyback on lookup)
  const overheadPct = num(data.lookup.OVERHEAD_PCT, 0);
  const copperRate = num(data.lookup.COPPER_RATE_PER_LB, 0);
  const copperCost = breakdown.copper_total * copperRate;
  const baseCost = breakdown.section_cost_total + adders.total_line_adders;
  const overheadAmount = baseCost * overheadPct;
  const totalCost = baseCost + overheadAmount + copperCost;

  const pricing = computePricing({ totalCost, pricing: data.pricing });
  const schedule = computeSchedule(data.schedule || {}, data.holidays || []);

  return {
    generated_at: generatedAt,
    calc_version: CALC_VERSION,
    section_breakdown: breakdown.section_breakdown,
    totals: {
      material_total: breakdown.material_total,
      section_cost_total: breakdown.section_cost_total,
      overhead_amount: overheadAmount,
      copper_cost: copperCost,
    },
    labor_costs: breakdown.labor_costs,
    labor_hours: breakdown.labor_hours,
    adders_grouped: adders.adders_grouped,
    total_line_adders: adders.total_line_adders,
    total_cost: totalCost,
    pricing,
    schedule,
    copper_total: breakdown.copper_total,
  };
}

module.exports = {
  CALC_VERSION,
  LABOR_CATEGORIES,
  roundup,
  businessDayAdd,
  computeSectionBreakdown,
  aggregateAdders,
  computePricing,
  computeSchedule,
  computeQuote,
};
