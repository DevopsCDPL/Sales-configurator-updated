const vendorProcurementService = require('../services/vendorProcurementService');
const multer = require('multer');
const { processUpload } = require('../services/unifiedFileService');

// Memory storage — buffers go straight to UnifiedFileService
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Resolve the active company_id from the tenant scope with fallback to user.
function resolveTenantUser(req) {
  const companyId = req.tenantScope?.company_id || req.user?.company_id || null;
  return { ...(req.user || {}), company_id: companyId };
}

function formatDbError(err) {
  if (!err) return 'Unknown error';
  if (err.name === 'SequelizeValidationError' && Array.isArray(err.errors) && err.errors.length) {
    return err.errors.map(e => `${e.path}: ${e.message}`).join('; ');
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    const detail = err.original?.detail || err.parent?.detail;
    if (detail) return `Duplicate value: ${detail}`;
    const fields = err.errors?.map(e => e.path).join(', ');
    return fields ? `Duplicate value for: ${fields}` : 'Duplicate value';
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return `Invalid reference: ${err.original?.detail || err.message}`;
  }
  if (err.original?.detail) return err.original.detail;
  if (err.parent?.detail) return err.parent.detail;
  return err.message || 'Database error';
}

class VendorProcurementController {
  get uploadMiddleware() {
    return upload.single('quotation_file');
  }

  async getProcurementItems(req, res) {
    try {
      const data = await vendorProcurementService.getProcurementItems(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getSuggestedVendors(req, res) {
    try {
      const vendors = await vendorProcurementService.getSuggestedVendors(req.params.materialId);
      res.json({ success: true, data: vendors });
    } catch (err) {
      res.status(404).json({ success: false, message: err.message });
    }
  }

  // --------- RFQ ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async createRFQ(req, res) {
    try {
      const user = resolveTenantUser(req);
      if (!user.company_id) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating an RFQ.',
        });
      }
      const data = { ...req.body };
      let fileResult = null;
      if (req.file) {
        // Process through UnifiedFileService — we need the rfq first for reference_id,
        // so we'll create the RFQ first, then process the file
        data.quotation_file = null; // Will be updated after file processing
      }
      const rfq = await vendorProcurementService.createRFQ(data, user);

      if (req.file) {
        fileResult = await processUpload(req.file, {
          module_type: 'procurement',
          section: 'rfq_quotation',
          reference_id: rfq.id,
          project_id: rfq.project_id || null,
          user,
          description: `RFQ Quotation - ${req.file.originalname}`,
        });
        // Update RFQ with the file URL
        await rfq.update({ quotation_file: fileResult.file_url });
      }
      res.status(201).json({ success: true, data: rfq });
    } catch (err) {
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async updateRFQ(req, res) {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.quotation_file = null; // Will be updated after file processing
      }
      const rfq = await vendorProcurementService.updateRFQ(req.params.id, data);

      if (req.file) {
        const fileResult = await processUpload(req.file, {
          module_type: 'procurement',
          section: 'rfq_quotation',
          reference_id: rfq.id,
          project_id: rfq.project_id || null,
          user: req.user,
          description: `RFQ Quotation - ${req.file.originalname}`,
        });
        await rfq.update({ quotation_file: fileResult.file_url });
      }
      res.json({ success: true, data: rfq });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteRFQ(req, res) {
    try {
      const result = await vendorProcurementService.deleteRFQ(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async selectVendor(req, res) {
    try {
      const rfq = await vendorProcurementService.selectVendor(req.params.id);
      res.json({ success: true, data: rfq });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // --------- Vendor PO ------------------------------------------------------------------------------------------------------------------------------------------------
  async generatePO(req, res) {
    try {
      const user = resolveTenantUser(req);
      if (!user.company_id) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating a PO.',
        });
      }
      const po = await vendorProcurementService.generatePO(req.body, user);
      res.status(201).json({ success: true, data: po });
    } catch (err) {
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async updatePO(req, res) {
    try {
      const po = await vendorProcurementService.updatePO(req.params.id, req.body);
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getPOById(req, res) {
    try {
      const po = await vendorProcurementService.getPOById(req.params.id);
      if (!po) return res.status(404).json({ success: false, message: 'PO not found' });
      res.json({ success: true, data: po });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getAllPOs(req, res) {
    try {
      const pos = await vendorProcurementService.getAllPOs(req.query, req.user);
      res.json({ success: true, data: pos });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // --------- RFQ Bundle (Multi-Part RFQ System) ---------------------------------------------------------------------

  async getVendorSuppliedParts(req, res) {
    try {
      const parts = await vendorProcurementService.getVendorSuppliedParts(req.params.projectId, req.user);
      res.json({ success: true, data: parts });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRFQBundles(req, res) {
    try {
      const bundles = await vendorProcurementService.getRFQBundles(req.query, req.user);
      res.json({ success: true, data: bundles });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRFQBundleById(req, res) {
    try {
      const bundle = await vendorProcurementService.getRFQBundleById(req.params.id);
      if (!bundle) return res.status(404).json({ success: false, message: 'RFQ not found' });
      res.json({ success: true, data: bundle });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createRFQBundle(req, res) {
    try {
      const bundle = await vendorProcurementService.createRFQBundle(req.body, req.user);
      res.status(201).json({ success: true, data: bundle });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async updateRFQBundle(req, res) {
    try {
      const bundle = await vendorProcurementService.updateRFQBundle(req.params.id, req.body);
      res.json({ success: true, data: bundle });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteRFQBundle(req, res) {
    try {
      const result = await vendorProcurementService.deleteRFQBundle(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async duplicateRFQBundle(req, res) {
    try {
      const bundle = await vendorProcurementService.duplicateRFQBundle(req.params.id, req.user);
      res.status(201).json({ success: true, data: bundle });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendRFQToVendor(req, res) {
    try {
      const bundle = await vendorProcurementService.sendRFQToVendor(req.params.id, req.user);
      const emailActuallySent = bundle._emailActuallySent;
      // Remove internal flag before sending response
      if (bundle._emailActuallySent !== undefined) delete bundle._emailActuallySent;
      res.json({ success: true, data: bundle, emailSent: emailActuallySent });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // --------- Vendor Purchase Order (from approved RFQ bundle) ---------------------------

  async getVendorPurchaseOrders(req, res) {
    try {
      const pos = await vendorProcurementService.getVendorPurchaseOrders(req.query, req.user);
      res.json({ success: true, data: pos });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getVendorPurchaseOrderById(req, res) {
    try {
      const po = await vendorProcurementService.getVendorPurchaseOrderById(req.params.id);
      if (!po) return res.status(404).json({ success: false, message: 'Purchase Order not found' });
      res.json({ success: true, data: po });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createVendorPurchaseOrder(req, res) {
    try {
      const user = resolveTenantUser(req);
      if (!user.company_id) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating a PO.',
        });
      }
      const data = { ...req.body };
      // Parse items from JSON string when sent via FormData
      if (typeof data.items === 'string') {
        try { data.items = JSON.parse(data.items); } catch (e) { data.items = []; }
      }
      if (req.file) {
        data.quotation_file = null; // Will be updated after file processing
      }
      const po = await vendorProcurementService.createVendorPurchaseOrder(data, user);

      if (req.file) {
        const fileResult = await processUpload(req.file, {
          module_type: 'procurement',
          section: 'vendor_po_quotation',
          reference_id: po.id,
          project_id: po.project_id || null,
          user,
          description: `Vendor PO Quotation - ${req.file.originalname}`,
        });
        await po.update({ quotation_file: fileResult.file_url });
      }
      res.status(201).json({ success: true, data: po });
    } catch (err) {
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async updateVendorPurchaseOrder(req, res) {
    try {
      const data = { ...req.body };
      // Parse items from JSON string when sent via FormData
      if (typeof data.items === 'string') {
        try { data.items = JSON.parse(data.items); } catch (e) { data.items = []; }
      }
      if (req.file) {
        data.quotation_file = null; // Will be updated after file processing
      }
      const po = await vendorProcurementService.updateVendorPurchaseOrder(req.params.id, data);

      if (req.file) {
        const fileResult = await processUpload(req.file, {
          module_type: 'procurement',
          section: 'vendor_po_quotation',
          reference_id: po.id,
          project_id: po.project_id || null,
          user: req.user,
          description: `Vendor PO Quotation - ${req.file.originalname}`,
        });
        await po.update({ quotation_file: fileResult.file_url });
      }
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteVendorPurchaseOrder(req, res) {
    try {
      const result = await vendorProcurementService.deleteVendorPurchaseOrder(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendVendorPOToVendor(req, res) {
    try {
      const po = await vendorProcurementService.sendVendorPOToVendor(req.params.id, req.user);
      const emailActuallySent = po._emailActuallySent;
      if (po._emailActuallySent !== undefined) delete po._emailActuallySent;
      res.json({ success: true, data: po, emailSent: emailActuallySent });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async rateVendorPurchaseOrder(req, res) {
    try {
      const po = await vendorProcurementService.rateVendorPurchaseOrder(req.params.id, req.body);
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // --------- PDF Downloads ------------------------------------------------------------------------------------------------------------------------------------

  async downloadRFQBundlePdf(req, res) {
    try {
      const { buffer, filename, projectId } = await vendorProcurementService.generateRFQBundlePdf(req.params.id);
      const { processGeneratedPdf } = require('../services/unifiedFileService');

      if (projectId) {
        try {
          await processGeneratedPdf({
            buffer,
            fileName: filename,
            project_id: projectId,
            section: 'rfq',
            userId: req.user?.id,
            companyId: req.user?.company_id,
            description: `RFQ Bundle - ${filename}`,
          });
        } catch (e) { console.warn('processGeneratedPdf rfq failed:', e.message); }
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async downloadVendorPOPdf(req, res) {
    try {
      const { buffer, filename, projectId } = await vendorProcurementService.generateVendorPOPdf(req.params.id);
      const { processGeneratedPdf } = require('../services/unifiedFileService');

      if (projectId) {
        try {
          await processGeneratedPdf({
            buffer,
            fileName: filename,
            project_id: projectId,
            section: 'vendor_po',
            userId: req.user?.id,
            companyId: req.user?.company_id,
            description: `Vendor PO - ${filename}`,
          });
        } catch (e) { console.warn('processGeneratedPdf vendor_po failed:', e.message); }
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }
}

module.exports = new VendorProcurementController();
