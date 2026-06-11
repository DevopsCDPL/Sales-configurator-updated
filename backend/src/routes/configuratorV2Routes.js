'use strict';

/**
 * configuratorV2Routes.js — V2 spine endpoints (Phases A–F).
 *
 * Mounted at /api/configurator-v2 behind feature flag
 * CONFIGURATOR_V2_SPINE (off ⇒ 404s, zero impact on the live app).
 *
 *   Switchboards:   GET/POST/PATCH/DELETE /switchboards*
 *   Standards:      GET/PUT /engineering-standards/:tableKey
 *   Completeness:   POST /switchboards/:id/completeness
 *   Price RFQs:     GET /price-rfqs, POST /price-rfqs/:id/receive
 *   SW queue (UI):  GET /sw-jobs, POST /sw-jobs, POST /sw-jobs/:id/cancel
 *   SW agent API:   POST /agent/next, /agent/:jobId/heartbeat,
 *                   /agent/:jobId/complete, /agent/:jobId/fail
 *   Handoff:        POST /handoff/order-confirm, GET /handoff/events
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const models = require('../models');
const { sequelize } = models;
const swJobs = require('../services/configurator/swJobsService');
const { buildSolidworksPayload } = require('../services/configurator/solidworksPayloadBuilder');
const { evaluateCompleteness } = require('../services/configurator/completenessEngine');
const handoff = require('../services/configurator/handoffService');

// Default ON in this private instance; set CONFIGURATOR_V2_SPINE=false to disable.
const FLAG = () => String(process.env.CONFIGURATOR_V2_SPINE ?? 'true').toLowerCase() !== 'false';
router.use((req, res, next) => (FLAG() ? next() : res.status(404).json({ error: 'CONFIGURATOR_V2_SPINE disabled' })));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    const code = err.code === 'PAYLOAD_INVALID' ? 422 : 500;
    res.status(code).json({ error: String(err.message || err), details: err.details });
  });

/* ─────────────── Agent API (token auth via existing middleware) ─────── */
// Agent endpoints come FIRST and use authenticate (ApiToken bearer works
// through the same middleware); they are scoped by agent id, not tenant UI.

router.post('/agent/next', authenticate, wrap(async (req, res) => {
  const { agentId, supportedVersions, jobTypes, leaseMinutes } = req.body || {};
  if (!agentId) return res.status(400).json({ error: 'agentId required' });
  const job = await swJobs.leaseNext({ agentId, supportedVersions, jobTypes, leaseMinutes });
  res.json({ job });
}));

router.post('/agent/:jobId/heartbeat', authenticate, wrap(async (req, res) => {
  const out = await swJobs.heartbeat({ jobId: req.params.jobId, agentId: req.body?.agentId, progress: req.body?.progress });
  res.json(out);
}));

router.post('/agent/:jobId/complete', authenticate, wrap(async (req, res) => {
  const out = await swJobs.complete({
    jobId: req.params.jobId,
    agentId: req.body?.agentId,
    artifacts: req.body?.artifacts ?? [],
    copper: req.body?.copper ?? null,
  });
  res.json({ ok: true, reconciliation: out.reconciliation });
}));

router.post('/agent/:jobId/fail', authenticate, wrap(async (req, res) => {
  const out = await swJobs.fail({
    jobId: req.params.jobId,
    agentId: req.body?.agentId,
    errorCode: req.body?.errorCode || 'SW_CRASH',
    errorMessage: req.body?.errorMessage || '',
  });
  res.json(out);
}));

/* ─────────────────────────── UI endpoints ───────────────────────────── */
router.use(authenticate);
router.use(tenantScope);

// Switchboards
router.get('/configurations/:configId/switchboards', wrap(async (req, res) => {
  const rows = await models.ConfiguratorSwitchboard.findAll({
    where: { configuration_id: req.params.configId },
    order: [['board_index', 'ASC']],
  });
  res.json(rows);
}));

router.post('/configurations/:configId/switchboards', wrap(async (req, res) => {
  const { name, cloneFromId } = req.body || {};
  const count = await models.ConfiguratorSwitchboard.count({ where: { configuration_id: req.params.configId } });
  let defaults = {};
  if (cloneFromId) {
    const src = await models.ConfiguratorSwitchboard.findByPk(cloneFromId);
    if (src) {
      defaults = {
        standards_regime: src.standards_regime, board_type: src.board_type,
        service_entrance: src.service_entrance, board_data: src.board_data,
        intake: src.intake, cloned_from_switchboard_id: src.id,
      };
    }
  }
  const row = await models.ConfiguratorSwitchboard.create({
    configuration_id: req.params.configId,
    board_index: count + 1,
    name: name || `Switchboard ${count + 1}`,
    company_id: req.companyId ?? null,
    ...defaults,
  });
  // Clone sections + lines when requested
  if (cloneFromId) {
    const sections = await models.ConfiguratorSystemSection.findAll({ where: { switchboard_id: cloneFromId } });
    const idMap = new Map();
    for (const s of sections) {
      const ns = await models.ConfiguratorSystemSection.create({
        configuration_id: row.configuration_id,
        switchboard_id: row.id, section_number: s.section_number,
        setup: s.setup, electrical: s.electrical, layout: s.layout, computed: s.computed,
        company_id: req.companyId ?? null,
      }).catch(() => null);
      if (ns) idMap.set(s.id, ns.id);
    }
    const lines = await models.ConfiguratorComponentLine.findAll({ where: { switchboard_id: cloneFromId } });
    for (const l of lines) {
      await models.ConfiguratorComponentLine.create({
        ...l.toJSON(), id: undefined, switchboard_id: row.id,
        section_id: l.section_id ? idMap.get(l.section_id) ?? null : null,
        created_at: undefined, updated_at: undefined,
      }).catch(() => {});
    }
  }
  res.status(201).json(row);
}));

router.patch('/switchboards/:id', wrap(async (req, res) => {
  const row = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.status === 'locked' && !req.body?.unlockReason) {
    return res.status(423).json({ error: 'switchboard locked — change order / unlock reason required' });
  }
  const allowed = ['name', 'board_type', 'standards_regime', 'service_entrance', 'board_data', 'intake', 'status'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  await row.update(patch);
  res.json(row);
}));

router.delete('/switchboards/:id', wrap(async (req, res) => {
  const row = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.status === 'locked') return res.status(423).json({ error: 'locked switchboard cannot be deleted' });
  await row.destroy();
  res.json({ ok: true });
}));

// Component lines
router.get('/switchboards/:id/lines', wrap(async (req, res) => {
  const rows = await models.ConfiguratorComponentLine.findAll({
    where: { switchboard_id: req.params.id },
    order: [['created_at', 'ASC']],
  });
  res.json(rows);
}));

router.post('/switchboards/:id/lines', wrap(async (req, res) => {
  const row = await models.ConfiguratorComponentLine.create({
    ...req.body,
    switchboard_id: req.params.id,
    company_id: req.companyId ?? null,
  });
  res.status(201).json(row);
}));

router.delete('/lines/:lineId', wrap(async (req, res) => {
  const row = await models.ConfiguratorComponentLine.findByPk(req.params.lineId);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (row.source === 'auto' && !req.body?.waiverReason) {
    return res.status(422).json({ error: 'auto-added safety/standard line requires a waiver reason to remove' });
  }
  await row.destroy();
  res.json({ ok: true, waived: row.source === 'auto' ? req.body?.waiverReason : undefined });
}));

// Engineering standards (versioned)
router.get('/engineering-standards/:tableKey', wrap(async (req, res) => {
  const row = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: req.params.tableKey, is_current: true },
    order: [['version', 'DESC']],
  });
  res.json(row);
}));

router.put('/engineering-standards/:tableKey', wrap(async (req, res) => {
  const current = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: req.params.tableKey, is_current: true },
    order: [['version', 'DESC']],
  });
  if (current) await current.update({ is_current: false });
  const row = await models.ConfiguratorEngineeringStandard.create({
    table_key: req.params.tableKey,
    version: (current?.version ?? 0) + 1,
    rows: req.body?.rows ?? [],
    notes: req.body?.notes ?? null,
    is_current: true,
    created_by: req.user?.id ?? null,
    company_id: req.companyId ?? null,
  });
  res.status(201).json(row);
}));

// Completeness check
router.post('/switchboards/:id/completeness', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  const rules = await models.ConfiguratorCompletenessRule.findAll({ where: { active: true } });
  const lines = await models.ConfiguratorComponentLine.findAll({ where: { switchboard_id: board.id } });
  const sections = await models.ConfiguratorSystemSection.findAll({ where: { switchboard_id: board.id } }).catch(() => []);
  const out = evaluateCompleteness(
    rules.map((r) => r.toJSON()),
    {
      boardType: board.board_type ?? '*',
      sections: sections.map((s) => ({ sectionIndex: s.section_number, role: s.setup?.role ?? s.setup?.sectionType })),
      lines: lines.map((l) => ({ category: l.category, scope: l.scope, sectionIndex: null, quantity: Number(l.quantity) })),
      laborTotalHours: Number(req.body?.laborTotalHours ?? 0),
      waivers: req.body?.waivers ?? [],
    }
  );
  res.json(out);
}));

// Price RFQ queue
router.get('/price-rfqs', wrap(async (req, res) => {
  const rows = await models.ConfiguratorPriceRfq.findAll({
    where: req.query.status ? { status: req.query.status } : {},
    order: [['created_at', 'DESC']],
  });
  res.json(rows);
}));

router.post('/price-rfqs/:id/receive', wrap(async (req, res) => {
  const rfq = await models.ConfiguratorPriceRfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ error: 'not found' });
  const price = Number(req.body?.price);
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'valid price required' });
  await rfq.update({ status: 'received', received_price: price, received_at: new Date() });
  await models.ConfiguratorComponent.update(
    { price, mat_cost: price, price_status: 'FIRM' },
    { where: { id: rfq.component_id } }
  );
  // Flag dependent ESTIMATED/PENDING lines for re-quote review (Phase A §4.1)
  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { component_id: rfq.component_id, price_status: ['ESTIMATED', 'PENDING_RFQ'] },
  });
  await Promise.all(lines.map((l) =>
    l.update({ meta: { ...(l.meta ?? {}), requote_review: true } })
  ));
  res.json({ ok: true, flaggedLines: lines.length });
}));

// SW jobs (UI)
router.get('/sw-jobs', wrap(async (req, res) => {
  const rows = await models.ConfiguratorSolidworksJob.findAll({
    order: [['created_at', 'DESC']], limit: 200,
    attributes: { exclude: ['payload'] },
  });
  res.json(rows);
}));

router.post('/sw-jobs', wrap(async (req, res) => {
  const { switchboardId, jobType = 'FULL', quotationId } = req.body || {};
  const payload = await buildSolidworksPayload(switchboardId, {
    estimatedCopperLbs: req.body?.estimatedCopperLbs ?? null,
    copperPricePerLb: req.body?.copperPricePerLb ?? null,
  });
  const { job, deduped } = await swJobs.enqueue({
    switchboardId, jobType, quotationId, payload,
    requestedBy: req.user?.id, companyId: req.companyId ?? null,
  });
  res.status(deduped ? 200 : 201).json({ jobId: job.id, deduped });
}));

router.post('/sw-jobs/:id/cancel', wrap(async (req, res) => {
  const job = await swJobs.cancel({ jobId: req.params.id });
  res.json({ ok: !!job, status: job?.status, cancelRequested: job?.cancel_requested });
}));

// Copper reconciliations
router.get('/copper-reconciliations', wrap(async (req, res) => {
  const rows = await models.ConfiguratorCopperReconciliation.findAll({
    where: req.query.status ? { status: req.query.status } : {},
    order: [['created_at', 'DESC']], limit: 100,
  });
  res.json(rows);
}));

router.post('/copper-reconciliations/:id/approve', wrap(async (req, res) => {
  const row = await models.ConfiguratorCopperReconciliation.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  await row.update({ status: 'approved', reviewed_by: req.user?.id ?? null, reviewed_at: new Date(), notes: req.body?.notes ?? row.notes });
  res.json(row);
}));

// ── Designer persistence (Phase: actual application) ──────────────────

// Company-wide board list (clone library for "Load Configuration")
router.get('/switchboards', wrap(async (req, res) => {
  const rows = await models.ConfiguratorSwitchboard.findAll({
    order: [['updated_at', 'DESC']],
    limit: 100,
  });
  res.json(rows);
}));

// Full board: switchboard + sections + lines in one call
router.get('/switchboards/:id/full', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  const sections = await models.ConfiguratorSystemSection.findAll({
    where: { switchboard_id: board.id },
    order: [['section_number', 'ASC']],
  });
  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { switchboard_id: board.id },
    order: [['created_at', 'ASC']],
  });
  res.json({ board, sections, lines });
}));

/**
 * Apply an accepted line-up proposal ATOMICALLY:
 *   - patch board_data + intake (+ name)
 *   - replace designer-managed sections and source='auto' lines
 *   - user-added lines (source='user') are preserved at board scope
 * Body: { intake, boardPatch:{...}, sections:[{sectionIndex, role, frame,
 *         devices:[{designation, partNumber, manufacturer, frameModel,
 *                   ratedA, poles, mounting, interruptingKA, price,
 *                   priceStatus, componentId?}], usedHeightIn, remainingHeightIn }] }
 */
router.post('/switchboards/:id/apply-proposal', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  if (board.status === 'locked') return res.status(423).json({ error: 'switchboard locked' });
  const { intake, boardPatch = {}, sections = [] } = req.body || {};

  const out = await sequelize.transaction(async (t) => {
    // 1. Board envelope
    const bd = { ...(board.board_data || {}) };
    if (boardPatch.voltageSystemCode != null) bd.voltageSystemCode = boardPatch.voltageSystemCode;
    if (boardPatch.mainBusRatingA != null) bd.mainBusRating = boardPatch.mainBusRatingA;
    if (boardPatch.sccrKA != null) bd.shortCircuitRating = boardPatch.sccrKA;
    if (boardPatch.sccrAssumed != null) bd.sccrAssumed = boardPatch.sccrAssumed;
    if (boardPatch.nemaSuggestion != null) bd.nemaType = bd.nemaType || boardPatch.nemaSuggestion;
    if (boardPatch.neutralPct != null) bd.neutralRating = boardPatch.neutralPct;
    if (boardPatch.totalFeederLoadA != null) bd.totalFeederLoadA = boardPatch.totalFeederLoadA;
    if (boardPatch.sldTopology != null) bd.sldTopology = boardPatch.sldTopology;
    await board.update(
      { board_data: bd, intake: intake ?? board.intake, status: 'complete' },
      { transaction: t }
    );

    // 2. Wipe designer-managed rows
    await models.ConfiguratorSystemSection.destroy({
      where: { switchboard_id: board.id }, transaction: t,
    });
    await models.ConfiguratorComponentLine.destroy({
      where: { switchboard_id: board.id, source: ['auto', 'builder'] }, transaction: t,
    });

    // 3. Recreate sections + device lines
    const createdSections = [];
    for (const sec of sections) {
      const row = await models.ConfiguratorSystemSection.create({
        configuration_id: board.configuration_id,
        switchboard_id: board.id,
        section_number: sec.sectionIndex,
        name: `Section ${sec.sectionIndex}`,
        setup: { role: sec.role },
        electrical: sec.electrical ?? {},
        layout: { frameCode: sec.frame?.frameCode ?? null, frame: sec.frame ?? null },
        computed: {
          usedHeightIn: sec.usedHeightIn ?? null,
          remainingHeightIn: sec.remainingHeightIn ?? null,
        },
        company_id: req.companyId ?? null,
      }, { transaction: t });
      createdSections.push(row);
      for (const d of sec.devices ?? []) {
        await models.ConfiguratorComponentLine.create({
          switchboard_id: board.id,
          scope: 'section',
          section_id: row.id,
          component_id: d.componentId && String(d.componentId).length === 36 ? d.componentId : null,
          category: 'CIRCUIT BREAKER',
          part_number: d.partNumber ?? null,
          name: [d.manufacturer, d.frameModel].filter(Boolean).join(' ') || d.designation,
          quantity: 1,
          unit_cost: Number(d.price) || 0,
          price_status: d.priceStatus ?? 'PENDING_RFQ',
          source: 'auto',
          meta: {
            designation: d.designation,
            role: d.role,
            ratedA: d.ratedA,
            poles: d.poles,
            mounting: d.mounting,
            interruptingKA: d.interruptingKA,
            sectionIndex: sec.sectionIndex,
          },
          company_id: req.companyId ?? null,
        }, { transaction: t });
      }
    }
    return { sectionCount: createdSections.length };
  });

  const sectionsOut = await models.ConfiguratorSystemSection.findAll({
    where: { switchboard_id: board.id }, order: [['section_number', 'ASC']],
  });
  const linesOut = await models.ConfiguratorComponentLine.findAll({
    where: { switchboard_id: board.id }, order: [['created_at', 'ASC']],
  });
  res.json({ ok: true, ...out, board, sections: sectionsOut, lines: linesOut });
}));

// ERP handoff
router.post('/handoff/order-confirm', wrap(async (req, res) => {
  const { quotationId } = req.body || {};
  const quotation = await models.ConfiguratorQuotation.findByPk(quotationId);
  if (!quotation) return res.status(404).json({ error: 'quotation not found' });
  const configuration = await models.ConfiguratorConfiguration.findByPk(quotation.configuration_id);
  const switchboards = await models.ConfiguratorSwitchboard.findAll({
    where: { configuration_id: quotation.configuration_id },
  });
  const out = await handoff.confirmOrder({
    quotation, configuration, switchboards,
    userId: req.user?.id, companyId: req.companyId ?? null,
  });
  res.json(out);
}));

router.get('/handoff/events', wrap(async (req, res) => {
  const rows = await models.ConfiguratorHandoffEvent.findAll({ order: [['created_at', 'DESC']], limit: 200 });
  res.json(rows);
}));

module.exports = router;
