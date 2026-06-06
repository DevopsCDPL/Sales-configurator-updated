const partService = require('../services/partService');
const { Part } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

class PartController {
  // ── Lookup endpoints (static data) ─────────────────────────────
  getMaterialCategories(req, res) {
    res.json({ success: true, data: partService.getMaterialCategories() });
  }

  getGrades(req, res) {
    const { category } = req.params;
    res.json({ success: true, data: partService.getGradesForCategory(category) });
  }

  getForms(req, res) {
    res.json({ success: true, data: partService.getForms() });
  }

  getShapes(req, res) {
    const { form } = req.params;
    res.json({ success: true, data: partService.getShapesForForm(form) });
  }

  // ── CRUD endpoints ─────────────────────────────────────────────
  async getAll(req, res) {
    try {
      const parts = await partService.getAll(req.query, req.user);
      res.json({ success: true, data: parts });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getById(req, res) {
    try {
      const part = await partService.getById(req.params.id);
      if (!verifyTenantRecord(req, part)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: part });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async create(req, res) {
    try {
      const part = await partService.create(req.body, req.user);
      res.status(201).json({ success: true, data: part });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async update(req, res) {
    try {
      const part = await partService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data: part });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async delete(req, res) {
    try {
      const existing = await Part.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Part not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const result = await partService.delete(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async toggleStatus(req, res) {
    try {
      const existing = await Part.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Part not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const part = await partService.toggleStatus(req.params.id);
      res.json({ success: true, data: part });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async duplicate(req, res) {
    try {
      const existing = await Part.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Part not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const part = await partService.duplicate(req.params.id, req.user);
      res.status(201).json({ success: true, data: part });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

module.exports = new PartController();
