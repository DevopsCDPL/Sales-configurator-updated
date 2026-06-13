'use strict';

/**
 * Capacity Planning + Production Traveller — CRUD skeleton (NOT MOUNTED).
 *
 * Design: docs/capacity-traveler-design.md. Aligns with Phase F §4 (F3
 * Production) and §10 debt #3 (capacity planner automation).
 *
 * STATUS: this router is NOT wired into routes/index.js. It is unreachable
 * at runtime until the owner answers the design questionnaire and someone
 * uncomments these two lines in routes/index.js:
 *
 *     const capacityRoutes = require('./capacityRoutes');
 *     router.use('/capacity', capacityRoutes);
 *
 * Authorization: every route requires an authenticated user, tenant scope,
 * and the 'workorders' department resource (middleware/departments.js).
 * v1 surface = read + create for the capacity masters + read for tasks.
 * Mutation of task state (check-in/out, quality adjudication, the planner)
 * is intentionally OUT of this skeleton — added in P1/P2/P3 once contracts
 * (checklist formats, quality gates, roster) are confirmed.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireResource } = require('../middleware/departments');
const { tenantScope } = require('../middleware/tenantScope');
const models = require('../models');

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

// ── Tasks (read-only in skeleton) ────────────────────────────────
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

module.exports = router;
