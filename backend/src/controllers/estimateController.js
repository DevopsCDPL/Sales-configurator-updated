const estimateService = require('../services/estimateService');
const documentService = require('../services/documentService');
const { Project, Estimate, EstimateItem } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

// Helper: verify a project belongs to the current tenant
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'company_id'] });
  if (!project) return false;
  return verifyTenantRecord(req, project);
}

// Helper: verify an estimate belongs to the current tenant (via its project)
async function verifyEstimateTenant(req, estimateId) {
  const estimate = await Estimate.findByPk(estimateId, { attributes: ['id', 'project_id', 'company_id'] });
  if (!estimate) return false;
  if (estimate.company_id) return verifyTenantRecord(req, estimate);
  return verifyProjectTenant(req, estimate.project_id);
}

// Helper: verify an estimate item belongs to the current tenant (via estimate → project)
async function verifyEstimateItemTenant(req, itemId) {
  const item = await EstimateItem.findByPk(itemId, { attributes: ['id', 'estimate_id'] });
  if (!item) return false;
  return verifyEstimateTenant(req, item.estimate_id);
}

class EstimateController {
  async getByProjectId(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const revision = req.query.revision !== undefined ? parseInt(req.query.revision, 10) : undefined;
      const estimate = await estimateService.getEstimateByProjectId(req.params.projectId, revision);
      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAllByProjectId(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const estimates = await estimateService.getAllEstimatesByProjectId(req.params.projectId);
      res.json({
        success: true,
        data: estimates
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async copyRevision(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { sourceRevision } = req.body;
      const estimate = await estimateService.copyEstimateToNewRevision(
        req.params.projectId,
        sourceRevision !== undefined ? parseInt(sourceRevision, 10) : undefined
      );
      res.status(201).json({
        success: true,
        data: estimate
      });
    } catch (error) {
      let message = 'Error copying revision';
      let statusCode = 400;
      
      if (error.name === 'SequelizeValidationError') {
        if (error.errors && error.errors.length > 0) {
          message = error.errors.map(e => e.message).join(', ');
        } else {
          message = 'Validation failed while copying revision. Please ensure the source estimate is saved and try again.';
        }
      } else if (error.name === 'SequelizeUniqueConstraintError') {
        // All retry attempts in the service layer exhausted --- very rare
        message = 'Could not generate a unique revision number after multiple attempts. Please wait a moment and try again.';
      } else if (error.name === 'SequelizeDatabaseError') {
        message = 'Database error while copying revision. Please try again.';
      } else if (error.message && error.message.includes('not found')) {
        statusCode = 404;
        message = error.message;
      } else if (error.message && error.message !== 'Validation error') {
        message = error.message;
      }
      
      console.error('Copy revision error:', error.name, error.message);
      if (error.parent) console.error('  SQL error:', error.parent.message);
      res.status(statusCode).json({
        success: false,
        message
      });
    }
  }

  async deleteRevision(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const revision = parseInt(req.params.revision, 10);
      const result = await estimateService.deleteRevision(req.params.projectId, revision);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }

  async createOrUpdate(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const estimate = await estimateService.createOrUpdateEstimate(
        req.params.projectId,
        req.body,
        req.user.id
      );
      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async addItem(req, res, next) {
    try {
      if (!(await verifyEstimateTenant(req, req.params.estimateId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const item = await estimateService.addEstimateItem(req.params.estimateId, req.body);
      res.status(201).json({
        success: true,
        data: item
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateItem(req, res, next) {
    try {
      if (!(await verifyEstimateItemTenant(req, req.params.itemId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const item = await estimateService.updateEstimateItem(req.params.itemId, req.body);
      res.json({
        success: true,
        data: item
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteItem(req, res, next) {
    try {
      if (!(await verifyEstimateItemTenant(req, req.params.itemId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const result = await estimateService.deleteEstimateItem(req.params.itemId);
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

  async approve(req, res, next) {
    try {
      if (!(await verifyEstimateTenant(req, req.params.estimateId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const estimate = await estimateService.approveEstimate(req.params.estimateId, req.user.id);
      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getProcessModuleTypes(req, res, next) {
    try {
      const types = estimateService.getProcessModuleTypes();
      res.json({
        success: true,
        data: types
      });
    } catch (error) {
      next(error);
    }
  }

  async calculateProcessCost(req, res, next) {
    try {
      const { moduleType, inputs } = req.body;
      const result = estimateService.calculateProcessCost(moduleType, inputs);
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

  async updateQuotation(req, res, next) {
    try {
      if (!(await verifyEstimateTenant(req, req.params.estimateId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const estimate = await estimateService.updateQuotation(req.params.estimateId, req.body);
      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async generateQuotationPdf(req, res, next) {
    try {
      if (!(await verifyEstimateTenant(req, req.params.estimateId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { buffer, filename, projectId } = await estimateService.generateQuotationPdf(req.params.estimateId);

      // Save as Document record (now routes through UnifiedFileService)
      try {
        await documentService.saveGeneratedPdf(projectId, req.user?.id, 'quotation', buffer, filename);
      } catch (saveErr) {
        console.error('Warning: could not save quotation document record:', saveErr.message);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async sendQuotationToClient(req, res, next) {
    try {
      if (!(await verifyEstimateTenant(req, req.params.estimateId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const result = await estimateService.sendQuotationToClient(req.params.estimateId, req.user);
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
}

module.exports = new EstimateController();
