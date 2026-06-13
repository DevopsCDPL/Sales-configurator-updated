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

  /* CR-18..CR-24 — design-driven provisions (NEC-grounded, intake-gated).
   * namePattern = extra regex AND-filter on candidate name; minAmpsFromFacts
   * = parse a rating out of the name and require it ≥ the named fact (main
   * bus amps), preferring the smallest adequate part. All gated on intake
   * fields that default to off, so existing boards regenerate identically. */
  { ruleId: 'CR-18', group: 'Provisions', description: 'Surge protective device — switchboard class (NEC 230.67 / spec)', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'SPD', match: '', namePattern: 'Switchboard', when: { spdRequired: 'switchboard' } },
  { ruleId: 'CR-19', group: 'Provisions', description: 'Surge protective device — panelboard class (NEC 230.67 / spec)', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'SPD', match: '', namePattern: 'Panelboard', when: { spdRequired: 'panelboard' } },
  { ruleId: 'CR-20', group: 'Provisions', description: 'Metering CT — one per phase', qtyPer: 'board', qtyFactor: 3, catalogCategory: 'CURRENT TRANSFORMER', match: '', minAmpsFromFacts: 'mainAmps', ampsPattern: 'CT,(\\d+):', when: { meteringScheme: ['ct', 'ct_pt', 'full'] } },
  { ruleId: 'CR-21', group: 'Provisions', description: 'Potential transformer — open-delta pair', qtyPer: 'board', qtyFactor: 2, catalogCategory: 'VOLTAGE TRANSFORMER', match: '', namePattern: 'POTENTIAL|PT|468', when: { meteringScheme: ['ct_pt', 'full'] } },
  { ruleId: 'CR-22', group: 'Provisions', description: 'Control power transformer', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'VOLTAGE TRANSFORMER', match: '', namePattern: 'CPT', when: { controlPower: true } },
  { ruleId: 'CR-23a', group: 'Provisions', description: 'Camlock load-bank tap — connectors (3Ø + N + G per set)', qtyPer: 'camlockSets', qtyFactor: 5, catalogCategory: 'CAMLOCK', match: '', namePattern: 'MALE.*STUD', when: { loadBankTap: true } },
  { ruleId: 'CR-23b', group: 'Provisions', description: 'Camlock panel (load-bank tap) — mounting panel', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'CAMLOCK', match: '', namePattern: 'CAMLOCK PANEL', when: { loadBankTap: true } },
  { ruleId: 'CR-24', group: 'Provisions', description: 'Automatic transfer switch — sized to main', qtyPer: 'board', qtyFactor: 1, catalogCategory: 'ATS', match: '', minAmpsFromFacts: 'mainAmps', ampsPattern: '(\\d+)A ATS', when: { atsProvision: true } },
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
  } else {
    // Self-heal: append any seed rules the stored set is missing (e.g. the
    // CR-18..CR-24 provisions added in this version) without disturbing user
    // edits to existing rules. New seed rules are intake-gated and default
    // off, so this is non-regressive for boards that don't set those fields.
    const stored = Array.isArray(row.rows) ? row.rows : [];
    const haveIds = new Set(stored.map((r) => r.ruleId));
    const additions = SEED_RULES.filter((r) => !haveIds.has(r.ruleId));
    if (additions.length) {
      const merged = [...stored, ...additions];
      const created = await models.ConfiguratorEngineeringStandard.create({
        table_key: 'component_rules', version: (Number(row.version) || 1) + 1,
        rows: merged, notes: `Auto-healed [SEED] — appended ${additions.map((a) => a.ruleId).join(', ')}`,
        is_current: true,
      }).catch(() => null);
      if (created) {
        await models.ConfiguratorEngineeringStandard.update(
          { is_current: false },
          { where: { table_key: 'component_rules', id: { [Op.ne]: created.id } } }
        ).catch(() => {});
        row = created;
      }
    }
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

  // Design-driven provisions — read from the same opaque intake JSON the
  // intake screen persists. Defensive defaults (absent -> off / none) so an
  // existing board with no provisions data regenerates byte-identically.
  const intake = board.intake || {};
  facts.mainAmps = Number(board.board_data?.mainBusRating) || 0;
  facts.spdRequired = intake.spdRequired ?? 'none';      // none | switchboard | panelboard
  facts.meteringScheme = intake.meteringScheme ?? 'none'; // none | ct | ct_pt | full
  // CPT implied when explicitly requested OR full metering OR any drawout main.
  facts.controlPower = !!intake.controlPowerNeeded || facts.meteringScheme === 'full' || facts.hasDrawout;
  facts.loadBankTap = (intake.loadBankTap ?? 'none') === 'camlock';
  facts.camlockSets = facts.loadBankTap ? Math.max(1, Number(intake.camlockSets) || 1) : 0;
  facts.atsProvision = !!intake.atsProvision;

  const rules = await getRules();
  const existing = new Map(
    lines.filter((l) => l.source === 'rule' && l.meta?.ruleId).map((l) => [l.meta.ruleId, l])
  );

  const out = { created: 0, updated: 0, removed: 0, placeholders: 0, kept: 0 };
  const activeRuleIds = new Set();

  for (const rule of rules) {
    // condition check — a `when` key matches when the corresponding fact
    // equals the value, or (for array values) is a member of it. Unknown keys
    // are compared generically so future conditions need no engine change.
    const w = rule.when || {};
    let gated = false;
    for (const [key, want] of Object.entries(w)) {
      const have = facts[key];
      const ok = Array.isArray(want) ? want.includes(have) : have === want;
      if (!ok) { gated = true; break; }
    }
    if (gated) continue;

    const basis = { board: 1, section: facts.sections, device: facts.devices, drawout: facts.drawout, joint: facts.joints, camlockSets: facts.camlockSets }[rule.qtyPer] ?? 1;
    const qty = Math.max(0, Math.round(basis * (Number(rule.qtyFactor) || 1)));
    if (qty === 0) continue;
    activeRuleIds.add(rule.ruleId);

    // Provenance rank: TPS-negotiated parts first (policy 2026-06-13), then rfq, manual, web.
    const SRC_RANK = { 'vendor-import': 0, rfq: 1, manual: 2, web: 3 };
    const srcRank = (c) => SRC_RANK[(c.specifications || {}).priceSource] ?? 4;
    // catalog match: cheapest priced in category (name regex preferred), else any
    const where = { category: rule.catalogCategory };
    let candidates = await models.ConfiguratorComponent.findAll({ where, limit: 200 });
    if (rule.match) {
      const re = new RegExp(rule.match, 'i');
      const filtered = candidates.filter((c) => re.test(c.name || '') || re.test(c.part_number || ''));
      if (filtered.length) candidates = filtered;
    }
    // namePattern: optional AND-filter (e.g. SPD class, camlock type). Applied
    // only when it leaves at least one candidate, so an under-stocked catalog
    // still yields a (less specific) pick rather than a forced placeholder.
    if (rule.namePattern) {
      const np = new RegExp(rule.namePattern, 'i');
      const filtered = candidates.filter((c) => np.test(c.name || '') || np.test(c.part_number || ''));
      if (filtered.length) candidates = filtered;
    }
    // minAmpsFromFacts: parse an amp rating out of the name (ampsPattern, first
    // capture group) and require it >= the named fact, preferring the smallest
    // adequate part (ties broken by price). When no adequate part is parseable
    // we fall through to the cheapest-in-category sort below.
    const need = rule.minAmpsFromFacts ? (Number(facts[rule.minAmpsFromFacts]) || 0) : 0;
    if (need > 0) {
      const ampRe = new RegExp(rule.ampsPattern || '(\\d+)', 'i');
      const ampsOf = (c) => {
        const m = ampRe.exec(c.name || '') || ampRe.exec(c.part_number || '');
        return m ? Number(m[1]) : NaN;
      };
      const adequate = candidates.filter((c) => { const a = ampsOf(c); return Number.isFinite(a) && a >= need; });
      if (adequate.length) {
        adequate.sort((a, b) => srcRank(a) - srcRank(b) || (ampsOf(a) - ampsOf(b)) || ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)));
        candidates = adequate;
      } else {
        candidates.sort((a, b) => srcRank(a) - srcRank(b) || ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)));
      }
    } else {
      candidates.sort((a, b) => srcRank(a) - srcRank(b) || ((Number(a.price) || Infinity) - (Number(b.price) || Infinity)));
    }
    const pick = candidates[0] ?? null;

    const prev = existing.get(rule.ruleId);
    if (prev) {
      // engineer's swap/qty edits win; refresh qty only if untouched
      const patch = {};
      if (!prev.meta?.qtyEdited && Number(prev.quantity) !== qty) patch.quantity = qty;
      // RE-MATCH: a line that is still a placeholder (no real catalog part) and was
      // NOT engineer-swapped gets upgraded to a real component if the catalog now
      // has a match. This fixes placeholders created when the catalog was empty —
      // they previously stayed "NO CATALOG MATCH" forever across regenerations.
      const wasPlaceholder = prev.meta?.placeholder || !prev.component_id;
      if (wasPlaceholder && !prev.meta?.swapped && pick) {
        patch.component_id = pick.id;
        patch.part_number = pick.part_number ?? null;
        patch.name = pick.name || pick.part_number || prev.name;
        patch.unit_cost = Number(pick.price) || 0;
        patch.price_status = Number(pick.price) > 0 ? 'FIRM' : 'PENDING_RFQ';
        patch.meta = {
          ...(prev.meta || {}),
          placeholder: false,
          priceSource: pick.specifications?.priceSource ?? null,
        };
        out.rematched = (out.rematched || 0) + 1;
      }
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
        priceSource: pick?.specifications?.priceSource ?? null,
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
