/**
 * Owner "Overwatch" dashboard — v1 (rule-based business analytics + risk view).
 *
 * Single endpoint GET /overwatch/summary returns one JSON document with
 * pipeline / quotes / procurement / approvals / risks / activity sections.
 *
 * Design notes:
 *   - Every section is computed inside its own try/catch. A failing block
 *     returns an empty section and pushes a `warnings[]` entry; the whole
 *     summary never 500s.
 *   - All ages are computed defensively in JS from `updated_at` / `sent_at`
 *     style timestamps (null-safe — a null date yields no flag).
 *   - Tenant-scoped via req.tenantScope (set by tenantScope middleware).
 *   - NO LLM / AI layer here — that is parked. Rules only.
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const db = require('../models');

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('main_admin', 'admin'));

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole-day age between `from` (a Date|string|null) and now. Null-safe → null. */
function ageDays(from) {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

/** Tenant where-clause: {} for platform_admin, { company_id } otherwise. */
function scope(req, extra = {}) {
  const s = req.tenantScope && req.tenantScope.company_id
    ? { company_id: req.tenantScope.company_id }
    : {};
  return { ...extra, ...s };
}

router.get('/summary', async (req, res) => {
  const warnings = [];
  const summary = {
    pipeline: { byStage: [], total: 0 },
    quotes: { byStatus: {}, issuedValue: 0, issuedCount: 0, staleDrafts: 0, currency: 'USD' },
    procurement: { openBatches: 0, oldestBatchAgeDays: null, pendingRfqParts: 0, batches: [] },
    approvals: { pending: 0, list: [] },
    risks: [],
    activity: [],
    warnings,
    generatedAt: new Date().toISOString(),
  };

  const Project = db.Project;
  const Quotation = db.ConfiguratorQuotation;
  const PriceRfq = db.ConfiguratorPriceRfq;
  const Component = db.ConfiguratorComponent;
  const ChangeOrder = db.ConfiguratorChangeOrder;
  const Switchboard = db.ConfiguratorSwitchboard;
  const WorkOrder = db.WorkOrder;

  // ── pipeline ────────────────────────────────────────────────────────────
  let projects = [];
  try {
    projects = await Project.findAll({
      where: scope(req, { deleted_at: null }),
      attributes: ['id', 'project_name', 'project_number', 'status', 'updated_at'],
      order: [['updated_at', 'DESC']],
    });
    const byStage = {};
    for (const p of projects) {
      const stage = p.status || 'unknown';
      if (!byStage[stage]) byStage[stage] = { stage, count: 0, projects: [] };
      byStage[stage].count += 1;
      byStage[stage].projects.push({
        id: p.id,
        name: p.project_name,
        code: p.project_number || null,
        stage,
        updated_at: p.updated_at,
      });
    }
    summary.pipeline.byStage = Object.values(byStage);
    summary.pipeline.total = projects.length;
  } catch (err) {
    warnings.push({ section: 'pipeline', message: err.message });
  }

  // ── quotes ──────────────────────────────────────────────────────────────
  let quotations = [];
  try {
    quotations = await Quotation.findAll({
      where: scope(req),
      attributes: ['id', 'quotation_number', 'project_id', 'configuration_id',
        'status', 'grand_total', 'currency', 'updated_at'],
      order: [['updated_at', 'DESC']],
    });
    const byStatus = {};
    let issuedValue = 0;
    let issuedCount = 0;
    let staleDrafts = 0;
    let currency = 'USD';
    for (const q of quotations) {
      const st = q.status || 'draft';
      byStatus[st] = (byStatus[st] || 0) + 1;
      // "issued" in this schema = sent | accepted | sold
      if (st === 'sent' || st === 'accepted' || st === 'sold') {
        issuedCount += 1;
        issuedValue += Number(q.grand_total || 0);
        if (q.currency) currency = q.currency;
      }
      if (st === 'draft') {
        const age = ageDays(q.updated_at);
        if (age !== null && age > 14) staleDrafts += 1;
      }
    }
    summary.quotes = {
      byStatus,
      issuedValue: Math.round(issuedValue * 100) / 100,
      issuedCount,
      staleDrafts,
      currency,
    };
  } catch (err) {
    warnings.push({ section: 'quotes', message: err.message });
  }

  // ── procurement ─────────────────────────────────────────────────────────
  try {
    const rfqs = await PriceRfq.findAll({
      where: scope(req, { status: { [Op.in]: ['open', 'sent'] } }),
      attributes: ['id', 'status', 'manufacturer', 'sent_at', 'received_at', 'meta', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    // Group into batches by meta.batch_code (fallback: per-row).
    const batchMap = {};
    for (const r of rfqs) {
      const meta = r.meta || {};
      const code = meta.batch_code || `RFQ-${String(r.id).slice(0, 8)}`;
      if (!batchMap[code]) {
        batchMap[code] = {
          code,
          vendor: meta.vendor_name || r.manufacturer || null,
          sentAt: r.sent_at || r.created_at || null,
          total: 0,
          received: 0,
        };
      }
      const b = batchMap[code];
      b.total += 1;
      if (r.received_at) b.received += 1;
      // keep oldest sentAt for the batch
      const cur = b.sentAt ? new Date(b.sentAt).getTime() : Infinity;
      const cand = (r.sent_at || r.created_at) ? new Date(r.sent_at || r.created_at).getTime() : Infinity;
      if (cand < cur) b.sentAt = r.sent_at || r.created_at;
    }
    const batches = Object.values(batchMap).map((b) => ({
      ...b,
      ageDays: ageDays(b.sentAt),
    }));
    let oldest = null;
    for (const b of batches) {
      if (b.ageDays !== null && (oldest === null || b.ageDays > oldest)) oldest = b.ageDays;
    }

    let pendingRfqParts = 0;
    try {
      pendingRfqParts = await Component.count({
        where: scope(req, { price_status: 'PENDING_RFQ' }),
      });
    } catch (e) {
      warnings.push({ section: 'procurement.pendingParts', message: e.message });
    }

    summary.procurement = {
      openBatches: batches.length,
      oldestBatchAgeDays: oldest,
      pendingRfqParts,
      batches,
    };
  } catch (err) {
    warnings.push({ section: 'procurement', message: err.message });
  }

  // ── approvals ───────────────────────────────────────────────────────────
  let pendingCOs = [];
  try {
    pendingCOs = await ChangeOrder.findAll({
      where: scope(req, { status: 'pending_approval' }),
      attributes: ['id', 'reason', 'originator', 'configuration_id', 'created_at', 'updated_at'],
      order: [['created_at', 'ASC']],
    });
    summary.approvals = {
      pending: pendingCOs.length,
      list: pendingCOs.map((c) => ({
        id: c.id,
        reason: c.reason,
        originator: c.originator,
        configuration_id: c.configuration_id,
        ageDays: ageDays(c.created_at),
        created_at: c.created_at,
      })),
    };
  } catch (err) {
    warnings.push({ section: 'approvals', message: err.message });
  }

  // ── risks (rule-based) ────────────────────────────────────────────────────
  try {
    const risks = [];

    // Rule: RFQ batch older than 7 days (open/sent).
    for (const b of summary.procurement.batches) {
      if (b.ageDays !== null && b.ageDays > 7) {
        risks.push({
          severity: b.ageDays > 14 ? 'red' : 'amber',
          code: 'RFQ_BATCH_STALE',
          message: `RFQ batch open ${b.ageDays}d with no full response`,
          entity: b.code,
        });
      }
    }

    // Rule: quote draft stale > 14d.
    for (const q of quotations) {
      if ((q.status || 'draft') === 'draft') {
        const age = ageDays(q.updated_at);
        if (age !== null && age > 14) {
          risks.push({
            severity: age > 30 ? 'red' : 'amber',
            code: 'QUOTE_DRAFT_STALE',
            message: `Draft quote untouched ${age}d`,
            entity: q.quotation_number || `Quote ${String(q.id).slice(0, 8)}`,
          });
        }
      }
    }

    // Rule: CO pending_approval > 3d.
    for (const c of pendingCOs) {
      const age = ageDays(c.created_at);
      if (age !== null && age > 3) {
        risks.push({
          severity: age > 7 ? 'red' : 'amber',
          code: 'CO_PENDING_STALE',
          message: `Change order awaiting approval ${age}d`,
          entity: c.reason ? String(c.reason).slice(0, 60) : `CO ${String(c.id).slice(0, 8)}`,
        });
      }
    }

    // Rule: project untouched > 10d (only non-terminal stages).
    const terminal = new Set(['closed', 'shipped']);
    for (const p of projects) {
      if (terminal.has(p.status)) continue;
      const age = ageDays(p.updated_at);
      if (age !== null && age > 10) {
        risks.push({
          severity: age > 21 ? 'red' : 'amber',
          code: 'PROJECT_STALE',
          message: `Project untouched ${age}d (stage: ${p.status || 'unknown'})`,
          entity: p.project_name || p.project_number || `Project ${String(p.id).slice(0, 8)}`,
        });
      }
    }

    // Rule: board locked with no issued quote for its configuration.
    try {
      const lockedBoards = await Switchboard.findAll({
        where: scope(req, { status: 'locked' }),
        attributes: ['id', 'name', 'configuration_id'],
      });
      const issuedConfigIds = new Set(
        quotations
          .filter((q) => ['sent', 'accepted', 'sold'].includes(q.status) && q.configuration_id)
          .map((q) => String(q.configuration_id))
      );
      for (const b of lockedBoards) {
        if (!b.configuration_id || !issuedConfigIds.has(String(b.configuration_id))) {
          risks.push({
            severity: 'amber',
            code: 'BOARD_LOCKED_NO_QUOTE',
            message: 'Board locked but no issued quote on its configuration',
            entity: b.name || `Board ${String(b.id).slice(0, 8)}`,
          });
        }
      }
    } catch (e) {
      warnings.push({ section: 'risks.lockedBoards', message: e.message });
    }

    // Rule: quotation accepted but no work order (WorkOrder is keyed by project_id).
    try {
      const acceptedProjectIds = quotations
        .filter((q) => ['accepted', 'sold'].includes(q.status) && q.project_id)
        .map((q) => String(q.project_id));
      const uniqueAccepted = [...new Set(acceptedProjectIds)];
      if (uniqueAccepted.length) {
        const wos = await WorkOrder.findAll({
          where: scope(req, { project_id: { [Op.in]: uniqueAccepted } }),
          attributes: ['project_id'],
        });
        const withWo = new Set(wos.map((w) => String(w.project_id)));
        const projName = {};
        for (const p of projects) projName[String(p.id)] = p.project_name || p.project_number;
        for (const pid of uniqueAccepted) {
          if (!withWo.has(pid)) {
            risks.push({
              severity: 'red',
              code: 'ACCEPTED_NO_WORK_ORDER',
              message: 'Quotation accepted but no work order released',
              entity: projName[pid] || `Project ${pid.slice(0, 8)}`,
            });
          }
        }
      }
    } catch (e) {
      warnings.push({ section: 'risks.workOrders', message: e.message });
    }

    // Stable sort: red first, then amber.
    risks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));
    summary.risks = risks;
  } catch (err) {
    warnings.push({ section: 'risks', message: err.message });
  }

  // ── activity (10 most recent across projects / quotations / RFQs) ─────────
  try {
    const events = [];
    for (const p of projects) {
      events.push({
        entity: 'project',
        name: p.project_name || p.project_number || String(p.id).slice(0, 8),
        when: p.updated_at,
      });
    }
    for (const q of quotations) {
      events.push({
        entity: 'quotation',
        name: q.quotation_number || `Quote ${String(q.id).slice(0, 8)}`,
        when: q.updated_at,
      });
    }
    try {
      const recentRfqs = await PriceRfq.findAll({
        where: scope(req),
        attributes: ['id', 'catalog_number', 'manufacturer', 'meta', 'updated_at'],
        order: [['updated_at', 'DESC']],
        limit: 10,
      });
      for (const r of recentRfqs) {
        const meta = r.meta || {};
        events.push({
          entity: 'rfq',
          name: meta.batch_code || r.catalog_number || `RFQ ${String(r.id).slice(0, 8)}`,
          when: r.updated_at,
        });
      }
    } catch (e) {
      warnings.push({ section: 'activity.rfqs', message: e.message });
    }
    events.sort((a, b) => {
      const ta = a.when ? new Date(a.when).getTime() : 0;
      const tb = b.when ? new Date(b.when).getTime() : 0;
      return tb - ta;
    });
    summary.activity = events.slice(0, 10);
  } catch (err) {
    warnings.push({ section: 'activity', message: err.message });
  }

  return res.json({ success: true, data: summary });
});

module.exports = router;
