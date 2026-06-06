const salesOrderService = require('../services/salesOrderService');
const documentService = require('../services/documentService');
const { SalesOrder, Project } = require('../models');
const { processUpload } = require('../services/unifiedFileService');
const { verifyTenantRecord } = require('../middleware/tenantScope');

/**
 * Build a useful error message from any thrown error, including Sequelize
 * ValidationError / UniqueConstraintError which otherwise serialize as the
 * unhelpful generic string "Validation error".
 */
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

/** Verify project belongs to the current tenant */
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (!verifyTenantRecord(req, project)) throw Object.assign(new Error('Access denied'), { status: 403 });
  return project;
}

class SalesOrderController {
  async getByProjectId(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const salesOrder = await salesOrderService.getSalesOrderByProjectId(req.params.projectId);
      res.json({
        success: true,
        data: salesOrder
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
      await verifyProjectTenant(req, req.params.projectId);
      const tenantCompanyId =
        (req.tenantScope && req.tenantScope.company_id) ||
        (req.user && req.user.company_id) ||
        null;
      const salesOrder = await salesOrderService.createSalesOrder(
        req.params.projectId,
        req.body,
        { tenantCompanyId }
      );
      res.status(201).json({
        success: true,
        data: salesOrder
      });
    } catch (error) {
      console.error('SalesOrder create failed:', error);
      res.status(400).json({
        success: false,
        message: formatErrorMessage(error)
      });
    }
  }

  async update(req, res, next) {
    try {
      // Verify tenant via the sales order's parent project
      const so = await SalesOrder.findByPk(req.params.id);
      if (!so) return res.status(404).json({ success: false, message: 'Sales order not found' });
      await verifyProjectTenant(req, so.project_id);
      const salesOrder = await salesOrderService.updateSalesOrder(req.params.id, req.body);
      res.json({
        success: true,
        data: salesOrder
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: formatErrorMessage(error)
      });
    }
  }

  async uploadPoDocument(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Unified pipeline: buffer → R2 → Document → File Manager
      const result = await processUpload(req.file, {
        module_type: 'project',
        section: 'purchase_order',
        reference_id: req.params.projectId,
        project_id: req.params.projectId,
        user: req.user,
        description: `PO from Client - ${req.file.originalname}`,
      });

      // Update SalesOrder.customer_po_file for backward compat
      const salesOrder = await salesOrderService.uploadPoFile(
        req.params.projectId,
        result.file_url,
        req.file.originalname,
        req.file.size,
        req.user?.id
      );

      res.json({ success: true, data: salesOrder });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async generatePdf(req, res, next) {
    try {
      // Verify tenant via the sales order's parent project
      const soCheck = await SalesOrder.findByPk(req.params.id);
      if (!soCheck) return res.status(404).json({ success: false, message: 'Sales order not found' });
      await verifyProjectTenant(req, soCheck.project_id);

      const { buffer, filename } = await salesOrderService.generateSalesOrderPdf(req.params.id);

      // Save as Document record so it appears in Documents tab and File Manager
      try {
        const salesOrder = await SalesOrder.findByPk(req.params.id);
        if (salesOrder?.project_id) {
          await documentService.saveGeneratedPdf(salesOrder.project_id, req.user?.id, 'sales_order', buffer, filename);
        }
      } catch (saveErr) {
        console.error('Warning: could not save sales order document record:', saveErr.message);
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
}

module.exports = new SalesOrderController();
