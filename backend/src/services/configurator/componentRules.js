'use strict';

/**
 * componentRules.js — "not a single component missed" (AP registry).
 *
 * Versioned standards table `component_rules` drives auto-selection of
 * every pickable component the design implies. Rules are editable in
 * the Standards screen (qty factors = user-settable defaults). The
 * generator upserts lines (source='rule'):
 *   - cheapest priced catalog match in the rule's category, else any
 *     match, else a PLACEHOLDER line flagged NO CATALOG MATCH —
 *     visible, swappable, never silently dropped.
 *   - engineer's qty edits and swaps survive regeneration
 *     (meta.qtyEdited / meta.swapped).
 */

const { Op } = require('sequelize');
const models = require('../../models');

/** Seed rules — UL 891 switchboard build-out [SEED until TPS verifies].
 *  qtyPer basis: board | section | device | drawout | joint (sections-1). */
const SEED_RULES = [
  { ruleId: 'CR-01', group: 'Enclosure & Structure', description: 'Enclosure hardware kit (door bolts, nuts, washers)', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'bolt|hardware|nut', when: {} },
  { ruleId: 'CR-02', group: 'Enclosure & Structure', description: 'Lifting angle / eye set', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'lift', when: {} },
  { ruleId: 'CR-03', group: 'Enclosure & Structure', description: 'Base channel / floor sill', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'ENCLOSURE', match: 'channel|sill|base', when: {} },
  { ruleId: 'CR-04', group: 'Enclosure & Structure', description: 'Door gasket kit (outdoor)', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'ENCLOSURE', match: 'gasket|seal', when: { environment: 'Outdoor' } },
  { ruleId: 'CR-05', group: 'Bussing Hardware', description: 'Bus joint bolt kit (Belleville)', qtyPer: 'joint', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'belleville|joint|bolt', when: {} },
  { ruleId: 'CR-06', group: 'Bussing Hardware', description: 'Standoff insulators (extra service stock)', qtyPer: 'section', qtyFactor: 2, catalogCategory: 'GLASTIC', match: '', when: {} },
  { ruleId: 'CR-07', group: 'Terminations', description: 'Mechanical lugs — load side', qtyPer: 'device', qtyFactor: 3, catalogCategory: 'LUGS', match: '', when: {} },
  { ruleId: 'CR-08', group: 'Terminations', description: 'Ground lug kit', qtyPer: 'section', qtyFactor: 2, catalogCategory: 'LUGS', match: 'ground|gnd', when: {} },
  { ruleId: 'CR-09', group: 'Control & Wiring', description: 'Terminal block strip', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'TERMINALS', match: '', when: {} },
  { ruleId: 'CR-10', group: 'Control & Wiring', description: 'Control wire kit (per section)', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'WIRE CABLE', match: 'wire|sis', when: {} },
  { ruleId: 'CR-11', group: 'Control & Wiring', description: 'Wire duct / panduit', qtyPer: 'section', qtyFactor: 2, catalogCategory: 'CONDUIT', match: 'duct|panduit', when: {} },
  { ruleId: 'CR-12', group: 'Safety & Identification', description: 'Section nameplate (engraved)', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'STANDARD PRODUCT', match: 'nameplate|label', when: {} },
  { ruleId: 'CR-13', group: 'Safety & Identification', description: 'Phase identification markers', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'phase|marker|tape', when: {} },
  { ruleId: 'CR-14', group: 'Safety & Identification', description: 'Space heater + thermostat (outdoor)', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'CONTROLS', match: 'heater', when: { environment: 'Outdoor' } },
  { ruleId: 'CR-15', group: 'Accessories', description: 'Breaker blanking / filler plates', qtyPer: 'section', qtyFactor: 1, catalogCategory: 'ENCLOSURE', match: 'filler|blank', when: {} },
  { ruleId: 'CR-16', group: 'Accessories', description: 'Drawout racking handle', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'rack|handle', when: { hasDrawout: true } },
  { ruleId: 'CR-17', group: 'Accessories', description: 'Document pocket / drawing holder', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'HARDWARE', match: 'pocket|holder', when: {} },
].map((r) => ({ ...r, seed: true, verified: false, enabled: true }));

async function getRules() {
  let row = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: 'component_rules', is_current: true },
    order: [['version', 'DESC']],
  });
  if (!row) {
    row = await models.ConfiguratorEngineeringStandard.create({
      table_key: 'component_rules', version: 1, rows: SEED_RULES,
      notes: 'Auto-created [SEED] — edit factors/conditions here', is_current: true,
    }).catch(() => null);
  }
  return (row && Array.isArray(row.rows) ? row.rows : SEED_RULES).filter((r) => r.enabled !== false);
}

/** Generate/refresh rule-driven component lines for a board. */
async function generateComponents(switchboardId, { companyId = null } = {}) {
  const board = await models.ConfiguratorSwitchboard.findByPk(switchboardId);
  if (!board) { const e = new Error('switchboard not found'); e.status = 404; throw e; }
  const sections = await models.ConfiguratorSystemSection.count({ where: { switchboard_id: board.id } });
  if (!sections) { const e = new Error('accept a line-up first — components derive from the design'); e.status = 422; throw e; }

  const lines = await models.ConfiguratorComponentLine.findAll({ where: { switchboard_id: board.id } });
  const devices = lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER');
  const facts = {
    sections,
    devices: devices.length,
    drawout: devices.filter((d) => String(d.meta?.mounting || '').toLowerCase().includes('draw')).length,
    joints: Math.max(0, sections - 1),
    environment: board.intake?.environment ?? 'Indoor',
    serviceEntrance: !!board.service_entrance,
  };
  facts.hasDrawout = facts.drawout > 0;

  const rules = await getRules();
  const existing = new Map(
    lines.filter((l) => l.source === 'rule' && l.meta?.ruleId).map((l) => [l.meta.ruleId, l])
  );

  const out = { created: 0, updated: 0, removed: 0, placeholders: 0, kept: 0 };
  const activeRuleIds = new Set();

  for (const rule of rules) {
    // condition check
    const w = rule.when || {};
    if (w.environment && facts.environment !== w.environment) continue;
    if (w.serviceEntrance != null && facts.serviceEntrance !== w.serviceEntrance) continue;
    if (w.hasDrawout != null && facts.hasDrawout !== w.hasDrawout) continue;

    const basis = { board: 1, section: facts.sections, device: facts.devices, drawout: facts.drawout, joint: facts.joints }[rule.qtyPer] ?? 1;
    const qty = Math.max(0, Math.round(basis * (Number(rule.qtyFactor) || 1)));
    if (qty === 0) continue;
    activeRuleIds.add(rule.ruleId);

    // catalog match: cheapest priced in category (name regex preferred), else any
    const where = { category: rule.catalogCategory };
    let candidates = await models.ConfiguratorComponent.findAll({ where, limit: 200 });
    if (rule.match) {
      const re = new RegExp(rule.match, 'i');
      const filtered = candidates.filter((c) => re.test(c.name || '') || re.test(c.part_number || ''));
      if (filtered.length) candidates = filtered;
    }
    candidates.sort((a, b) => ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)));
    const pick = candidates[0] ?? null;

    const prev = existing.get(rule.ruleId);
    if (prev) {
      // engineer's swap/qty edits win; refresh qty only if untouched
      const patch = {};
      if (!prev.meta?.qtyEdited && Number(prev.quantity) !== qty) patch.quantity = qty;
      if (Object.keys(patch).length) { await prev.update(patch); out.updated += 1; } else out.kept += 1;
      continue;
    }

    await models.ConfiguratorComponentLine.create({
      switchboard_id: board.id,
      scope: 'board',
      component_id: pick?.id ?? null,
      category: rule.catalogCategory,
      part_number: pick?.part_number ?? null,
      name: pick ? (pick.name || pick.part_number) : `${rule.description} — NO CATALOG MATCH`,
      quantity: qty,
      unit_cost: pick ? (Number(pick.price) || 0) : 0,
      price_status: pick && Number(pick.price) > 0 ? 'FIRM' : 'PENDING_RFQ',
      source: 'rule',
      meta: {
        ruleId: rule.ruleId, group: rule.group, ruleDescription: rule.description,
        qtyFormula: `${rule.qtyFactor} × ${rule.qtyPer} (${basis})`,
        placeholder: !pick,
      },
      company_id: companyId,
    });
    out.created += 1;
    if (!pick) out.placeholders += 1;
  }

  // rules that no longer apply: remove untouched lines, keep edited ones flagged
  for (const [ruleId, line] of existing) {
    if (activeRuleIds.has(ruleId)) continue;
    if (line.meta?.qtyEdited || line.meta?.swapped) {
      await line.update({ meta: { ...line.meta, ruleInactive: true } });
    } else {
      await line.destroy();
      out.removed += 1;
    }
  }
  return { ...out, facts, rulesEvaluated: rules.length };
}

module.exports = { generateComponents, getRules, SEED_RULES };
