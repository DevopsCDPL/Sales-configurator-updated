const documentService = require('../services/documentService');
const path = require('path');
const fsSync = require('fs');
const { processUpload } = require('../services/unifiedFileService');
const { Project, Document } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

/** Verify project belongs to the current tenant */
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (!verifyTenantRecord(req, project)) throw Object.assign(new Error('Access denied'), { status: 403 });
  return project;
}

/** Verify document belongs to the current tenant via its parent project */
async function verifyDocumentTenant(req, documentId) {
  const doc = await Document.findByPk(documentId);
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
  if (doc.project_id) await verifyProjectTenant(req, doc.project_id);
  return doc;
}

// Maps document types to friendly download names
const FRIENDLY_NAMES = {
  'quotation': 'Quotation',
  'rfq': 'RFQ',
  'rfq_quotation': 'RFQ',
  'purchase_order': 'PO_from_Client',
  'vendor_po': 'PO_to_Vendor',
  'vendor_po_quotation': 'Vendor_Quotation',
  'invoice': 'Invoice',
  'proforma_invoice': 'Proforma_Invoice',
  'commercial_invoice': 'Commercial_Invoice',
  'work_order': 'Work_Order',
  'coc': 'COC',
  'certificate_of_conformance': 'COC',
  'packing_list': 'Packing_List',
  'tracking_slip': 'Tracking_Slip',
  'inspection_report': 'Inspection_Report',
  'quality_report': 'Quality_Report',
  'drawing': 'Drawing',
  'estimate': 'Estimate',
};

/**
 * Get friendly download filename based on document type
 * For system-generated docs, use friendly name; for uploads use original name
 */
function getFriendlyFilename(document) {
  const docType = (document.document_type || '').toLowerCase();
  const originalName = document.file_name || 'document';
  const ext = path.extname(originalName).toLowerCase() || '.pdf';
  
  // Check if this is a system-generated document type
  const friendlyBase = FRIENDLY_NAMES[docType];
  
  if (friendlyBase) {
    // For system-generated documents, use friendly name
    return `${friendlyBase}${ext}`;
  }
  
  // For uploaded files (not in the mapping), preserve original filename
  return originalName;
}

class DocumentController {
  async getByProjectId(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const filters = {};
      if (req.query.part_id) filters.part_id = req.query.part_id;
      if (req.query.workflow_stage) filters.workflow_stage = req.query.workflow_stage;
      const documents = await documentService.getDocumentsByProjectId(req.params.projectId, filters);
      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async getById(req, res, next) {
    try {
      await verifyDocumentTenant(req, req.params.id);
      const document = await documentService.getDocumentById(req.params.id);
      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async generateQuotation(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const document = await documentService.generateQuotation(req.params.projectId, req.user.id);
      res.status(201).json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async generateWorkOrder(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const document = await documentService.generateWorkOrderDocument(req.params.projectId, req.user.id);
      res.status(201).json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async generateProductionTraveller(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const document = await documentService.generateProductionTraveller(req.params.projectId, req.user.id);
      res.status(201).json({
        success: true,
        data: document
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
      const document = await documentService.generateCoC(req.params.projectId, req.user.id);
      res.status(201).json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async generatePackingList(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      const document = await documentService.generatePackingListPdf(req.params.projectId, req.user.id);
      res.status(201).json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async finalizeDocument(req, res, next) {
    try {
      await verifyDocumentTenant(req, req.params.id);
      const document = await documentService.finalizeDocument(req.params.id);
      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async downloadDocument(req, res, next) {
    try {
      await verifyDocumentTenant(req, req.params.id);
      const document = await documentService.getDocumentById(req.params.id);

      // Use multi-strategy file finder (same as merge pipeline)
      const filePath = await documentService.findDocFile(document.file_path, document.file_name, document);

      // Determine correct content-type from file extension
      const ext = path.extname(document.file_name || '').toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.dwg': 'application/acad',
        '.dxf': 'application/dxf',
        '.step': 'application/step',
        '.stp': 'application/step',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      // Get friendly filename for download
      const downloadFilename = getFriendlyFilename(document);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);

      // Serve the stored file from disk (no regeneration — preserves PDF fidelity)
      if (fsSync.existsSync(filePath)) {
        return res.download(filePath, downloadFilename);
      }

      // File not on disk — regenerate only as last resort
      const buffer = await documentService.regenerateSystemPdfBuffer(document);
      if (buffer) {
        // Save regenerated file back to disk for future requests
        try {
          const saveDir = path.dirname(filePath);
          fsSync.mkdirSync(saveDir, { recursive: true });
          fsSync.writeFileSync(filePath, buffer);
        } catch (_) { /* non-critical */ }
        return res.send(buffer);
      }

      res.status(404).json({
        success: false,
        message: 'Document file not found and could not be regenerated'
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // View document inline (preview in browser)
  async viewDocument(req, res, next) {
    try {
      await verifyDocumentTenant(req, req.params.id);
      const document = await documentService.getDocumentById(req.params.id);
      const filePath = await documentService.findDocFile(document.file_path, document.file_name, document);

      const ext = path.extname(document.file_name || '').toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.dwg': 'application/acad',
        '.dxf': 'application/dxf',
        '.step': 'application/step',
        '.stp': 'application/step',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      // Get friendly filename for viewing
      const viewFilename = getFriendlyFilename(document);
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${viewFilename}"`);

      if (fsSync.existsSync(filePath)) {
        return res.sendFile(filePath);
      }

      const buffer = await documentService.regenerateSystemPdfBuffer(document);
      if (buffer) {
        // Save regenerated file back to disk for future requests
        try {
          const saveDir = path.dirname(filePath);
          fsSync.mkdirSync(saveDir, { recursive: true });
          fsSync.writeFileSync(filePath, buffer);
        } catch (_) { /* non-critical */ }
        return res.send(buffer);
      }

      res.status(404).json({ success: false, message: 'Document file not found' });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  async mergeDocuments(req, res, next) {
    try {
      const { documentIds, projectName } = req.body;
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ success: false, message: 'documentIds array is required.' });
      }
      const { buffer, merged, skipped, totalPages, missingDocs } = await documentService.mergePdfs(documentIds);
      const safeName = (projectName || 'Project').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const fileName = `${safeName}_MergedDocuments.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Access-Control-Expose-Headers', 'X-Merge-Count, X-Merge-Pages, X-Merge-Skipped, X-Merge-Missing-Count, X-Merge-Missing');
      res.setHeader('X-Merge-Count', String(merged));
      res.setHeader('X-Merge-Pages', String(totalPages || 0));
      if (skipped && skipped.length > 0) {
        res.setHeader('X-Merge-Skipped', skipped.join(', '));
      }
      if (Array.isArray(missingDocs) && missingDocs.length > 0) {
        res.setHeader('X-Merge-Missing-Count', String(missingDocs.length));
        // Compact JSON payload for UI: [{id, name, reason}]
        try {
          res.setHeader('X-Merge-Missing', encodeURIComponent(JSON.stringify(missingDocs)));
        } catch (_) { /* header too large \u2014 fall back to count only */ }
      }
      res.send(buffer);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async uploadDocument(req, res, next) {
    try {
      await verifyProjectTenant(req, req.params.projectId);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Unified pipeline: buffer → R2 → Document → File Manager
      const result = await processUpload(req.file, {
        module_type: 'project',
        section: req.body.type || 'other',
        reference_id: req.params.projectId,
        project_id: req.params.projectId,
        part_id: req.body.part_id || null,
        user: req.user,
        description: req.body.description || req.file.originalname,
      });

      res.status(201).json({ success: true, data: result.document });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async deleteDocument(req, res, next) {
    try {
      await verifyDocumentTenant(req, req.params.id);
      const result = await documentService.deleteDocument(req.params.id);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
}

module.exports = new DocumentController();
