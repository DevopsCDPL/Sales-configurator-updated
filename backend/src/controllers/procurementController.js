const procurementService = require('../services/procurementService');
const { RFQ, VendorPurchaseOrder } = require('../models');
const { verifyTenantRecord } = require('../middleware/tenantScope');

// Resolve the active company_id from the tenant scope (set by tenantScope
// middleware) with fallback to the authenticated user. Platform-admins viewing
// a workspace via x-active-company-id will have user.company_id=null but
// req.tenantScope.company_id set to the active workspace.
function resolveTenantUser(req) {
  const companyId = req.tenantScope?.company_id || req.user?.company_id || null;
  return { ...(req.user || {}), company_id: companyId };
}

// Format Sequelize/PG errors into a user-actionable message.
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

class ProcurementController {
  // ─── RFQ Controllers ───────────────────────────────────────────────────────

  async getAllRFQs(req, res) {
    try {
      const rfqs = await procurementService.getAllRFQs(req.query, req.user);
      res.json({ success: true, data: rfqs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRFQById(req, res) {
    try {
      const rfq = await procurementService.getRFQById(req.params.id);
      if (!verifyTenantRecord(req, rfq)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: rfq });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async createRFQ(req, res) {
    try {
      const user = resolveTenantUser(req);
      if (!user.company_id) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating an RFQ.',
        });
      }
      const rfq = await procurementService.createRFQ(req.body, user);
      res.status(201).json({ success: true, data: rfq });
    } catch (err) {
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async updateRFQ(req, res) {
    try {
      const rfq = await procurementService.updateRFQ(req.params.id, req.body, req.user);
      res.json({ success: true, data: rfq });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async sendRFQ(req, res) {
    try {
      const existing = await RFQ.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'RFQ not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const rfq = await procurementService.sendRFQ(req.params.id);
      res.json({ success: true, data: rfq });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deleteRFQ(req, res) {
    try {
      const existing = await RFQ.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'RFQ not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const result = await procurementService.deleteRFQ(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // ─── Vendor Quote Controllers ──────────────────────────────────────────────

  async addVendorQuote(req, res) {
    try {
      const existing = await RFQ.findByPk(req.params.rfqId);
      if (!existing) return res.status(404).json({ success: false, message: 'RFQ not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const { vendor_id, quotes } = req.body;
      const rfq = await procurementService.addVendorQuote(req.params.rfqId, vendor_id, quotes);
      res.json({ success: true, data: rfq });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async getVendorComparison(req, res) {
    try {
      const existing = await RFQ.findByPk(req.params.rfqId);
      if (!existing) return res.status(404).json({ success: false, message: 'RFQ not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const comparison = await procurementService.getVendorComparison(req.params.rfqId);
      res.json({ success: true, data: comparison });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // ─── Purchase Order Controllers ────────────────────────────────────────────

  async getAllPOs(req, res) {
    try {
      const pos = await procurementService.getAllPOs(req.query, req.user);
      res.json({ success: true, data: pos });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getPOById(req, res) {
    try {
      const po = await procurementService.getPOById(req.params.id);
      if (!verifyTenantRecord(req, po)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async createPO(req, res) {
    try {
      const user = resolveTenantUser(req);
      if (!user.company_id) {
        return res.status(400).json({
          success: false,
          message: 'No active company. Please select a company workspace before creating a PO.',
        });
      }
      const po = await procurementService.createPO(req.body, user);
      res.status(201).json({ success: true, data: po });
    } catch (err) {
      res.status(400).json({ success: false, message: formatDbError(err) });
    }
  }

  async issuePO(req, res) {
    try {
      const existing = await VendorPurchaseOrder.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'PO not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const po = await procurementService.issuePO(req.params.id);
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async receivePO(req, res) {
    try {
      const po = await procurementService.receivePO(req.params.id, req.body, req.user);
      res.json({ success: true, data: po });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  async deletePO(req, res) {
    try {
      const existing = await VendorPurchaseOrder.findByPk(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'PO not found' });
      if (!verifyTenantRecord(req, existing)) return res.status(403).json({ success: false, message: 'Access denied' });
      const result = await procurementService.deletePO(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  }

  // ─── Stats Controller ──────────────────────────────────────────────────────

  async getStats(req, res) {
    try {
      const stats = await procurementService.getStats(req.user);
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new ProcurementController();
