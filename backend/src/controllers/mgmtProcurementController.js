const svc = require('../services/mgmtProcurementService');
const { ensureProcurementFolders } = require('./fileManagerController');
const { processGeneratedPdf } = require('../services/unifiedFileService');
const { Document } = require('../models');
const logger = require('../utils/logger');

// Format Sequelize / PG errors into a user-actionable message
function formatDbError(err) {
  if (!err) return 'Unknown error';
  // Sequelize validation: pull the first detailed message
  if (err.name === 'SequelizeValidationError' && Array.isArray(err.errors) && err.errors.length) {
    return err.errors.map(e => `${e.path}: ${e.message}`).join('; ');
  }
  // Unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    const detail = err.original?.detail || err.parent?.detail;
    if (detail) return `Duplicate value: ${detail}`;
    const fields = err.errors?.map(e => e.path).join(', ');
    return fields ? `Duplicate value for: ${fields}` : 'Duplicate value';
  }
  // Foreign key violation
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return `Invalid reference: ${err.original?.detail || err.message}`;
  }
  // Generic DB error with PG detail
  if (err.original?.detail) return err.original.detail;
  if (err.parent?.detail) return err.parent.detail;
  return err.message || 'Database error';
}

class MgmtProcurementController {
  // ─── RFQ ───────────────────────────────────────────────────────────────────

  async getAllRFQs(req, res) {
    try {
      const data = await svc.getAllRFQs(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRFQById(req, res) {
    try {
      const data = await svc.getRFQById(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async createRFQ(req, res) {
    try {
      // Resolve company_id: prefer tenant scope (handles platform-admin viewing
      // a workspace via x-active-company-id header) then fall back to user.
      const companyId = req.tenantScope?.company_id || req.user?.company_id || null;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating an RFQ.',
        });
      }
      const user = { ...req.user, company_id: companyId };
      const data = await svc.createRFQ(req.body, user);

      // data is an array of created RFQs (one per vendor)
      const rfqs = Array.isArray(data) ? data : [data];

      // Send the response first — folder / document bookkeeping below is
      // strictly non-blocking and must not delay (or fail) the RFQ save.
      res.status(201).json({ success: true, data: rfqs, message: `${rfqs.length} RFQ(s) created successfully` });

      // Fire-and-forget: File Manager folder + Document record for each RFQ.
      // Wrapped so a rejection here never becomes an unhandled promise.
      setImmediate(async () => {
        for (const rfq of rfqs) {
          try {
            await ensureProcurementFolders(rfq.id, rfq.rfq_number, companyId);
          } catch (fmErr) {
            logger.warn({ err: fmErr.message, rfqId: rfq.id }, 'RFQ: File Manager folder creation failed (non-blocking)');
          }

          try {
            await Document.create({
              module_type: 'procurement',
              reference_id: rfq.id,
              document_type: 'sent_rfq',
              file_name: `${rfq.rfq_number || 'RFQ'}.pdf`,
              file_path: `generated/${rfq.rfq_number || 'RFQ'}.pdf`,
              status: 'latest',
              file_type: 'generated',
              company_id: companyId,
              generated_by: req.user?.id || null,
              size: 0,
            });
          } catch (docErr) {
            logger.warn({ err: docErr.message, rfqId: rfq.id }, 'RFQ: document creation failed (non-blocking)');
          }
        }
      });
    } catch (err) {
      logger.error({
        err: err.message,
        name: err.name,
        original: err.original?.message,
        detail: err.original?.detail,
        body: req.body,
        userId: req.user?.id,
        companyId: req.user?.company_id,
      }, 'createRFQ error');
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async updateRFQ(req, res) {
    try {
      const data = await svc.updateRFQ(req.params.id, req.body, req.user);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendRFQ(req, res) {
    try {
      const data = await svc.sendRFQ(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteRFQ(req, res) {
    try {
      const force = req.query.force === 'true';
      const data = await svc.deleteRFQ(req.params.id, { force, userId: req.user?.id });
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      const response = { success: false, message: err.message };
      if (err.code === 'HAS_LINKED_POS') {
        response.code = err.code;
        response.linkedPOs = err.linkedPOs;
      }
      res.status(status).json(response);
    }
  }

  async downloadRFQPdf(req, res) {
    try {
      const result = await svc.generateRFQPdf(req.params.id);

      // Unified pipeline: buffer → R2 → Document → File Manager
      try {
        await processGeneratedPdf({
          buffer: result.buffer,
          fileName: result.filename,
          project_id: null,
          section: 'rfq',
          userId: req.user?.id,
          companyId: req.tenantScope?.company_id || req.user?.company_id,
          description: `RFQ PDF - ${result.filename}`,
        });
      } catch (e) { logger.warn({ err: e.message }, 'processGeneratedPdf rfq failed'); }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendRFQEmail(req, res) {
    try {
      const data = await svc.sendRFQEmail(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async copyRFQ(req, res) {
    try {
      const data = await svc.copyRFQ(req.params.id, req.user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async bulkDeleteRFQs(req, res) {
    try {
      const { ids, force } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'ids array is required' });
      }
      const data = await svc.bulkDeleteRFQs(ids, { force: force === true, userId: req.user?.id });
      res.json({ success: true, data });
    } catch (err) {
      const response = { success: false, message: err.message };
      if (err.code === 'HAS_LINKED_POS') {
        response.code = err.code;
        response.rfqsWithPOs = err.rfqsWithPOs;
      }
      res.status(400).json(response);
    }
  }

  // ─── PO ────────────────────────────────────────────────────────────────────

  async getAllPOs(req, res) {
    try {
      const data = await svc.getAllPOs(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPOById(req, res) {
    try {
      const data = await svc.getPOById(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async createPO(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating a PO.',
        });
      }
      const user = { ...req.user, company_id: companyId };
      const data = await svc.createPO(req.body, user);

      // Auto-create File Manager procurement folder
      try {
        await ensureProcurementFolders(data.id, data.po_number, companyId);
      } catch (fmErr) {
        logger.warn({ err: fmErr.message }, 'PO: File Manager folder creation failed (non-blocking)');
      }

      // Create Document record so PO appears in File Manager Procurement tab
      if (companyId) {
        try {
          await Document.create({
            module_type: 'procurement',
            reference_id: data.id,
            document_type: 'approved_po',
            file_name: `${data.po_number || 'PO'}.pdf`,
            file_path: `generated/${data.po_number || 'PO'}.pdf`,
            status: 'latest',
            file_type: 'generated',
            company_id: companyId,
            generated_by: req.user?.id || null,
            size: 0,
          });
        } catch (docErr) {
          logger.warn({ err: docErr.message }, 'PO: document creation failed (non-blocking)');
        }
      }

      res.status(201).json({ success: true, data });
    } catch (err) {
      logger.error({
        err: err.message,
        name: err.name,
        original: err.original?.message,
        detail: err.original?.detail,
        body: req.body,
        userId: req.user?.id,
        companyId: req.user?.company_id,
      }, 'createPO error');
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async copy(req, res) {
    try {
      const companyId = req.tenantScope?.company_id || req.user?.company_id;
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company worksapce before duplicating a PO.'
        });
      }
      const user = { ...req.user, company_id: companyId };
      const data = await svc.copyPO(req.params.id, user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async updatePO(req, res) {
    try {
      const data = await svc.updatePO(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendPO(req, res) {
    try {
      const data = await svc.sendPO(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async downloadPOPdf(req, res) {
    try {
      const result = await svc.generatePOPdf(req.params.id);

      // Unified pipeline: buffer → R2 → Document → File Manager
      try {
        await processGeneratedPdf({
          buffer: result.buffer,
          fileName: result.filename,
          project_id: null,
          section: 'approved_po',
          userId: req.user?.id,
          companyId: req.tenantScope?.company_id || req.user?.company_id,
          description: `PO PDF - ${result.filename}`,
        });
      } catch (e) { logger.warn({ err: e.message }, 'processGeneratedPdf po failed'); }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(result.buffer);
    } catch (err) {
      const status = err.statusCode || (err.message.includes('not found') ? 404 : 500);
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendPOEmail(req, res) {
    try {
      const data = await svc.sendPOEmail(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async markOrdered(req, res) {
    try {
      const data = await svc.markOrdered(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async markReceived(req, res) {
    try {
      const data = await svc.markReceived(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deletePO(req, res) {
    try {
      const data = await svc.deletePO(req.params.id, req.user?.id);
      res.json({ success: true, data });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // ─── Purchased Materials ───────────────────────────────────────────────────

  async getPurchasedMaterials(req, res) {
    try {
      const data = await svc.getPurchasedMaterials(req.query, req.user);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new MgmtProcurementController();
