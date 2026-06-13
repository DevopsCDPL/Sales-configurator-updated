'use strict';

/**
 * lineMarginEngine.js — pure functions, no I/O, no DB.
 *
 * Per-component / per-line margin + labour-adjustment layer that sits ON
 * TOP of the parity-proven pricingEngine (CALC_VERSION 1.1.0, never
 * modified). The cost build-up (material + labour + overhead + copper)
 * still flows exclusively through pricingEngine.computeQuote — this module
 * only re-derives the SELL price when individual lines carry their own
 * margin, and pools the global GM% over everything else.
 *
 * GM is TRUE MARGIN throughout:  sell = cost / (1 − GM).
 *
 * Determinism contract: when NO line carries a margin the blended target
 * collapses to total_cost / (1 − globalGM) — bit-identical to the legacy
 * single-GM path (see calc-validation.js case "blended == legacy").
 */

const { LABOR_CATEGORIES, roundup } = require('./pricingEngine');

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Resolve a line's effective margin fraction (0–1) or null (= inherit
 * the global pooled GM). Precedence per spec §3:
 *   1. meta.marginPctOverride   (line-level, set in Quotation page)
 *   2. component specifications.marginPct  (catalog default)
 *   3. null  → pooled under the global GM
 *
 * Both override sources are stored as PERCENT (0–90); we divide by 100.
 * margin === 0 is a VALID explicit margin (sell == cost), NOT inherit.
 */
function resolveLineMargin(line) {
  const ov = line?.meta?.marginPctOverride;
  if (ov != null && ov !== '' && Number.isFinite(Number(ov))) {
    return clampMargin(Number(ov) / 100);
  }
  const spec = line?.specifications?.marginPct ?? line?.component_marginPct;
  if (spec != null && spec !== '' && Number.isFinite(Number(spec))) {
    return clampMargin(Number(spec) / 100);
  }
  return null;
}

/** Clamp to [0, 0.90] — mirrors the UI's 0–90% input range and keeps the
 *  cost/(1−m) divisor strictly positive. */
function clampMargin(m) {
  if (!Number.isFinite(m)) return null;
  if (m < 0) return 0;
  if (m > 0.9) return 0.9;
  return m;
}

/**
 * Labour hours for a single BOM row, applying the per-line labourAdj
 * deltas (hours, signed) from meta.labourAdj. Keys may be lower
 * ('lbr_asm') or bucket ('ASM'); both resolve to the canonical category.
 */
function lineLabourHours(row) {
  const qty = num(row.quantity, 1);
  const hours = {};
  for (const cat of LABOR_CATEGORIES) {
    const colKey = `lbr_${cat.toLowerCase()}`;
    hours[cat] = num(row[colKey], 0) * qty;
  }
  const adj = row?.meta?.labourAdj || {};
  for (const [k, v] of Object.entries(adj)) {
    const cat = String(k).replace(/^lbr_/i, '').toUpperCase();
    if (LABOR_CATEGORIES.includes(cat)) hours[cat] += num(Number(v), 0);
  }
  return hours;
}

/** Labour COST for a row's hours bag against the rate lookup. */
function lineLabourCost(hours, lookup) {
  let cost = 0;
  let total = 0;
  for (const cat of LABOR_CATEGORIES) {
    const h = num(hours[cat], 0);
    cost += h * num(lookup[`LBR_${cat}_rate`], 0);
    total += h;
  }
  return { cost, hours: total };
}

/**
 * Pre-overhead COST of one BOM row = material + labour(incl. adj).
 *   material = unit_material_cost × qty   (copper rows carry unit_cost as
 *              material via unit_material_cost mirror upstream).
 */
function lineBaseCost(row, lookup) {
  const qty = num(row.quantity, 1);
  const material = num(row.unit_material_cost, num(row.unit_cost, 0)) * qty;
  const { cost: labour, hours } = lineLabourCost(lineLabourHours(row), lookup);
  return { material, labour, cost: material + labour, hours };
}

/**
 * Blended pricing across per-line margins + a pooled global GM.
 *
 * @param {Array}  rows     BOM rows (carry unit_material_cost|unit_cost,
 *                          quantity, lbr_*, meta{marginPctOverride,labourAdj},
 *                          specifications{marginPct})
 * @param {Object} lookup   rate lookup (LBR_*_rate, OVERHEAD_PCT)
 * @param {Object} pricing  { desired_gm_pct (0–1), roundup_factor }
 * @param {Object} engineTotals  { total_cost } from pricingEngine.computeQuote
 *                          — the authoritative cost incl. overhead+copper.
 *
 * Method: every line's pre-overhead cost is scaled by the SAME overhead
 * factor (total_cost / Σ lineCost) so per-line costs sum EXACTLY to the
 * engine's total_cost (copper rows included — they have 0 labour and
 * their material == unit_cost). Lines WITH a margin sell at cost/(1−m);
 * the pooled remainder sells at pooledCost/(1−globalGM). targetPrice is
 * the sum; roundup applied once at the end (same as legacy).
 */
function computeBlendedPricing(rows, lookup, pricing, engineTotals) {
  const globalGm = clampMargin(num(pricing.desired_gm_pct, 0)) ?? 0;
  const rf = Number.isInteger(pricing.roundup_factor) ? pricing.roundup_factor : -1;

  const lineCosts = (rows || []).map((r) => ({
    row: r,
    base: lineBaseCost(r, lookup),
    margin: resolveLineMargin(r),
  }));

  const sumBase = lineCosts.reduce((a, l) => a + l.base.cost, 0);
  const totalCost = num(engineTotals?.total_cost, sumBase);
  // Overhead factor distributes overhead+copper proportionally so the
  // per-line costed-up amounts reconcile to total_cost exactly.
  const ohFactor = sumBase > 0 ? totalCost / sumBase : 1;

  let overriddenCost = 0;
  let overriddenSell = 0;
  let pooledCost = 0;
  let overriddenCount = 0;

  const lines = lineCosts.map((l) => {
    const costedUp = l.base.cost * ohFactor; // incl. proportional overhead
    if (l.margin != null) {
      const sell = l.margin >= 1 ? costedUp : costedUp / (1 - l.margin);
      overriddenCost += costedUp;
      overriddenSell += sell;
      overriddenCount += 1;
      return { ...l, costedUp, sell, pooled: false };
    }
    pooledCost += costedUp;
    return { ...l, costedUp, sell: null, pooled: true };
  });

  const pooledSell = globalGm >= 1 ? pooledCost : pooledCost / (1 - globalGm);
  const targetPrice = overriddenSell + pooledSell;
  const roundedPrice = roundup(targetPrice, rf);
  const actualProfit = roundedPrice - totalCost;
  const actualGm = roundedPrice ? actualProfit / roundedPrice : 0;

  // Fill per-line pooled sell pro-rata so the UI can show every line a sell.
  for (const l of lines) {
    if (l.pooled) l.sell = pooledCost > 0 ? pooledSell * (l.costedUp / pooledCost) : 0;
  }

  return {
    target_price: targetPrice,
    rounded_price: roundedPrice,
    actual_profit: actualProfit,
    actual_gm: actualGm,        // BLENDED effective margin
    roundup_factor: rf,
    global_gm_pct: globalGm,
    overridden_count: overriddenCount,
    overridden_cost: overriddenCost,
    overridden_sell: overriddenSell,
    pooled_cost: pooledCost,
    pooled_sell: pooledSell,
    lines: lines.map((l) => ({
      part_number: l.row.part_number ?? null,
      description: l.row.description ?? l.row.name ?? null,
      line_id: l.row.line_id ?? l.row.id ?? null,
      cost: l.base.cost,
      costed_up: l.costedUp,
      labour_hours: l.base.hours,
      margin: l.margin,            // null = inherited/pooled
      pooled: l.pooled,
      sell: l.sell,
    })),
  };
}

module.exports = {
  resolveLineMargin,
  clampMargin,
  lineLabourHours,
  lineLabourCost,
  lineBaseCost,
  computeBlendedPricing,
};
