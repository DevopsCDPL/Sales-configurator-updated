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
const { Op } = require('sequelize');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const models = require('../models');
const { sequelize } = models;
const swJobs = require('../services/configurator/swJobsService');
const { buildSolidworksPayload } = require('../services/configurator/solidworksPayloadBuilder');
const { evaluateCompleteness } = require('../services/configurator/completenessEngine');
const handoff = require('../services/configurator/handoffService');
const { compileBomV2 } = require('../services/configurator/bomEngineV2');
const { estimateCopper } = require('../services/configurator/copperEstimator');
const { compileBoardBom } = require('../services/configurator/v2BomService');
const v2Quote = require('../services/configurator/v2QuoteService');
const { importTpsWorkbook } = require('../services/configurator/workbookImporter');
const { renderV2QuotationPdf } = require('../services/configurator/v2QuotePdf');
const { buildEpicorWorkbook } = require('../services/configurator/epicorExport');
const { buildProposalPdf } = require('../services/configurator/tpsProposalPdf');
const { generateComponents } = require('../services/configurator/componentRules');
const multer = require('multer');
const wbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

/* ── Change orders (Phase F §5) ───────────────────────────────────────
 * A frozen (locked) board can only be reopened through a change order:
 * reason required, prior quotation linked, board unlocked for editing.
 * The NEXT issued revision links back as new_quotation_id.            */
router.post('/switchboards/:id/change-order', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  if (board.status !== 'locked') return res.status(422).json({ error: 'board is not frozen — change orders apply to accepted designs only' });
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 5) return res.status(400).json({ error: 'a meaningful reason is required (min 5 chars)' });

  const quotes = await v2Quote.listBoardQuotes(board.id);
  const co = await models.ConfiguratorChangeOrder.create({
    configuration_id: board.configuration_id,
    switchboard_id: board.id,
    reason,
    origin: req.body?.origin === 'customer' ? 'customer' : 'internal',
    status: 'applied',
    old_quotation_id: quotes[0]?.id ?? null,
    schedule_impact: req.body?.scheduleImpact ?? null,
    created_by: req.user?.id ?? null,
    applied_at: new Date(),
    company_id: req.companyId ?? null,
  });
  await board.update({
    status: 'complete',
    board_data: { ...(board.board_data || {}), activeChangeOrderId: co.id },
  });
  res.status(201).json({ ok: true, changeOrder: co, board });
}));

router.get('/switchboards/:id/change-orders', wrap(async (req, res) => {
  const rows = await models.ConfiguratorChangeOrder.findAll({
    where: { switchboard_id: req.params.id },
    order: [['created_at', 'DESC']],
  });
  res.json(rows);
}));

/* ── Component auto-rules (AP registry) ───────────────────────────────
 * POST /switchboards/:id/generate-components — evaluate the versioned
 * component_rules table against the design; upsert source='rule' lines
 * (cheapest catalog match or NO-CATALOG-MATCH placeholder). Engineer
 * qty edits and swaps survive regeneration.                            */
router.post('/switchboards/:id/generate-components', wrap(async (req, res) => {
  try {
    const out = await generateComponents(req.params.id, { companyId: req.companyId ?? null });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
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

/** Swap / edit a line in place (e.g. engineer picks a different breaker).
 *  Cost-bearing fields update together; meta is merged; the board must
 *  not be locked. Swapped auto-lines keep source but are flagged. */
router.patch('/lines/:lineId', wrap(async (req, res) => {
  const row = await models.ConfiguratorComponentLine.findByPk(req.params.lineId);
  if (!row) return res.status(404).json({ error: 'not found' });
  const board = await models.ConfiguratorSwitchboard.findByPk(row.switchboard_id);
  if (board?.status === 'locked') return res.status(423).json({ error: 'switchboard locked — raise a change order' });

  const allowed = ['component_id', 'part_number', 'name', 'quantity', 'unit_cost', 'price_status'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  const meta = { ...(row.meta ?? {}), ...(req.body?.meta ?? {}) };
  if (patch.part_number && patch.part_number !== row.part_number) {
    meta.swapped = true;
    meta.swapped_from = row.part_number;
    meta.requote_review = true;
  }
  await row.update({ ...patch, meta });
  res.json(row);
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

/* ── Price queue (Awaiting-Price loop, Phase A §4.1) ──────────────────
 * GET  /price-queue          — pending lines grouped by part + open RFQs
 * POST /price-queue/receive  — { partNumber, price }: component → FIRM,
 *                              all non-FIRM lines updated + flagged      */
router.get('/price-queue', wrap(async (req, res) => {
  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { price_status: ['PENDING_RFQ', 'ESTIMATED'] },
    order: [['created_at', 'ASC']],
  });
  const boards = await models.ConfiguratorSwitchboard.findAll({
    where: { id: [...new Set(lines.map((l) => l.switchboard_id).filter(Boolean))] },
    attributes: ['id', 'name'],
  }).catch(() => []);
  const boardName = new Map(boards.map((b) => [b.id, b.name]));

  const grouped = new Map();
  for (const l of lines) {
    const key = l.part_number || l.name || l.id;
    const prev = grouped.get(key) ?? {
      partNumber: l.part_number,
      name: l.name,
      category: l.category,
      priceStatus: l.price_status,
      lineCount: 0,
      totalQty: 0,
      boards: new Set(),
      componentId: l.component_id ?? null,
    };
    prev.lineCount += 1;
    prev.totalQty += Number(l.quantity) || 0;
    if (l.switchboard_id) prev.boards.add(boardName.get(l.switchboard_id) ?? 'unknown board');
    if (l.price_status === 'PENDING_RFQ') prev.priceStatus = 'PENDING_RFQ';
    grouped.set(key, prev);
  }

  const rfqs = await models.ConfiguratorPriceRfq.findAll({
    where: { status: ['open', 'sent'] },
    order: [['created_at', 'DESC']],
    limit: 200,
  });

  res.json({
    pending: [...grouped.values()].map((g) => ({ ...g, boards: [...g.boards] })),
    rfqs,
  });
}));

router.post('/price-queue/receive', wrap(async (req, res) => {
  const { partNumber, price } = req.body || {};
  const p = Number(price);
  if (!partNumber || !Number.isFinite(p) || p <= 0) {
    return res.status(400).json({ error: 'partNumber and a positive price are required' });
  }

  const [compUpd] = await models.ConfiguratorComponent.update(
    { price: p, mat_cost: p, material_cost: p, price_status: 'FIRM' },
    { where: { part_number: partNumber } }
  ).catch(() => [0]);

  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { part_number: partNumber, price_status: ['PENDING_RFQ', 'ESTIMATED'] },
  });
  for (const l of lines) {
    await l.update({
      unit_cost: p,
      price_status: 'FIRM',
      meta: { ...(l.meta ?? {}), requote_review: true, priced_at: new Date().toISOString() },
    });
  }

  const comp = await models.ConfiguratorComponent.findOne({ where: { part_number: partNumber } });
  if (comp) {
    await models.ConfiguratorPriceRfq.update(
      { status: 'received', received_price: p, received_at: new Date() },
      { where: { component_id: comp.id, status: ['open', 'sent'] } }
    ).catch(() => {});
  }

  res.json({ ok: true, componentsUpdated: compUpd, linesUpdated: lines.length });
}));

// SW jobs (UI)
router.get('/sw-jobs', wrap(async (req, res) => {
  const where = {};
  if (req.query.switchboardId) where.switchboard_id = req.query.switchboardId;
  if (req.query.status) where.status = req.query.status;
  const rows = await models.ConfiguratorSolidworksJob.findAll({
    where,
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


/* ── Bill of Materials (compiled live from persisted design) ──────────
 * GET /switchboards/:id/bom[?copperPricePerLb=5.50]
 * Single source: v2BomService (shared with the quote pipeline).       */
router.get('/switchboards/:id/bom', wrap(async (req, res) => {
  try {
    const out = await compileBoardBom(req.params.id, {
      copperPricePerLb: Number(req.query.copperPricePerLb) || null,
    });
    res.json({
      board: { id: out.board.id, name: out.board.name, status: out.board.status, board_data: out.board.board_data },
      sectionCount: out.sections.length,
      copper: out.copper,
      copperPricePerLb: out.copperPricePerLb,
      ...out.bom,
    });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'not found' });
    throw e;
  }
}));

/* ── Quote (parity-proven v1 pricing engine over the live BOM) ────────
 * POST /switchboards/:id/quote/preview  — compute only, never persists
 * POST /switchboards/:id/quote          — issue next revision (immutable chain)
 * GET  /switchboards/:id/quotes         — revision history
 * Body: { gmPct (0–1), roundupFactor, laborAdjustments:[{bucket,hours,note}],
 *         copperPricePerLb, revisionReason, force }                     */
router.post('/switchboards/:id/quote/preview', wrap(async (req, res) => {
  try {
    const out = await v2Quote.computeBoardQuote(req.params.id, req.body || {});
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message, details: e.details });
    throw e;
  }
}));

router.post('/switchboards/:id/quote', wrap(async (req, res) => {
  try {
    const out = await v2Quote.issueBoardQuote(req.params.id, req.body || {}, {
      userId: req.user?.id ?? null,
      companyId: req.companyId ?? null,
      projectId: req.body?.projectId ?? null,
      customerName: req.body?.customerName ?? null,
    });
    res.status(201).json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message, details: e.details });
    throw e;
  }
}));

/** Client-facing PDF for an issued V2 revision (download). */
router.get('/quotations/:id/pdf', wrap(async (req, res) => {
  try {
    const { buffer, filename } = await renderV2QuotationPdf(req.params.id, {
      companyId: req.companyId ?? null,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

/** Epicor import workbook (TPS exact layout) for an issued revision. */
router.get('/quotations/:id/epicor-export', wrap(async (req, res) => {
  try {
    const { buffer, filename } = await buildEpicorWorkbook(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

/** CLIENT-FACING proposal (TPS template): all boards of the
 *  configuration with issued quotations, max 4 items, sell prices only. */
router.get('/configurations/:configId/proposal-pdf', wrap(async (req, res) => {
  try {
    const { buffer, filename } = await buildProposalPdf(req.params.configId, {
      companyId: req.companyId ?? null,
      user: req.user ? { name: req.user.name ?? [req.user.first_name, req.user.last_name].filter(Boolean).join(' '), email: req.user.email } : null,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

router.get('/switchboards/:id/quotes', wrap(async (req, res) => {
  const rows = await v2Quote.listBoardQuotes(req.params.id);
  res.json(rows.map((q) => ({
    id: q.id,
    quotation_number: q.quotation_number,
    revision: q.revision,
    revision_reason: q.revision_reason,
    parent_quotation_id: q.parent_quotation_id,
    status: q.status,
    material_total: Number(q.material_total),
    labour_total: Number(q.labour_total),
    overhead_total: Number(q.overhead_total),
    subtotal: Number(q.subtotal),
    margin_pct: Number(q.margin_pct),
    margin_total: Number(q.margin_total),
    grand_total: Number(q.grand_total),
    created_at: q.created_at,
    labourHoursTotal: q.pricing_spec?.labourHoursTotal ?? null,
    nonFirmCount: q.pricing_spec?.nonFirmCount ?? null,
    forced: q.pricing_spec?.forced ?? false,
  })));
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
            loadDescription: d.loadDescription ?? null,
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

// ── CB Catalog (DB-backed candidates) ─────────────────────────────────

router.get('/catalog/status', wrap(async (req, res) => {
  const count = await models.ConfiguratorComponent.count({ where: { category: 'CIRCUIT BREAKER' } });
  const withPrice = await models.ConfiguratorComponent.count({
    where: { category: 'CIRCUIT BREAKER', price_status: 'FIRM' },
  });
  res.json({ count, withPrice });
}));

/** Idempotent import of the bundled CB seed (308 breakers, parsed specs/dims). */
router.post('/catalog/import-bundled', wrap(async (req, res) => {
  const seed = require('../seeds/cbCatalogSeed.json');
  const existing = await models.ConfiguratorComponent.findAll({
    where: { category: 'CIRCUIT BREAKER' },
    attributes: ['part_number'],
  });
  const have = new Set(existing.map((r) => r.part_number));
  let created = 0;
  for (const row of seed) {
    if (have.has(row.part_number)) continue;
    await models.ConfiguratorComponent.create({
      ...row,
      mat_cost: row.price ?? 0,
      company_id: req.companyId ?? null,
    }).catch(() => {});
    created += 1;
  }
  // Repair pass: rows imported before price_status was a model attribute
  // defaulted to FIRM in the DB — re-align with the seed (idempotent).
  let repaired = 0;
  for (const row of seed) {
    const want = row.price_status ?? (row.price ? 'FIRM' : 'PENDING_RFQ');
    const [nUpd] = await models.ConfiguratorComponent.update(
      { price_status: want },
      { where: { part_number: row.part_number, price_status: { [Op.ne]: want } } }
    ).catch(() => [0]);
    repaired += nUpd;
  }
  const count = await models.ConfiguratorComponent.count({ where: { category: 'CIRCUIT BREAKER' } });
  res.json({ ok: true, created, repaired, skipped: seed.length - created, total: count });
}));

/* ── TPS estimate workbook import (components + labour + standards) ── */
router.post('/catalog/import-workbook', wbUpload.single('file'), wrap(async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ error: 'multipart file field "file" required (.xlsm/.xlsx)' });
  const out = await importTpsWorkbook(req.file.buffer, { companyId: req.companyId ?? null });
  res.json({ ok: true, ...out });
}));

/** Lightweight CB list for the Designer's sync candidate provider. */
router.get('/catalog/cbs', wrap(async (req, res) => {
  const rows = await models.ConfiguratorComponent.findAll({
    where: { category: 'CIRCUIT BREAKER' },
    attributes: ['id', 'part_number', 'name', 'price', 'price_status',
      'dims_h_in', 'dims_w_in', 'dims_d_in', 'specifications'],
    limit: 2000,
  });
  res.json(rows.map((r) => {
    const sp = r.specifications || {};
    return {
      componentId: r.id,
      partNumber: r.part_number,
      manufacturer: sp.manufacturer ?? null,
      frameModel: sp.frameModel ?? null,
      deviceClass: sp.deviceClass ?? 'MCCB',
      ratedA: Number(sp.ratedCurrentA) || 0,
      interruptingKA: Number(sp.interruptingKA) || 0,
      poles: Number(sp.poles) || 3,
      mounting: sp.mounting ?? 'Fixed',
      pctRated: 80,
      heightIn: r.dims_h_in != null ? Number(r.dims_h_in) : null,
      widthIn: r.dims_w_in != null ? Number(r.dims_w_in) : null,
      depthIn: r.dims_d_in != null ? Number(r.dims_d_in) : null,
      price: r.price != null ? Number(r.price) : null,
      priceStatus: r.price_status ?? 'PENDING_RFQ',
    };
  }));
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
  if (out.ok) await quotation.update({ status: 'accepted', sold: true, issued_at: quotation.issued_at ?? new Date() });
  res.json(out);
}));

router.get('/handoff/events', wrap(async (req, res) => {
  const rows = await models.ConfiguratorHandoffEvent.findAll({ order: [['created_at', 'DESC']], limit: 200 });
  res.json(rows);
}));

module.exports = router;
