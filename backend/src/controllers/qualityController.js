const qualityService = require('../services/qualityService');
const documentService = require('../services/documentService');
const { processUpload, processGeneratedPdf } = require('../services/unifiedFileService');
const { Project } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

/** Verify project belongs to the current tenant */
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (!verifyTenantRecord(req, project)) throw Object.assign(new Error('Access denied'), { status: 403 });
  return project;
}

class QualityController {
  async getByProjectId(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const qualityRecord = await qualityService.getQualityRecordByProjectId(req.params.projectId);
      res.json({
        success: true,
        data: qualityRecord
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async createOrUpdate(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const qualityRecord = await qualityService.createOrUpdateQualityRecord(
        req.params.projectId,
        req.body,
        req.user.id
      );
      res.json({
        success: true,
        data: qualityRecord
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async uploadReport(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Unified pipeline: buffer → R2 → Document → File Manager
      const result = await processUpload(req.file, {
        module_type: 'project',
        section: 'inspection_report',
        reference_id: req.params.projectId,
        project_id: req.params.projectId,
        user: req.user,
        description: `Quality Report - ${req.file.originalname}`,
      });

      // Also update QualityRecord.report_files for backward compat
      const qualityRecord = await qualityService.uploadReport(
        req.params.projectId,
        result.file_url,
        req.file.originalname,
        req.user?.id
      );

      res.json({ success: true, data: qualityRecord });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async removeReport(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const qualityRecord = await qualityService.removeReport(
        req.params.projectId,
        parseInt(req.params.fileIndex)
      );
      res.json({
        success: true,
        data: qualityRecord
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async markComplete(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const qualityRecord = await qualityService.markInspectionComplete(
        req.params.projectId,
        req.body
      );
      res.json({
        success: true,
        data: qualityRecord
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async generateCoC(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const { buffer, filename, projectId } = await qualityService.generateCoCPdf(req.params.projectId);

      // Unified pipeline: buffer → R2 → Document → File Manager
      try {
        await processGeneratedPdf({
          buffer,
          fileName: filename,
          project_id: projectId,
          section: 'coc',
          userId: req.user?.id,
          companyId: req.user?.company_id,
          description: `Certificate of Conformance - ${filename}`,
        });
      } catch (saveErr) {
        console.error('Warning: could not save CoC document record:', saveErr.message);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async getInspectionTypes(req, res, next) {
    try {
      const types = qualityService.getInspectionTypes();
      res.json({
        success: true,
        data: types
      });
    } catch (error) {
      next(error);
    }
  }

  // ------ Per-job quality ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async saveJobForms(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const { jobForms } = req.body;
      if (!Array.isArray(jobForms)) {
        return res.status(400).json({ success: false, message: 'jobForms must be an array' });
      }
      const record = await qualityService.saveJobQualityForms(req.params.projectId, jobForms);
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async completeJobInspection(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const record = await qualityService.completeJobInspection(
        req.params.projectId,
        parseInt(req.params.jobIndex)
      );
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async generateJobCoC(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const { buffer, filename, projectId } = await qualityService.generateJobCoCPdf(
        req.params.projectId,
        parseInt(req.params.jobIndex)
      );

      // Unified pipeline
      try {
        await processGeneratedPdf({
          buffer,
          fileName: filename,
          project_id: projectId,
          section: 'coc',
          userId: req.user?.id,
          companyId: req.user?.company_id,
          description: `Job CoC - ${filename}`,
        });
      } catch (saveErr) {
        console.error('Warning: could not save CoC document record:', saveErr.message);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async uploadJobItemDoc(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Unified pipeline: buffer → R2 → Document → File Manager
      const result = await processUpload(req.file, {
        module_type: 'project',
        section: 'inspection_report',
        reference_id: req.params.projectId,
        project_id: req.params.projectId,
        user: req.user,
        description: `Quality Doc - Job ${req.params.jobIndex} Item ${req.params.itemIndex}`,
      });

      // Also update the QualityRecord job checklist for backward compat
      const record = await qualityService.uploadJobItemDoc(
        req.params.projectId,
        parseInt(req.params.jobIndex),
        parseInt(req.params.itemIndex),
        result.file_url,
        req.file.originalname,
        req.user?.id,
        req.file.size
      );

      res.json({ success: true, data: record });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new QualityController();
