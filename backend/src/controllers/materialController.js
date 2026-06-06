const materialService = require('../services/materialService');
const { MaterialVendorMapping, Vendor, Material } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

class MaterialController {
  async getAll(req, res) {
    try {
      const materials = await materialService.getAllMaterials(req.query, req.user);
      res.json({ success: true, data: materials });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getById(req, res) {
    try {
      const material = await materialService.getMaterialById(req.params.id);
      if (!verifyTenantRecord(req, material)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: material });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getVendorMappings(req, res) {
    try {
      const mat = await Material.findByPk(req.params.id);
      if (!mat) return res.status(404).json({ success: false, message: 'Material not found' });
      if (!verifyTenantRecord(req, mat)) return res.status(403).json({ success: false, message: 'Access denied' });
      const mappings = await MaterialVendorMapping.findAll({
        where: { material_id: req.params.id },
        include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] }],
        order: [['is_default', 'DESC'], ['created_at', 'ASC']],
      });
      res.json({ success: true, data: mappings });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async create(req, res) {
    try {
      const material = await materialService.createMaterial(req.body, req.user);
      res.status(201).json({ success: true, data: material });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async update(req, res) {
    try {
      const material = await materialService.updateMaterial(req.params.id, req.body, req.user);
      res.json({ success: true, data: material });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async delete(req, res) {
    try {
      const result = await materialService.deleteMaterial(req.params.id, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async toggleStatus(req, res) {
    try {
      const existing = await Material.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Material not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const material = await materialService.toggleStatus(req.params.id);
      res.json({ success: true, data: material });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

module.exports = new MaterialController();
