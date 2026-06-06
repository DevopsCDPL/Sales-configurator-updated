'use strict';

/**
 * labourEngine.js — pure functions, no I/O.
 *
 * The Python `quotation_calc.py` rolls labour up section-by-section
 * inside `compute_quote`. This module provides standalone helpers so
 * the labour calculation can be reused independently of pricing
 * (e.g. for the per-step labour preview in the configurator UI).
 *
 * It is mathematically identical to the labour block of `pricingEngine`
 * — same categories, same `hours = hours_per_unit * qty` formula, same
 * `cost = hours * rate` formula.
 */

const { LABOR_CATEGORIES } = require('./pricingEngine');

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Aggregate labour-hours per category from a flat BOM-row list.
 *
 * Each row may carry `lbr_cu`, `lbr_asm`, … `lbr_cad` properties (the
 * configurator component-master columns) plus `quantity`. A row with
 * `quantity=2, lbr_cu=0.5` contributes 1 hour to `cu`.
 *
 * Returns:
 *   {
 *     hours: { CU, ASM, CNT, QC, TST, ENG, CAD },   // floats
 *     totals: { hours_total }
 *   }
 */
function aggregateHoursFromBomRows(rows) {
  const hours = Object.fromEntries(LABOR_CATEGORIES.map((c) => [c, 0]));
  for (const row of rows || []) {
    const qty = num(row.quantity, 1);
    for (const cat of LABOR_CATEGORIES) {
      const colKey = `lbr_${cat.toLowerCase()}`;
      hours[cat] += num(row[colKey], 0) * qty;
    }
  }
  const hours_total = LABOR_CATEGORIES.reduce((acc, c) => acc + hours[c], 0);
  return { hours, totals: { hours_total } };
}

/**
 * Apply the LookupRates to an hours-per-category bag and return cost
 * per category plus the grand total. Symmetric with the labour block
 * inside Python `compute_quote`.
 */
function costFromHours(hours, lookup) {
  const result = { hours: {}, costs: {}, rates: {} };
  let costTotal = 0;
  let hoursTotal = 0;
  for (const cat of LABOR_CATEGORIES) {
    const h = num(hours[cat], 0);
    const rate = num(lookup[`LBR_${cat}_rate`], 0);
    const cost = h * rate;
    result.hours[cat] = h;
    result.costs[cat] = cost;
    result.rates[cat] = rate;
    hoursTotal += h;
    costTotal += cost;
  }
  result.totals = { hours_total: hoursTotal, cost_total: costTotal };
  return result;
}

/**
 * One-shot: BOM rows + LookupRates → labour costs.
 * Equivalent to `costFromHours(aggregateHoursFromBomRows(rows).hours, lookup)`.
 */
function computeLabour(rows, lookup) {
  const { hours } = aggregateHoursFromBomRows(rows);
  return costFromHours(hours, lookup);
}

module.exports = {
  LABOR_CATEGORIES,
  aggregateHoursFromBomRows,
  costFromHours,
  computeLabour,
};
