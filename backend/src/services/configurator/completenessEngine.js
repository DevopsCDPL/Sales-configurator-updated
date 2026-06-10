'use strict';

/**
 * completenessEngine.js — Phase A spec §4.1 (BOM Completeness Engine)
 *
 * Pure evaluation over a switchboard envelope:
 *   "not even a single item should be missed" — quotation ISSUE is
 *   blocked until every REQUIRED rule passes or is explicitly waived
 *   with a logged reason.
 *
 * Rules come from configurator_completeness_rules (board_type match or
 * '*'). Evaluation context: { board, sections, lines, laborTotalHours }.
 */

/**
 * @param {Array}  rules     active rule rows (plain objects)
 * @param {Object} envelope  { boardType, sections:[{sectionIndex, role}],
 *                             lines:[{category, scope, sectionIndex, quantity}],
 *                             laborTotalHours, waivers:[{ruleId, reason, by}] }
 * @returns {{ pass:boolean, blockers:Array, warnings:Array, checklist:Array }}
 */
function evaluateCompleteness(rules, envelope) {
  const { boardType = '*', sections = [], lines = [], laborTotalHours = 0, waivers = [] } = envelope;
  const applicable = rules.filter(
    (r) => r.active !== false && (r.board_type === '*' || r.board_type === boardType)
  );
  const waivedIds = new Set(waivers.filter((w) => w.reason).map((w) => String(w.ruleId)));

  const checklist = [];
  const blockers = [];
  const warnings = [];

  const hasCategory = (cat, sectionIndex = null) =>
    lines.some(
      (l) =>
        (l.category || '').toUpperCase() === cat.toUpperCase() &&
        Number(l.quantity) > 0 &&
        (sectionIndex == null || (l.scope === 'section' && l.sectionIndex === sectionIndex))
    );

  for (const rule of applicable) {
    if (rule.requirement === 'OPTIONAL') continue;

    let satisfied = true;
    let detail = '';
    const cat = rule.category.toUpperCase();

    if (cat === 'LABOR') {
      satisfied = laborTotalHours > 0;
      detail = `labour total = ${laborTotalHours} h`;
    } else if (cat === 'CIRCUIT BREAKER') {
      // "at least one MAIN device" — interpret per seeded rule semantics
      const hasMain = sections.some((s) => (s.role || '').toUpperCase() === 'MAIN');
      const hasMainDevice = lines.some(
        (l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER' && Number(l.quantity) > 0
      );
      satisfied = hasMain && hasMainDevice;
      detail = hasMain ? (hasMainDevice ? 'ok' : 'no breaker lines') : 'no MAIN section';
    } else if (rule.applies_per === 'per_section') {
      const realSections = sections.filter((s) => (s.role || '').toUpperCase() !== 'BLANK');
      const missing = realSections.filter((s) => !hasCategory(cat, s.sectionIndex));
      satisfied = missing.length === 0;
      detail = satisfied ? 'ok' : `missing in section(s) ${missing.map((s) => s.sectionIndex).join(', ')}`;
    } else {
      satisfied = hasCategory(cat);
      detail = satisfied ? 'ok' : 'no line present';
    }

    const waived = !satisfied && waivedIds.has(String(rule.id));
    const item = {
      ruleId: rule.id,
      category: rule.category,
      message: rule.message,
      severity: rule.severity,
      satisfied,
      waived,
      detail,
    };
    checklist.push(item);

    if (!satisfied && !waived) {
      if (rule.severity === 'BLOCK') blockers.push(item);
      else warnings.push(item);
    }
  }

  return { pass: blockers.length === 0, blockers, warnings, checklist };
}

module.exports = { evaluateCompleteness };
