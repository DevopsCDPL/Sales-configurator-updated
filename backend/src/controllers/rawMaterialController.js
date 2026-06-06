const rawMaterialService = require('../services/rawMaterialService');

class RawMaterialController {
  // ── Lookup endpoints (static catalog data) ─────────────────────
  getCategories(req, res) {
    res.json({ success: true, data: rawMaterialService.getCategories() });
  }

  getGrades(req, res) {
    const { category } = req.params;
    res.json({ success: true, data: rawMaterialService.getGradesForCategory(category) });
  }

  getConditions(req, res) {
    const { category, grade } = req.params;
    res.json({ success: true, data: rawMaterialService.getConditionsForGrade(category, grade) });
  }

  getDensity(req, res) {
    const { category, grade } = req.params;
    const density = rawMaterialService.getDensity(category, grade);
    res.json({ success: true, data: { density } });
  }

  getFormOptions(req, res) {
    res.json({ success: true, data: rawMaterialService.getFormOptions() });
  }

  getShapeForForm(req, res) {
    const { form } = req.params;
    res.json({ success: true, data: { shape: rawMaterialService.getShapeForForm(form) } });
  }

  getCatalog(req, res) {
    res.json({
      success: true,
      data: {
        catalog: rawMaterialService.getCatalog(),
        densityMap: rawMaterialService.getDensityMap(),
      },
    });
  }

  // ── CRUD ───────────────────────────────────────────────────────
  async getAll(req, res) {
    try {
      const data = await rawMaterialService.getAll(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getById(req, res) {
    try {
      const data = await rawMaterialService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async create(req, res) {
    try {
      const data = await rawMaterialService.create(req.body, req.user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async update(req, res) {
    try {
      const data = await rawMaterialService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async delete(req, res) {
    try {
      const result = await rawMaterialService.delete(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async toggleStatus(req, res) {
    try {
      const data = await rawMaterialService.toggleStatus(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async bulkDelete(req, res) {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'No IDs provided' });
      }
      const result = await rawMaterialService.bulkDelete(ids);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async duplicate(req, res) {
    try {
      const data = await rawMaterialService.duplicate(req.params.id, req.user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

module.exports = new RawMaterialController();
