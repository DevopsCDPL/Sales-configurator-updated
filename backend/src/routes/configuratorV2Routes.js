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
const ExcelJS = require('exceljs');

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

/* ── Change orders (Phase F §5 + approval workflow) ──────────────────
 * Approval flow: raise (pending_approval) → approve → applied / reject.
 * Board is NOT unlocked at raise time; unlock happens at approve.
 * The NEXT issued revision links back as new_quotation_id.           */
router.post('/switchboards/:id/change-order', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  if (board.status !== 'locked') return res.status(422).json({ error: 'board is not frozen — change orders apply to accepted designs only' });
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 5) return res.status(400).json({ error: 'a meaningful reason is required (min 5 chars)' });

  const quotes = await v2Quote.listBoardQuotes(board.id);
  // CO is created in pending_approval state — board stays locked until approved.
  const co = await models.ConfiguratorChangeOrder.create({
    configuration_id: board.configuration_id,
    switchboard_id: board.id,
    reason,
    originator: req.body?.origin === 'customer' ? 'customer' : 'internal',
    status: 'pending_approval',
    old_quotation_id: quotes[0]?.id ?? null,
    schedule_impact: req.body?.scheduleImpact ?? null,
    created_by: req.user?.id ?? null,
    company_id: req.companyId ?? null,
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

/* ── CO approval / rejection ──────────────────────────────────────────
 * POST /change-orders/:id/approve — stamps approved_by/approved_at,
 *   performs the board unlock + activeChangeOrderId link, sets 'applied'.
 * POST /change-orders/:id/reject  — body { reason } → 'rejected',
 *   board stays frozen.
 * TODO roles: in a multi-user setup, gate self-approval here.         */
router.post('/change-orders/:id/approve', wrap(async (req, res) => {
  const co = await models.ConfiguratorChangeOrder.findByPk(req.params.id);
  if (!co) return res.status(404).json({ error: 'change order not found' });
  if (co.status !== 'pending_approval') {
    return res.status(422).json({ error: `change order is already '${co.status}' — only pending_approval COs can be approved` });
  }

  const board = await models.ConfiguratorSwitchboard.findByPk(co.switchboard_id);
  if (!board) return res.status(404).json({ error: 'switchboard not found' });

  const now = new Date();
  // Collapse approved → applied in one step; timestamps preserve the history.
  await co.update({
    status: 'applied',
    approved_by: req.user?.id ?? null, // TODO roles: gate self-approval here
    approved_at: now,
    applied_at: now,
  });

  // Now unlock the board for re-engineering and record the active CO.
  await board.update({
    status: 'complete',
    board_data: { ...(board.board_data || {}), activeChangeOrderId: co.id },
  });

  res.json({ ok: true, changeOrder: co, board });
}));

router.post('/change-orders/:id/reject', wrap(async (req, res) => {
  const co = await models.ConfiguratorChangeOrder.findByPk(req.params.id);
  if (!co) return res.status(404).json({ error: 'change order not found' });
  if (co.status !== 'pending_approval') {
    return res.status(422).json({ error: `change order is already '${co.status}' — only pending_approval COs can be rejected` });
  }

  const reason = String(req.body?.reason ?? '').trim();
  await co.update({
    status: 'rejected',
    rejected_reason: reason || null,
  });

  // Board stays locked — no board.update needed.
  res.json({ ok: true, changeOrder: co });
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

/* ── Sections (Section Editor — chip 2) ────────────────────────
 * Per-switchboard section CRUD with immediate persistence so the BOM /
 * quote / SLD recompute downstream. section_number is unique per
 * (configuration_id, section_number); reorders swap numbers atomically.
 *   POST   /switchboards/:id/sections   — append (or insert after N)
 *   PATCH  /sections/:id                — name / role / frame / reorder
 *   DELETE /sections/:id                — only when no section-scoped lines
 */
const SECTION_CAP = 10;

router.post('/switchboards/:id/sections', wrap(async (req, res) => {
  const board = await models.ConfiguratorSwitchboard.findByPk(req.params.id);
  if (!board) return res.status(404).json({ error: 'not found' });
  if (board.status === 'locked') return res.status(423).json({ error: 'switchboard locked — raise a change order' });

  const existing = await models.ConfiguratorSystemSection.findAll({
    where: { switchboard_id: board.id },
    order: [['section_number', 'ASC']],
  });
  if (existing.length >= SECTION_CAP) {
    return res.status(422).json({ error: `maximum ${SECTION_CAP} sections per switchboard` });
  }

  const afterRaw = req.body?.afterSectionNumber;
  const after = afterRaw == null ? null : Number(afterRaw);
  const role = String(req.body?.role ?? 'FEEDER');
  const name = req.body?.name != null ? String(req.body.name) : null;

  const created = await sequelize.transaction(async (t) => {
    let newNumber;
    if (after == null || !Number.isFinite(after)) {
      newNumber = existing.length ? Math.max(...existing.map((s) => s.section_number)) + 1 : 1;
    } else {
      // Insert after `after`: shift sections >= after+1 up by one (descending
      // to avoid transient unique collisions on section_number).
      newNumber = after + 1;
      const toShift = existing
        .filter((s) => s.section_number >= newNumber)
        .sort((a, b) => b.section_number - a.section_number);
      for (const s of toShift) {
        await s.update({ section_number: s.section_number + 1 }, { transaction: t });
      }
    }
    return models.ConfiguratorSystemSection.create({
      configuration_id: board.configuration_id,
      switchboard_id: board.id,
      section_number: newNumber,
      name: name ?? `Section ${newNumber}`,
      setup: { role },
      electrical: {},
      layout: {},
      computed: {},
      company_id: req.companyId ?? null,
    }, { transaction: t });
  });

  res.status(201).json(created);
}));

router.patch('/sections/:id', wrap(async (req, res) => {
  const row = await models.ConfiguratorSystemSection.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const board = row.switchboard_id ? await models.ConfiguratorSwitchboard.findByPk(row.switchboard_id) : null;
  if (board?.status === 'locked') return res.status(423).json({ error: 'switchboard locked — raise a change order' });

  const body = req.body || {};

  await sequelize.transaction(async (t) => {
    // Reorder: swap section_number with the section currently holding the target.
    if (body.section_number != null && Number(body.section_number) !== row.section_number) {
      const target = Number(body.section_number);
      const other = await models.ConfiguratorSystemSection.findOne({
        where: { switchboard_id: row.switchboard_id, section_number: target },
        transaction: t,
      });
      const from = row.section_number;
      if (other) {
        const parking = -Math.abs(Date.now() % 1000000);
        await other.update({ section_number: parking }, { transaction: t });
        await row.update({ section_number: target }, { transaction: t });
        await other.update({ section_number: from }, { transaction: t });
      } else {
        await row.update({ section_number: target }, { transaction: t });
      }
    }

    const patch = {};
    if (body.name != null) patch.name = String(body.name);
    if (body.role != null) patch.setup = { ...(row.setup || {}), role: String(body.role) };

    // Frame: accept frame object, frameCode, or frame_id → store in layout.
    if (body.frame !== undefined || body.frameCode !== undefined || body.frame_id !== undefined) {
      const frame = body.frame ?? null;
      const frameCode = body.frameCode ?? body.frame_id ?? frame?.frameCode ?? null;
      patch.layout = { ...(row.layout || {}), frame, frameCode };
    }
    if (Object.keys(patch).length) await row.update(patch, { transaction: t });
  });

  const fresh = await models.ConfiguratorSystemSection.findByPk(row.id);
  res.json(fresh);
}));

router.delete('/sections/:id', wrap(async (req, res) => {
  const row = await models.ConfiguratorSystemSection.findByPk(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const board = row.switchboard_id ? await models.ConfiguratorSwitchboard.findByPk(row.switchboard_id) : null;
  if (board?.status === 'locked') return res.status(423).json({ error: 'switchboard locked — raise a change order' });

  const refCount = await models.ConfiguratorComponentLine.count({
    where: { scope: 'section', section_id: row.id },
  });
  if (refCount > 0) {
    return res.status(409).json({ error: 'Move or remove devices first' });
  }
  await row.destroy();
  res.json({ ok: true });
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
  const rfqComp = await models.ConfiguratorComponent.findByPk(rfq.component_id);
  if (rfqComp) {
    await rfqComp.update({ price, mat_cost: price, price_status: 'FIRM', specifications: { ...(rfqComp.specifications || {}), priceSource: 'rfq' } });
  }
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

  // Pull catalog component specs (manufacturer / assigned vendor) by part #.
  const partNumbers = [...new Set(lines.map((l) => l.part_number).filter(Boolean))];
  const comps = partNumbers.length
    ? await models.ConfiguratorComponent.findAll({
        where: { part_number: partNumbers },
        attributes: ['id', 'part_number', 'specifications'],
      }).catch(() => [])
    : [];
  const specByPart = new Map(comps.map((c) => [c.part_number, c.specifications || {}]));

  // Open/sent RFQ rows keyed by part number (batch info for already-queued parts).
  const openRfqs = await models.ConfiguratorPriceRfq.findAll({
    where: { status: ['open', 'sent'] },
    order: [['created_at', 'DESC']],
    limit: 1000,
  });
  const rfqByPart = new Map();
  for (const r of openRfqs) {
    const m = r.meta || {};
    const pn = m.part_number || r.catalog_number;
    if (pn && !rfqByPart.has(pn)) {
      rfqByPart.set(pn, {
        rfqId: r.id,
        batchCode: m.batch_code ?? null,
        status: r.status,
        sentAt: r.sent_at,
        vendorName: m.vendor_name ?? null,
      });
    }
  }

  const grouped = new Map();
  for (const l of lines) {
    const key = l.part_number || l.name || l.id;
    const spec = (l.part_number && specByPart.get(l.part_number)) || {};
    const prev = grouped.get(key) ?? {
      partNumber: l.part_number,
      name: l.name,
      category: l.category,
      priceStatus: l.price_status,
      manufacturer: spec.manufacturer ?? null,
      vendorId: spec.vendorId ?? null,
      vendorName: spec.vendorName ?? null,
      lineCount: 0,
      totalQty: 0,
      boards: new Set(),
      componentId: l.component_id ?? null,
      openRfq: (l.part_number && rfqByPart.get(l.part_number)) || null,
    };
    prev.lineCount += 1;
    prev.totalQty += Number(l.quantity) || 0;
    if (l.switchboard_id) prev.boards.add(boardName.get(l.switchboard_id) ?? 'unknown board');
    if (l.price_status === 'PENDING_RFQ') prev.priceStatus = 'PENDING_RFQ';
    grouped.set(key, prev);
  }

  res.json({
    pending: [...grouped.values()].map((g) => ({ ...g, boards: [...g.boards] })),
    rfqs: openRfqs,
  });
}));

router.post('/price-queue/receive', wrap(async (req, res) => {
  const { partNumber, price } = req.body || {};
  const p = Number(price);
  if (!partNumber || !Number.isFinite(p) || p <= 0) {
    return res.status(400).json({ error: 'partNumber and a positive price are required' });
  }

  const queueComps = await models.ConfiguratorComponent.findAll({ where: { part_number: partNumber } });
  for (const qc of queueComps) {
    await qc.update({ price: p, mat_cost: p, material_cost: p, price_status: 'FIRM', specifications: { ...(qc.specifications || {}), priceSource: 'rfq' } });
  }
  const compUpd = queueComps.length;

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

/* ── RFQ batches (vendor-grouped procurement loop) ────────────────────
 * POST /rfq-batches               — create a batch of ConfiguratorPriceRfq
 *                                   rows for selected parts (status 'sent')
 * GET  /rfq-batches               — list batches (grouped by batch code)
 * GET  /rfq-batches/:code/xlsx    — RFQ workbook for a batch
 * GET  /rfq-batches/:code/email   — prefilled email draft JSON            */

// Generate a batch code RFQ-YYYYMMDD-NNN unique per day.
async function nextBatchCode() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `RFQ-${ymd}-`;
  const todays = await models.ConfiguratorPriceRfq.findAll({
    where: models.sequelize.where(models.sequelize.json("meta.batch_code"), { [Op.like]: `${prefix}%` }),
    attributes: ['meta'],
  }).catch(() => []);
  const seen = new Set();
  for (const r of todays) {
    const code = r.meta && r.meta.batch_code;
    if (code) seen.add(code);
  }
  let n = seen.size + 1;
  let code = `${prefix}${String(n).padStart(3, '0')}`;
  while (seen.has(code)) { n += 1; code = `${prefix}${String(n).padStart(3, '0')}`; }
  return code;
}

router.post('/rfq-batches', wrap(async (req, res) => {
  const { vendorId, vendorName, partNumbers, neededBy, notes } = req.body || {};
  const parts = Array.isArray(partNumbers) ? [...new Set(partNumbers.filter(Boolean))] : [];
  if (!parts.length) return res.status(400).json({ error: 'partNumbers[] required' });

  const batchCode = await nextBatchCode();
  const now = new Date();
  let count = 0;

  for (const pn of parts) {
    const comp = await models.ConfiguratorComponent.findOne({ where: { part_number: pn } }).catch(() => null);
    if (!comp) continue;
    const spec = comp.specifications || {};
    const qLines = await models.ConfiguratorComponentLine.findAll({
      where: { part_number: pn, price_status: ['PENDING_RFQ', 'ESTIMATED'] },
      attributes: ['quantity'],
    }).catch(() => []);
    const qty = qLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0) || 1;

    const meta = {
      batch_code: batchCode,
      part_number: pn,
      vendor_id: vendorId ?? spec.vendorId ?? null,
      vendor_name: vendorName ?? spec.vendorName ?? null,
      manufacturer: spec.manufacturer ?? null,
      description: comp.name ?? null,
      needed_by: neededBy ?? null,
      qty,
    };

    const existing = await models.ConfiguratorPriceRfq.findOne({
      where: { component_id: comp.id, status: ['open', 'sent'] },
    }).catch(() => null);
    if (existing) {
      await existing.update({
        status: 'sent',
        sent_at: now,
        manufacturer: meta.manufacturer,
        notes: notes ?? existing.notes,
        meta: { ...(existing.meta || {}), ...meta },
      });
    } else {
      await models.ConfiguratorPriceRfq.create({
        component_id: comp.id,
        catalog_number: pn,
        manufacturer: meta.manufacturer,
        status: 'sent',
        sent_at: now,
        notes: notes ?? null,
        company_id: comp.company_id ?? null,
        meta,
      });
    }
    count += 1;
  }

  if (!count) return res.status(400).json({ error: 'No catalog components matched the supplied part numbers' });
  res.json({ batchCode, count });
}));

// Fetch every RFQ row belonging to a batch code.
async function rfqRowsForBatch(code) {
  return models.ConfiguratorPriceRfq.findAll({
    where: models.sequelize.where(models.sequelize.json("meta.batch_code"), code),
    order: [['created_at', 'ASC']],
  });
}

router.get('/rfq-batches', wrap(async (req, res) => {
  const rows = await models.ConfiguratorPriceRfq.findAll({
    where: models.sequelize.where(models.sequelize.json("meta.batch_code"), { [Op.ne]: null }),
    order: [['created_at', 'DESC']],
    limit: 2000,
  }).catch(() => []);

  const byCode = new Map();
  for (const r of rows) {
    const m = r.meta || {};
    const code = m.batch_code;
    if (!code) continue;
    const prev = byCode.get(code) ?? {
      batchCode: code,
      vendorName: m.vendor_name ?? null,
      vendorId: m.vendor_id ?? null,
      neededBy: m.needed_by ?? null,
      count: 0,
      received: 0,
      sentAt: r.sent_at ?? null,
    };
    prev.count += 1;
    if (r.status === 'received') prev.received += 1;
    if (r.sent_at && (!prev.sentAt || new Date(r.sent_at) < new Date(prev.sentAt))) prev.sentAt = r.sent_at;
    if (!prev.vendorName && m.vendor_name) prev.vendorName = m.vendor_name;
    byCode.set(code, prev);
  }

  const batches = [...byCode.values()].map((b) => ({
    ...b,
    status: b.received === 0 ? 'open' : b.received >= b.count ? 'complete' : 'partial',
  }));
  res.json({ batches });
}));

router.get('/rfq-batches/:code/xlsx', wrap(async (req, res) => {
  const code = req.params.code;
  const rows = await rfqRowsForBatch(code);
  if (!rows.length) return res.status(404).json({ error: 'batch not found' });

  const first = rows[0].meta || {};
  const vendorName = first.vendor_name || 'Vendor';
  const neededBy = first.needed_by || '';

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RFQ');

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'SWGPLAY — Request for quotation';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = 'Batch code'; ws.getCell('B2').value = code;
  ws.getCell('A3').value = 'Vendor';     ws.getCell('B3').value = vendorName;
  ws.getCell('A4').value = 'Needed by';  ws.getCell('B4').value = neededBy;
  ws.getCell('A5').value = 'Please quote the following items.';
  ['A2', 'A3', 'A4'].forEach((c) => { ws.getCell(c).font = { bold: true }; });
  ws.getCell('A5').font = { italic: true };

  const headerRowIdx = 7;
  const cols = ['S.No', 'Part / Catalog #', 'Description', 'Manufacturer', 'Qty', 'Unit Price', 'Lead time', 'Notes'];
  const hdr = ws.getRow(headerRowIdx);
  cols.forEach((c, i) => { hdr.getCell(i + 1).value = c; hdr.getCell(i + 1).font = { bold: true }; });
  hdr.commit();
  ws.columns = [
    { width: 6 }, { width: 24 }, { width: 38 }, { width: 22 },
    { width: 8 }, { width: 14 }, { width: 14 }, { width: 28 },
  ];

  rows.forEach((r, i) => {
    const m = r.meta || {};
    ws.getRow(headerRowIdx + 1 + i).values = [
      i + 1,
      m.part_number || r.catalog_number || '',
      m.description || '',
      m.manufacturer || r.manufacturer || '',
      Number(m.qty) || 1,
      '',
      '',
      '',
    ];
  });

  const filename = `${code}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}));

router.get('/rfq-batches/:code/email', wrap(async (req, res) => {
  const code = req.params.code;
  const rows = await rfqRowsForBatch(code);
  if (!rows.length) return res.status(404).json({ error: 'batch not found' });

  const first = rows[0].meta || {};
  const vendorName = first.vendor_name || '';
  const vendorId = first.vendor_id || null;
  const neededBy = first.needed_by || '';

  let to = '';
  if (vendorId) {
    const v = await models.Vendor.findByPk(vendorId).catch(() => null);
    if (v && v.contact_email) to = v.contact_email;
  }
  if (!to && vendorName) {
    const v = await models.Vendor.findOne({ where: { vendor_name: vendorName } }).catch(() => null);
    if (v && v.contact_email) to = v.contact_email;
  }

  const subject = `Request for quotation — ${code}`;
  const greeting = vendorName ? `Dear ${vendorName} team,` : 'Hello,';
  const neededLine = neededBy ? `We would need pricing by ${neededBy}.` : 'Please advise your earliest availability.';
  const body = [
    greeting,
    '',
    `Please provide a quotation for the ${rows.length} item(s) listed in the attached spreadsheet (batch ${code}).`,
    'For each line we need the unit price and the lead time.',
    neededLine,
    '',
    'The attached xlsx lists catalog numbers, descriptions and quantities.',
    '',
    'Thank you,',
    'Procurement',
  ].join('\n');

  res.json({ to, subject, body });
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

/** Idempotent manual re-sync of the legacy catalog (auto-seeded once at boot by migration 20260612000002). */
router.post('/catalog/import-legacy', wrap(async (req, res) => {
  const { importLegacyCatalog } = require('../services/configurator/legacyCatalogImporter');
  const out = await importLegacyCatalog(models.ConfiguratorComponent, { companyId: req.companyId ?? null });
  res.json({ ok: true, ...out });
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

/* -- Catalog Excel export (round-trip xlsx) --------------------------------
 * GET  /catalog/export-xlsx              -- full component catalog as .xlsx
 * POST /catalog/import-components-xlsx  -- re-import (skip existing SKUs)  */

router.get('/catalog/export-xlsx', wrap(async (req, res) => {
  const rows = await models.ConfiguratorComponent.findAll({
    order: [['category', 'ASC'], ['part_number', 'ASC']],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Components');

  ws.columns = [
    { header: 'S.No',          key: 'sno',           width: 6  },
    { header: 'SKU',           key: 'sku',            width: 20 },
    { header: 'Name',          key: 'name',           width: 36 },
    { header: 'Category',      key: 'category',       width: 22 },
    { header: 'Description',   key: 'description',    width: 36 },
    { header: 'Specification', key: 'specification',  width: 24 },
    { header: 'Manufacturer',  key: 'manufacturer',   width: 22 },
    { header: 'Vendor',        key: 'vendor',         width: 22 },
    { header: 'Price',         key: 'price',          width: 12 },
    { header: 'Price Status',  key: 'price_status',   width: 16 },
    { header: 'Labour CU',     key: 'lbr_cu',         width: 11 },
    { header: 'Labour ASM',    key: 'lbr_asm',        width: 11 },
    { header: 'Labour CNT',    key: 'lbr_cnt',        width: 11 },
    { header: 'Labour QC',     key: 'lbr_qc',         width: 11 },
    { header: 'Labour TST',    key: 'lbr_tst',        width: 11 },
    { header: 'Labour ENG',    key: 'lbr_eng',        width: 11 },
    { header: 'Labour CAD',    key: 'lbr_cad',        width: 11 },
  ];

  // Bold + freeze header row
  const hdrRow = ws.getRow(1);
  hdrRow.font = { bold: true };
  hdrRow.commit();
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r, i) => {
    const sp = r.specifications || {};
    const spec = [
      sp.ratedCurrentA && sp.ratedCurrentA + 'A',
      sp.interruptingKA && sp.interruptingKA + 'kA',
      sp.poles && sp.poles + 'P',
    ].filter(Boolean).join(' / ') || sp.catalogNumber || '';

    ws.addRow({
      sno:           i + 1,
      sku:           r.part_number || '',
      name:          r.name || '',
      category:      r.category || '',
      description:   r.description || '',
      specification: spec,
      manufacturer:  sp.manufacturer || r.subcategory || '',
      vendor:        sp.vendorName || '',
      price:         Number(r.price) || 0,
      price_status:  r.price_status || '',
      lbr_cu:        Number(r.lbr_cu) || 0,
      lbr_asm:       Number(r.lbr_asm) || 0,
      lbr_cnt:       Number(r.lbr_cnt) || 0,
      lbr_qc:        Number(r.lbr_qc) || 0,
      lbr_tst:       Number(r.lbr_tst) || 0,
      lbr_eng:       Number(r.lbr_eng) || 0,
      lbr_cad:       Number(r.lbr_cad) || 0,
    });
  });

  // _meta sheet with usage notes
  const meta = wb.addWorksheet('_meta');
  meta.addRow(['Notes']);
  meta.addRow([
    'Edit values and re-upload via Import. ' +
    'Rows with an existing SKU are skipped; ' +
    'rows with a blank SKU get a new SKU on import. ' +
    'Do not change the SKU column for existing rows.',
  ]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="component-catalog.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

/* Category -> SKU prefix map used by the round-trip importer. */
const CATEGORY_PREFIX = {
  'CIRCUIT BREAKER':      'CBRK',
  'CB ACCESSORIES':       'CBAC',
  'ENCLOSURE':            'ENC',
  'BUSSING':              'BUSS',
  'CU':                   'CU',
  'LUGS':                 'LGS',
  'TERMINALS':            'TER',
  'CONTROLS':             'CTRLS',
  'WIRE CABLE':           'WRCBL',
  'CONDUIT':              'CNDT',
  'CURRENT TRANSFORMER':  'CRNTTRS',
  'VOLTAGE TRANSFORMER':  'VLTGTRS',
  'SPD':                  'SPD',
  'ATS':                  'ATS',
  'CAMLOCK':              'CAML',
  'GLASTIC':              'GSTC',
  'HARDWARE':             'HRDWR',
  'LIGHT':                'LT',
  'SWITCH':               'SWT',
  'POWER SUPPLY':         'PRSPLY',
  'STANDARD PRODUCT':     'STDPD',
  'LABOR':                'LBR',
  'UNKNOWN PARTS':        'UNK',
};

router.post('/catalog/import-components-xlsx', wbUpload.single('file'), wrap(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'multipart file field "file" required (.xlsx)' });
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);

  // Pick "Components" sheet or first non-_meta sheet
  const ws = wb.getWorksheet('Components') ||
    wb.worksheets.find((s) => s.name !== '_meta') ||
    wb.worksheets[0];
  if (!ws) return res.status(422).json({ error: 'No worksheet found in uploaded file' });

  // Labour-update mode: activated when workbook contains a 'Labour Hours' sheet
  const labourUpdateMode = Boolean(wb.getWorksheet('Labour Hours'));

  // Map header names -> 1-based column indices (case-insensitive, trimmed)
  const hdrRow = ws.getRow(1);
  const colIdx = {};
  hdrRow.eachCell((cell, colNumber) => {
    const txt = String(cell.value ?? '').trim().toLowerCase();
    colIdx[txt] = colNumber;
  });

  const get = (row, key) => {
    const ci = colIdx[key.toLowerCase()];
    if (!ci) return '';
    const v = row.getCell(ci).value;
    return v == null ? '' : String(v).trim();
  };

  if (!colIdx['name']) {
    return res.status(422).json({ error: 'Unrecognized sheet -- export the catalog first to get the correct format' });
  }

  // Pre-load all existing components for deduplication and SKU generation
  const allComponents = await models.ConfiguratorComponent.findAll({
    attributes: ['part_number', 'name', 'category'],
  });
  const existingSkus = new Set(allComponents.map((c) => c.part_number).filter(Boolean));
  const existingCatName = new Set(
    allComponents.map((c) => `${(c.category || '').toUpperCase()}|${(c.name || '').toLowerCase()}`)
  );

  // Build prefix -> maxN from existing part_numbers
  const prefixCounter = new Map();
  for (const pn of existingSkus) {
    const m = /^([A-Z0-9]+)-(\d+)$/.exec(pn);
    if (!m) continue;
    const prefix = m[1];
    const n = parseInt(m[2], 10);
    if (!prefixCounter.has(prefix) || prefixCounter.get(prefix) < n) {
      prefixCounter.set(prefix, n);
    }
  }

  const generateSku = (category) => {
    const catUpper = (category || '').trim().toUpperCase();
    let prefix = CATEGORY_PREFIX[catUpper];
    if (!prefix) {
      prefix = catUpper.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'CMP';
    }
    const n = (prefixCounter.get(prefix) ?? 0) + 1;
    prefixCounter.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, '0')}`;
  };

  const VALID_STATUS = new Set(['FIRM', 'ESTIMATED', 'PENDING_RFQ']);

  // Feature 3: preload vendor name map for resolution
  const vendorMap = new Map();   // lowercase name -> { id, vendor_name }
  try {
    const allVendors = await models.Vendor.findAll({ attributes: ['id', 'vendor_name'] });
    for (const v of allVendors) {
      const key = String(v.vendor_name || '').toLowerCase().trim();
      if (key) vendorMap.set(key, { id: v.id, vendor_name: v.vendor_name });
    }
  } catch { /* Vendor model unavailable — continue without resolution */ }

  let created = 0, skipped = 0, errors = 0, vendorsResolved = 0, vendorsUnresolved = 0;
  const errorRows = [];

  // Collect data rows (eachRow is sync; awaits happen in the for loop below)
  const dataRows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber > 1) dataRows.push(row);
  });

  for (const row of dataRows) {
    const name = get(row, 'Name');
    if (!name) continue; // blank line

    const sku = get(row, 'SKU');
    const category = (get(row, 'Category') || 'UNKNOWN PARTS').trim().toUpperCase();

    // Dedupe: existing SKU — labour-update mode if sheet is 'Labour Hours'
    if (sku && existingSkus.has(sku)) {
      if (labourUpdateMode) {
        try {
          await models.ConfiguratorComponent.update({
            lbr_cu:  Number(get(row, 'lbr_cu'))  || 0,
            lbr_asm: Number(get(row, 'lbr_asm')) || 0,
            lbr_cnt: Number(get(row, 'lbr_cnt')) || 0,
            lbr_qc:  Number(get(row, 'lbr_qc'))  || 0,
            lbr_tst: Number(get(row, 'lbr_tst')) || 0,
            lbr_eng: Number(get(row, 'lbr_eng')) || 0,
            lbr_cad: Number(get(row, 'lbr_cad')) || 0,
          }, { where: { part_number: sku } });
          skipped += 1;   // counts as 'processed not created'
        } catch { errors += 1; }
      } else {
        skipped += 1;
      }
      continue;
    }
    // Dedupe: blank SKU but same category+name -> skip
    if (!sku && existingCatName.has(`${category}|${name.toLowerCase()}`)) { skipped += 1; continue; }

    try {
      const priceRaw = Number(get(row, 'Price')) || 0;
      const priceStatusRaw = get(row, 'Price Status');
      const price_status = VALID_STATUS.has(priceStatusRaw)
        ? priceStatusRaw
        : (priceRaw > 0 ? 'FIRM' : 'PENDING_RFQ');

      // Build specifications object
      const specs = { priceSource: 'manual' };
      const mfr = get(row, 'Manufacturer');
      if (mfr) specs.manufacturer = mfr;
      const vendorVal = get(row, 'Vendor');
      if (vendorVal) {
        const vKey = vendorVal.toLowerCase().trim();
        const vMatch = vendorMap.get(vKey);
        if (vMatch) {
          specs.vendorId   = vMatch.id;
          specs.vendorName = vMatch.vendor_name;   // canonical spelling
          vendorsResolved += 1;
        } else {
          specs.vendorName = vendorVal;            // keep as typed
          specs.vendorUnresolved = true;
          vendorsUnresolved += 1;
        }
      }

      // Parse Specification cell: "800A / 42kA / 3P" or free text
      const specCell = get(row, 'Specification');
      if (specCell) {
        const mA  = /(\d+)\s*A\b/.exec(specCell);
        const mKA = /(\d+)\s*kA/i.exec(specCell);
        const mP  = /(\d+)\s*P\b/.exec(specCell);
        if (mA || mKA || mP) {
          if (mA)  specs.ratedCurrentA  = Number(mA[1]);
          if (mKA) specs.interruptingKA = Number(mKA[1]);
          if (mP)  specs.poles          = Number(mP[1]);
        } else {
          specs.specText = specCell;
        }
      }

      const partNumber = sku || generateSku(category);

      await models.ConfiguratorComponent.create({
        part_number:    partNumber,
        name,
        category,
        description:    get(row, 'Description') || null,
        price:          priceRaw,
        mat_cost:       priceRaw,
        price_status,
        specifications: specs,
        lbr_cu:  Number(get(row, 'Labour CU'))  || 0,
        lbr_asm: Number(get(row, 'Labour ASM')) || 0,
        lbr_cnt: Number(get(row, 'Labour CNT')) || 0,
        lbr_qc:  Number(get(row, 'Labour QC'))  || 0,
        lbr_tst: Number(get(row, 'Labour TST')) || 0,
        lbr_eng: Number(get(row, 'Labour ENG')) || 0,
        lbr_cad: Number(get(row, 'Labour CAD')) || 0,
        is_active:  true,
        company_id: req.companyId ?? null,
      });

      existingSkus.add(partNumber);
      existingCatName.add(`${category}|${name.toLowerCase()}`);
      created += 1;
    } catch (e) {
      errors += 1;
      if (errorRows.length < 10) errorRows.push(name);
    }
  }

  const total = await models.ConfiguratorComponent.count();
  res.json({ ok: true, created, skipped, errors, errorRows, total, vendorsResolved, vendorsUnresolved });
}));

/* ── Feature 2: Labour-hours blank template download ── */
router.get('/catalog/labour-template-xlsx', wrap(async (req, res) => {
  const rows = await models.ConfiguratorComponent.findAll({
    order: [['category', 'ASC'], ['part_number', 'ASC']],
    attributes: ['part_number', 'name', 'category', 'lbr_cu', 'lbr_asm', 'lbr_cnt', 'lbr_qc', 'lbr_tst', 'lbr_eng', 'lbr_cad'],
  });

  const wb = new ExcelJS.Workbook();

  // Sheet 1 — Labour Hours (engineer fills blanks)
  const ws = wb.addWorksheet('Labour Hours');
  ws.columns = [
    { header: 'part_number', key: 'part_number', width: 22 },
    { header: 'name',        key: 'name',        width: 40 },
    { header: 'category',    key: 'category',    width: 24 },
    { header: 'lbr_cu',      key: 'lbr_cu',      width: 12 },
    { header: 'lbr_asm',     key: 'lbr_asm',     width: 12 },
    { header: 'lbr_cnt',     key: 'lbr_cnt',     width: 12 },
    { header: 'lbr_qc',      key: 'lbr_qc',      width: 12 },
    { header: 'lbr_tst',     key: 'lbr_tst',     width: 12 },
    { header: 'lbr_eng',     key: 'lbr_eng',     width: 12 },
    { header: 'lbr_cad',     key: 'lbr_cad',     width: 12 },
  ];
  const hdrRow = ws.getRow(1);
  hdrRow.font = { bold: true };
  hdrRow.commit();
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  rows.forEach((r) => {
    ws.addRow({
      part_number: r.part_number || '',
      name:        r.name || '',
      category:    r.category || '',
      lbr_cu:  Number(r.lbr_cu)  || 0,
      lbr_asm: Number(r.lbr_asm) || 0,
      lbr_cnt: Number(r.lbr_cnt) || 0,
      lbr_qc:  Number(r.lbr_qc)  || 0,
      lbr_tst: Number(r.lbr_tst) || 0,
      lbr_eng: Number(r.lbr_eng) || 0,
      lbr_cad: Number(r.lbr_cad) || 0,
    });
  });

  // Sheet 2 — _meta instructions
  const meta = wb.addWorksheet('_meta');
  meta.addRow(['Instructions']);
  meta.addRow([
    'Fill hours per unit and import via Database → Components → Upload Excel — ' +
    'labour columns are matched by header name. ' +
    'Because this workbook contains a sheet named \'Labour Hours\', ' +
    'the importer will UPDATE the 7 lbr_* columns on existing rows ' +
    'instead of skipping them.',
  ]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="labour-hours-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));


/* == Catalog Enrichment Pipeline =============================================
 * POST /catalog/enrich-json   -- import scraper JSON array (safe merge)
 * GET  /catalog/enrich-template -- sample row for reference                */
const { mergeSpec, decidePrice } = require('../services/configurator/enrichMerge');

router.get('/catalog/enrich-template', wrap(async (_req, res) => {
  res.json({
    matchPartNumber: 'LGS-0001',
    matchName: null,
    category: 'LUGS',
    name: 'LUG, MECH, 2-HOLE, 300-800 KCMIL',
    description: 'Mechanical lug, 2-hole, 300-800 KCMIL wire range',
    manufacturer: 'Burndy',
    manufacturerPartNumber: 'KA40U2N',
    spec: { lugType: 'MECH', holes: 2, wireRange: '300-800 KCMIL' },
    vendorOffers: [
      { vendor: 'Platt', sku: 'PLT-KA40U2N', price: 17.47, currency: 'USD',
        url: 'https://www.platt.com/platt-electric-supply/product/KA40U2N',
        seenAt: '2026-06-13' },
    ],
    listPrice: 21.00,
    qualityRating: 4,
    popularity: 3,
    imageUrl: 'https://cdn.burndy.com/images/KA40U2N.jpg',
    productUrl: 'https://burndy.com/products/KA40U2N',
    datasheetUrl: 'https://burndy.com/datasheets/KA40U2N.pdf',
    model3dUrl: null,
  });
}));

const enrichJsonHandler = wrap(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'body.rows must be a non-empty array' });

  // Pre-load all existing components for deduplication and SKU generation
  const allComponents = await models.ConfiguratorComponent.findAll({
    attributes: ['id', 'part_number', 'name', 'category'],
  });
  const existingSkus = new Set(allComponents.map((c) => c.part_number).filter(Boolean));

  // Build prefix -> maxN from existing part_numbers (reuse CATEGORY_PREFIX map)
  const enrichPrefixCounter = new Map();
  for (const pn of existingSkus) {
    const m = /^([A-Z0-9]+)-(\d+)$/.exec(pn);
    if (!m) continue;
    const prefix = m[1];
    const n = parseInt(m[2], 10);
    if (!enrichPrefixCounter.has(prefix) || enrichPrefixCounter.get(prefix) < n) {
      enrichPrefixCounter.set(prefix, n);
    }
  }
  const enrichGenerateSku = (category) => {
    const catUpper = (category || '').trim().toUpperCase();
    let prefix = CATEGORY_PREFIX[catUpper];
    if (!prefix) {
      prefix = catUpper.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'CMP';
    }
    const n = (enrichPrefixCounter.get(prefix) ?? 0) + 1;
    enrichPrefixCounter.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, '0')}`;
  };

  let created = 0, updated = 0, matched = 0, offersAdded = 0, errors = 0;
  const errorRows = [];

  for (const row of rows) {
    try {
      // 1. Match
      let existing = null;

      if (row.matchPartNumber) {
        existing = await models.ConfiguratorComponent.findOne({
          where: { part_number: row.matchPartNumber },
        });
      }

      if (!existing) {
        const nameKey = row.matchName || row.name;
        if (nameKey && row.category) {
          existing = await models.ConfiguratorComponent.findOne({
            where: {
              category: { [Op.iLike]: row.category },
              name:     { [Op.iLike]: nameKey },
            },
          });
        }
      }

      // 2. Create or merge
      if (!existing) {
        if (!row.name || !row.category) {
          errors += 1;
          if (errorRows.length < 10) errorRows.push(row.name || row.matchPartNumber || '(unknown)');
          continue;
        }

        const newSku = enrichGenerateSku(row.category);
        const newSpec = mergeSpec({}, row);
        const priceResult = decidePrice('PENDING_RFQ', null, row);

        await models.ConfiguratorComponent.create({
          part_number:    newSku,
          name:           row.name,
          category:       (row.category || '').toUpperCase(),
          description:    row.description || null,
          price:          priceResult.price ?? 0,
          mat_cost:       priceResult.price ?? 0,
          price_status:   priceResult.price_status,
          specifications: newSpec,
          image_url:      row.imageUrl || null,
          is_active:      true,
          company_id:     req.companyId ?? null,
        });

        existingSkus.add(newSku);
        created += 1;
        if (Array.isArray(row.vendorOffers) && row.vendorOffers.length) {
          offersAdded += row.vendorOffers.length;
        }
        continue;
      }

      // 3. Merge into existing
      matched += 1;

      const existingSpec = existing.specifications || {};
      const prevOfferCount = Array.isArray(existingSpec.vendorOffers) ? existingSpec.vendorOffers.length : 0;

      const mergedSpec = mergeSpec(existingSpec, row);

      const newOfferCount = Array.isArray(mergedSpec.vendorOffers) ? mergedSpec.vendorOffers.length : 0;
      offersAdded += Math.max(0, newOfferCount - prevOfferCount);

      const priceResult = decidePrice(
        existing.price_status ?? 'PENDING_RFQ',
        existing.price != null ? Number(existing.price) : null,
        row
      );

      const patch = { specifications: mergedSpec };

      // description: existing wins if non-empty
      if (!(existing.description && existing.description.trim())) {
        if (row.description) patch.description = row.description;
      }

      // image_url: set only if currently empty
      if (!existing.image_url && row.imageUrl) {
        patch.image_url = row.imageUrl;
      }

      // price: update only if not FIRM
      if (existing.price_status !== 'FIRM') {
        patch.price        = priceResult.price ?? existing.price ?? 0;
        patch.mat_cost     = patch.price;
        patch.price_status = priceResult.price_status;
      }

      await existing.update(patch);
      updated += 1;
    } catch (e) {
      errors += 1;
      if (errorRows.length < 10) errorRows.push(row.name || row.matchPartNumber || '(unknown)');
    }
  }

  res.json({ created, updated, matched, offersAdded, errors, errorRows });
});

router.post('/catalog/enrich-json', enrichJsonHandler);

/** Import ALL bundled scrape files (backend/src/seeds/enrichment/*.json) through the same safe merge. */
router.post('/catalog/enrich-bundled', wrap(async (req, res) => {
  const fsx = require('fs');
  const pathx = require('path');
  const dir = pathx.join(__dirname, '..', 'seeds', 'enrichment');
  let rows = [];
  const files = [];
  if (fsx.existsSync(dir)) {
    for (const f of fsx.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      try {
        const arr = JSON.parse(fsx.readFileSync(pathx.join(dir, f), 'utf8'));
        if (Array.isArray(arr)) { rows = rows.concat(arr); files.push({ file: f, rows: arr.length }); }
      } catch (e) { files.push({ file: f, error: e.message }); }
    }
  }
  if (!rows.length) return res.status(404).json({ error: 'No enrichment seed files found', files });
  req.body = { rows };
  return enrichJsonHandler(req, res, () => {});
}));

module.exports = router;
