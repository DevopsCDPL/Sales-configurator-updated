const workOrderService = require('../services/workOrderService');
const documentService = require('../services/documentService');
const { Project, WorkOrder } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

function formatErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    const details = error.errors
      .map(e => e.message || `${e.path || ''} ${e.type || ''}`.trim())
      .filter(Boolean)
      .join('; ');
    if (details) return details;
  }
  return error.message || 'Unknown error';
}

// Helper: verify a project belongs to the current tenant
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'company_id'] });
  if (!project) return false;
  return verifyTenantRecord(req, project);
}

// Helper: verify a work order belongs to the current tenant (via its project)
async function verifyWorkOrderTenant(req, workOrderId) {
  const wo = await WorkOrder.findByPk(workOrderId, { attributes: ['id', 'project_id', 'company_id'] });
  if (!wo) return false;
  // Check company_id on work order itself, or fall back to parent project
  if (wo.company_id) return verifyTenantRecord(req, wo);
  return verifyProjectTenant(req, wo.project_id);
}

class WorkOrderController {
  async getByProjectId(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrders = await workOrderService.getWorkOrdersByProjectId(req.params.projectId);
      res.json({ success: true, data: workOrders });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async createWorkOrder(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.body.project_id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.createWorkOrder(req.body, req.user);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: formatErrorMessage(error) });
    }
  }

  async getById(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.getWorkOrderById(req.params.id);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async initializeOperations(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.initializeOperations(req.params.id);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateOperation(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.updateOperation(
        req.params.id,
        parseInt(req.params.operationId),
        req.body
      );
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async startProduction(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.startProduction(req.params.id);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async startProductionByProject(req, res, next) {
    try {
      if (!(await verifyProjectTenant(req, req.params.projectId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.startProductionByProjectId(req.params.projectId);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async generateTraveller(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { buffer, filename, projectId } = await workOrderService.generateTravellerPdf(req.params.id);

      // Save as Document record (now routes through UnifiedFileService)
      try {
        await documentService.saveGeneratedPdf(projectId, req.user?.id, 'work_order', buffer, filename);
      } catch (saveErr) {
        console.error('Warning: could not save work order document record:', saveErr.message);
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async generateProductionPdf(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { buffer, filename, projectId } = await workOrderService.generateProductionPdf(req.params.id);

      // Save as Document record (now routes through UnifiedFileService)
      try {
        await documentService.saveGeneratedPdf(projectId, req.user?.id, 'production_traveller', buffer, filename);
      } catch (saveErr) {
        console.error('Warning: could not save production traveller document record:', saveErr.message);
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateNotes(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.updateWorkOrderNotes(req.params.id, req.body.notes);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async updateWorkOrder(req, res, next) {
    try {
      if (!(await verifyWorkOrderTenant(req, req.params.id))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.updateWorkOrder(req.params.id, req.body);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: formatErrorMessage(error) });
    }
  }

  async saveProductionForms(req, res, next) {
    try {
      const workOrderId = req.params.id;
      if (!workOrderId || workOrderId === 'undefined' || workOrderId === 'null') {
        return res.status(400).json({ success: false, message: 'Invalid work order ID' });
      }
      if (!(await verifyWorkOrderTenant(req, workOrderId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const workOrder = await workOrderService.saveProductionForms(workOrderId, req.body.production_forms);
      res.json({ success: true, data: workOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async generateJobPdf(req, res, next) {
    try {
      const workOrderId = req.params.id;
      // Guard against undefined/invalid UUID
      if (!workOrderId || workOrderId === 'undefined' || workOrderId === 'null') {
        return res.status(400).json({ success: false, message: 'Invalid work order ID' });
      }
      if (!(await verifyWorkOrderTenant(req, workOrderId))) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
      const { buffer, filename, projectId } = await workOrderService.generateJobPdf(
        workOrderId,
        req.body.jobIndex,
        req.body.formData,
        req.body.partData,
        req.body.travelerType
      );
      try {
        const userId = req.user?.id || null;
        await documentService.saveGeneratedPdf(projectId, userId, 'production_traveller', buffer, filename);
      } catch (saveErr) {
        console.error('Warning: could not save job PDF document record:', saveErr.message);
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(buffer);
    } catch (error) {
      console.error('generateJobPdf error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new WorkOrderController();
