const projectService = require('../services/projectService');
const { ProjectAnalytics, Project } = require('../models');
const stockService = require('../services/stockService');
const { ensureProjectFolders } = require('./fileManagerController');
const { buildTenantWhere, verifyTenantRecord } = require('../middleware/tenantScope');

class ProjectController {
  async getAll(req, res, next) {
    try {
      const filters = { ...req.query };
      // Inject tenant isolation from middleware
      if (req.tenantScope && req.tenantScope.company_id) {
        filters.company_id = req.tenantScope.company_id;
      }
      const projects = await projectService.getAllProjects(filters);
      res.json({
        success: true,
        data: projects
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const project = await projectService.getProjectById(req.params.id);
      // Verify tenant access
      if (!verifyTenantRecord(req, project)) {
        return res.status(403).json({ success: false, message: 'Access denied: project belongs to another company.' });
      }
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async create(req, res, next) {
    try {
      const project = await projectService.createProject(req.body, req.user);

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false,
        message: error.message
      });
    }
  }

  async update(req, res, next) {
    try {
      // Verify project belongs to tenant before updating
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied: project belongs to another company.' });
      }
      const project = await projectService.updateProject(req.params.id, req.body, req.user.id);
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateStatus(req, res, next) {
    try {
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { status } = req.body;
      const project = await projectService.updateProjectStatus(req.params.id, status);
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async advanceWorkflow(req, res, next) {
    try {
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { completedStep } = req.body;
      const project = await projectService.advanceWorkflow(req.params.id, completedStep);
      res.json({ success: true, data: project });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async delete(req, res, next) {
    try {
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const result = await projectService.deleteProject(req.params.id);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async copy(req, res, next) {
    try {
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const project = await projectService.copyProject(req.params.id, req.user.id);
      res.status(201).json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false,
        message: error.message
      });
    }
  }

  async selectRevision(req, res, next) {
    try {
      const existing = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, existing)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { revision } = req.body;
      const project = await projectService.selectRevision(req.params.id, revision);
      res.json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(error.status || 400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getStatusWorkflow(req, res, next) {
    try {
      const workflow = projectService.getStatusWorkflow();
      res.json({
        success: true,
        data: workflow
      });
    } catch (error) {
      next(error);
    }
  }

  async getNextQuotationNumber(req, res, next) {
    try {
      const companyId = req.user?.company_id || null;
      const number = await projectService.getNextQuotationNumber(companyId);
      res.json({ success: true, data: number });
    } catch (error) {
      next(error);
    }
  }

  async getNextProjectNumber(req, res, next) {
    try {
      const companyId = req.user?.company_id || null;
      const number = await projectService.getNextProjectNumber(companyId);
      res.json({ success: true, data: number });
    } catch (error) {
      next(error);
    }
  }

  /* ------ Project Analytics ------------------------------------------------------------------------------------------------------ */
  async getAnalytics(req, res) {
    try {
      // Verify project belongs to tenant
      const project = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, project)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const rows = await ProjectAnalytics.findAll({
        where: { project_id: req.params.id },
        order: [['created_at', 'ASC']],
      });
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async saveAnalytics(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'items array required' });
      }
      // Verify project belongs to tenant
      const project = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, project)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      await ProjectAnalytics.destroy({ where: { project_id: req.params.id } });
      const records = items.map(i => ({ ...i, project_id: req.params.id }));
      const saved = await ProjectAnalytics.bulkCreate(records);
      res.json({ success: true, data: saved });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async commissionProject(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'items array required' });
      }
      // Verify project belongs to tenant
      const project = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
      if (!verifyTenantRecord(req, project)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      // Save analytics
      await ProjectAnalytics.destroy({ where: { project_id: req.params.id } });
      const records = items.map(i => ({ ...i, project_id: req.params.id }));
      const saved = await ProjectAnalytics.bulkCreate(records);

      // Update stock with unused materials
      for (const item of items) {
        const unusedQty = Number(item.materials_unused) || 0;
        if (unusedQty > 0 && item.part_description) {
          await stockService.addUnusedToStock(
            item.part_description,
            item.material_grade || item.part_description,
            unusedQty,
            req.user
          );
        }
      }

      // Update Material Stock with available materials (material, dimension, qty)
      for (const item of items) {
        const qtyAvailable = Number(item.qty_available) || 0;
        if (qtyAvailable > 0 && item.material_grade) {
          await stockService.updateMaterialStock(
            item.material_grade,
            item.purchased_dimension || '',
            qtyAvailable,
            req.user
          );
        }
      }

      res.json({ success: true, data: saved, message: 'Project commissioned and stock updated' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
}

module.exports = new ProjectController();
