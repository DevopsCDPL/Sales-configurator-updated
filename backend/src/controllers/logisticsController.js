const logisticsService = require('../services/logisticsService');
const documentService = require('../services/documentService');
const { generateDocumentName } = require('../services/documentNamingService');
const { Document, Project, Carrier } = require('../models');
const path = require('path');
const { processUpload, processGeneratedPdf } = require('../services/unifiedFileService');
const { verifyTenantRecord } = require('../middleware/tenantScope');

/** Verify project belongs to the current tenant */
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (!verifyTenantRecord(req, project)) throw Object.assign(new Error('Access denied'), { status: 403 });
  return project;
}

class LogisticsController {
  async getByProjectId(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const logistics = await logisticsService.getLogisticsData(req.params.projectId);
      res.json({
        success: true,
        data: logistics
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getCarriers(req, res, next) {
    try {
      const carriers = await Carrier.findAll({ attributes: ['id', 'carrier'] });
      res.json({
        success: true,
        data: carriers,
      })
    } catch (error) {
      console.log(error.message);
      res.status(500).json({
        success: false,
        message: 'failed to fetch the carrier details',
      })
    }
  }

  async update(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const logistics = await logisticsService.updateLogistics(req.params.projectId, req.body);
      res.json({
        success: true,
        data: logistics
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async markShipped(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      // Pass shipment data directly to markAsShipped
      const project = await logisticsService.markAsShipped(req.params.projectId, req.body);
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

  async closeProject(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const project = await logisticsService.closeProject(req.params.projectId);
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

  async getShipmentMethods(req, res, next) {
    try {
      const methods = logisticsService.getShipmentMethods();
      res.json({
        success: true,
        data: methods
      });
    } catch (error) {
      next(error);
    }
  }

  async generatePackingListPdf(req, res, next) {
    try {
      const projectId = req.params.projectId;
      await verifyProjectTenant(req, projectId);
      const { packingList, jobCount } = req.body;
      const senderUser = {
        name: req.user?.name || req.user?.email || '',
        email: req.user?.email || '',
        position: req.user?.position || '',
      };
      const pdfBuffer = await logisticsService.generatePackingListPdf(
        projectId,
        packingList,
        jobCount || 1,
        senderUser
      );

      // Save via Unified File Service
      let standardizedFilename;
      try {
        const project = await Project.findByPk(projectId);
        const plRef = packingList?.number || project?.po_number || project?.project_name || 'PL';
        const naming = await generateDocumentName({
          documentType: 'packing_list',
          projectName: project?.project_name,
          reference: plRef,
          projectId,
        });
        standardizedFilename = naming.fileName;

        await processGeneratedPdf({
          buffer: pdfBuffer,
          fileName: standardizedFilename,
          project_id: projectId,
          section: 'packing_list',
          userId: req.user?.id,
          companyId: req.user?.company_id,
          description: `Packing List - ${plRef}`,
        });
      } catch (saveErr) {
        console.error('Failed to save packing list document record:', saveErr.message);
      }

      const downloadName = standardizedFilename || `PackingList-${packingList?.number || 'PL'}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': pdfBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(pdfBuffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async uploadTrackingSlip(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Unified pipeline: buffer → R2 → Document → File Manager
      const result = await processUpload(req.file, {
        module_type: 'project',
        section: 'tracking_slip',
        reference_id: req.params.projectId,
        project_id: req.params.projectId,
        user: req.user,
        description: `Tracking Slip - ${req.file.originalname}`,
      });

      res.json({
        success: true,
        data: {
          file_path: result.file_url,
          file_name: result.file_name,
          document_id: result.document_id,
        }
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new LogisticsController();
