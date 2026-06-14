'use strict';

/**
 * Capacity Planning + Production Traveller — CRUD routes.
 *
 * Design: docs/capacity-traveler-design.md. Aligns with Phase F §4 (F3
 * Production) and §10 debt #3 (capacity planner automation).
 *
 * Mounted in routes/index.js at /capacity.
 *
 * Authorization: every route requires an authenticated user, tenant scope,
 * and the 'workorders' department resource (middleware/departments.js).
 * v1 surface = list/create/delete for the capacity masters + read for tasks.
 * Mutation of task state (check-in/out, quality adjudication, the planner)
 * is intentionally OUT of this surface — added in P1/P2/P3 once contracts
 * (checklist formats, quality gates, roster) are confirmed.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireResource } = require('../middleware/departments');
const { tenantScope } = require('../middleware/tenantScope');
const models = require('../models');
const { planTasks } = require('../services/configurator/capacityPlanner');

router.use(authenticate);
router.use(tenantScope);
router.use(requireResource('workorders'));

// Small helper: scope a where-clause to the caller's company when present.
function companyWhere(req, extra = {}) {
  const where = { ...extra };
  if (req.user && req.user.company_id) where.company_id = req.user.company_id;
  return where;
}

// ── Teams ────────────────────────────────────────────────────────
router.get('/teams', async (req, res) => {
  try {
    const rows = await models.CapacityTeam.findAll({
      where: companyWhere(req),
      order: [['department', 'ASC'], ['name', 'ASC']],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/teams', async (req, res) => {
  try {
    const { name, department, active, meta } = req.body || {};
    if (!name || !department) {
      return res.status(400).json({ success: false, message: 'name and department are required.' });
    }
    const row = await models.CapacityTeam.create({
      name,
      department,
      active: active !== undefined ? active : true,
      meta: meta || {},
      company_id: req.user ? req.user.company_id : null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Workers ──────────────────────────────────────────────────────
router.get('/workers', async (req, res) => {
  try {
    const where = companyWhere(req);
    if (req.query.department) where.department = req.query.department;
    const rows = await models.CapacityWorker.findAll({
      where,
      order: [['department', 'ASC'], ['display_name', 'ASC']],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/workers', async (req, res) => {
  try {
    const { user_id, team_id, display_name, department, skills, hours_per_day, active, meta } = req.body || {};
    if (!department) {
      return res.status(400).json({ success: false, message: 'department is required.' });
    }
    const row = await models.CapacityWorker.create({
      user_id: user_id || null,
      team_id: team_id || null,
      display_name: display_name || null,
      department,
      skills: Array.isArray(skills) ? skills : [],
      hours_per_day: hours_per_day !== undefined ? hours_per_day : 8,
      active: active !== undefined ? active : true,
      meta: meta || {},
      company_id: req.user ? req.user.company_id : null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Machines ─────────────────────────────────────────────────────
router.get('/machines', async (req, res) => {
  try {
    const where = companyWhere(req);
    if (req.query.type) where.type = req.query.type;
    const rows = await models.CapacityMachine.findAll({
      where,
      order: [['type', 'ASC'], ['name', 'ASC']],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/machines', async (req, res) => {
  try {
    const { name, type, department, capacity_unit, capacity_per_day, in_house, active, meta } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required.' });
    }
    const row = await models.CapacityMachine.create({
      name,
      type: type || 'generic',
      department: department || null,
      capacity_unit: capacity_unit || 'hours',
      capacity_per_day: capacity_per_day !== undefined ? capacity_per_day : 8,
      in_house: in_house !== undefined ? in_house : true,
      active: active !== undefined ? active : true,
      meta: meta || {},
      company_id: req.user ? req.user.company_id : null,
    });
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Tasks (read-only) ────────────────────────────────────────────
router.get('/tasks', async (req, res) => {
  try {
    const where = companyWhere(req);
    if (req.query.board_id) where.board_id = req.query.board_id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.assignee_user_id) where.assignee_user_id = req.query.assignee_user_id;
    const rows = await models.WorkTask.findAll({
      where,
      order: [['board_id', 'ASC'], ['seq', 'ASC']],
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/tasks/:id', async (req, res) => {
  try {
    const row = await models.WorkTask.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Task not found.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── Delete (capacity masters) ────────────────────────────────────
// Tenant-scoped destroys: a row is only removed when it belongs to the
// caller's company (companyWhere adds company_id when present). Returns 404
// if no matching row was deleted so callers don't silently no-op.
router.delete('/teams/:id', async (req, res) => {
  try {
    const count = await models.CapacityTeam.destroy({ where: companyWhere(req, { id: req.params.id }) });
    if (!count) return res.status(404).json({ success: false, message: 'Team not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/workers/:id', async (req, res) => {
  try {
    const count = await models.CapacityWorker.destroy({ where: companyWhere(req, { id: req.params.id }) });
    if (!count) return res.status(404).json({ success: false, message: 'Worker not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/machines/:id', async (req, res) => {
  try {
    const count = await models.CapacityMachine.destroy({ where: companyWhere(req, { id: req.params.id }) });
    if (!count) return res.status(404).json({ success: false, message: 'Machine not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── P1: task lifecycle helpers ───────────────────────────────────────
async function logEvent(taskId, userId, event, extra, companyId) {
  try {
    await models.TaskEvent.create({
      task_id: taskId, user_id: userId || null, at: new Date(),
      meta: Object.assign({ event }, extra || {}), company_id: companyId || null,
    });
  } catch (e) { /* non-fatal */ }
}
async function notify(userId, title, body, entity, companyId) {
  if (!userId) return;
  try {
    await models.AppNotification.create({
      user_id: userId, title, body: body || '', read_at: null,
      entity: entity || null, company_id: companyId || null,
    });
  } catch (e) { /* non-fatal */ }
}

// ── P1: create / assign / check-in / check-out ───────────────────────
router.post('/tasks', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.department) return res.status(400).json({ success: false, message: 'title and department are required' });
    const companyId = req.user && req.user.company_id ? req.user.company_id : null;
    const task = await models.WorkTask.create({
      work_order_id: b.work_order_id || null,
      board_id: b.board_id || null,
      department: b.department,
      seq: Number(b.seq) || 0,
      title: b.title,
      status: b.assignee_user_id ? 'ready' : 'pending',
      assignee_user_id: b.assignee_user_id || null,
      machine_id: b.machine_id || null,
      est_hours: b.est_hours != null ? Number(b.est_hours) : null,
      quality_gate: !!b.quality_gate,
      meta: b.meta || {},
      company_id: companyId,
    });
    await logEvent(task.id, req.user && req.user.id, 'created', { assignee: b.assignee_user_id || null }, companyId);
    if (b.assignee_user_id) await notify(b.assignee_user_id, 'Task assigned: ' + b.title, 'You have been assigned a ' + b.department + ' task.', { task_id: task.id, board_id: b.board_id || null }, companyId);
    return res.status(201).json({ success: true, data: task });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const task = await models.WorkTask.findOne({ where: companyWhere(req, { id: req.params.id }) });
    if (!task) return res.status(404).json({ success: false, message: 'task not found' });
    const b = req.body || {};
    const prevAssignee = task.assignee_user_id;
    const patch = {};
    ['title', 'department', 'status', 'machine_id', 'quality_gate'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; });
    if (b.seq !== undefined) patch.seq = Number(b.seq) || 0;
    if (b.est_hours !== undefined) patch.est_hours = b.est_hours != null ? Number(b.est_hours) : null;
    if (b.assignee_user_id !== undefined) {
      patch.assignee_user_id = b.assignee_user_id || null;
      if (b.assignee_user_id && patch.status === undefined && task.status === 'pending') patch.status = 'ready';
    }
    await task.update(patch);
    await logEvent(task.id, req.user && req.user.id, 'updated', patch, task.company_id);
    if (b.assignee_user_id !== undefined && b.assignee_user_id && b.assignee_user_id !== prevAssignee) {
      await notify(b.assignee_user_id, 'Task assigned: ' + task.title, 'You have been assigned a ' + task.department + ' task.', { task_id: task.id, board_id: task.board_id }, task.company_id);
    }
    return res.json({ success: true, data: task });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/tasks/:id/check-in', async (req, res) => {
  try {
    const task = await models.WorkTask.findOne({ where: companyWhere(req, { id: req.params.id }) });
    if (!task) return res.status(404).json({ success: false, message: 'task not found' });
    await task.update({ status: 'checked_in', started_at: task.started_at || new Date() });
    await logEvent(task.id, req.user && req.user.id, 'check_in', null, task.company_id);
    return res.json({ success: true, data: task });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/tasks/:id/check-out', async (req, res) => {
  try {
    const task = await models.WorkTask.findOne({ where: companyWhere(req, { id: req.params.id }) });
    if (!task) return res.status(404).json({ success: false, message: 'task not found' });
    const status = req.body && req.body.status ? req.body.status : 'done';
    await task.update({ status, finished_at: new Date() });
    await logEvent(task.id, req.user && req.user.id, 'check_out', { status, note: (req.body && req.body.note) || null }, task.company_id);
    return res.json({ success: true, data: task });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.get('/my-tasks', async (req, res) => {
  try {
    const rows = await models.WorkTask.findAll({ where: companyWhere(req, { assignee_user_id: req.user.id }), order: [['status', 'ASC'], ['seq', 'ASC']] });
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.get('/tasks/:id/events', async (req, res) => {
  try {
    const rows = await models.TaskEvent.findAll({ where: companyWhere(req, { task_id: req.params.id }), order: [['at', 'ASC']] });
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── P1: in-app notifications (channel-agnostic; in-app bell for v1) ───
router.get('/notifications', async (req, res) => {
  try {
    const rows = await models.AppNotification.findAll({ where: companyWhere(req, { user_id: req.user.id }), limit: 200 });
    rows.sort((a, b) => (a.read_at ? 1 : 0) - (b.read_at ? 1 : 0));
    const unread = rows.filter((r) => !r.read_at).length;
    return res.json({ success: true, data: { items: rows, unread } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const row = await models.AppNotification.findOne({ where: companyWhere(req, { id: req.params.id, user_id: req.user.id }) });
    if (!row) return res.status(404).json({ success: false, message: 'not found' });
    await row.update({ read_at: new Date() });
    return res.json({ success: true, data: row });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await models.AppNotification.update({ read_at: new Date() }, { where: companyWhere(req, { user_id: req.user.id, read_at: null }) });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── P2: deterministic auto-planner (forward-scheduler) ───────────────
router.post('/plan', async (req, res) => {
  try {
    const where = companyWhere(req);
    if (req.body && req.body.board_id) where.board_id = req.body.board_id;
    const tasks = await models.WorkTask.findAll({ where, order: [['board_id', 'ASC'], ['seq', 'ASC']] });
    const operators = await models.CapacityWorker.findAll({ where: companyWhere(req) });
    const machines = await models.CapacityMachine.findAll({ where: companyWhere(req) });
    const plan = planTasks(
      tasks.map((t) => t.toJSON()),
      operators.map((o) => o.toJSON()),
      machines.map((m) => m.toJSON()),
      { startDate: req.body && req.body.startDate },
    );
    if (req.body && req.body.persist) {
      for (const st of plan.tasks) {
        // eslint-disable-next-line no-await-in-loop
        await models.WorkTask.update({ est_start: st.est_start, est_finish: st.est_finish }, { where: companyWhere(req, { id: st.id }) });
      }
    }
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
