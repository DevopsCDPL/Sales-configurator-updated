const riskService = require('../services/riskService');

const riskController = {
  async getAll(req, res) {
    try {
      const { entity_type, min_score = 0, page = 1, limit = 20 } = req.query;
      const companyId = req.user.role === 'platform_admin' ? null : req.user.company_id;
      const result = await riskService.getAllRiskScores({
        entityType: entity_type,
        minScore: parseInt(min_score),
        page: parseInt(page),
        limit: parseInt(limit),
        companyId,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async calculateCompany(req, res) {
    try {
      // Non-platform_admin can only calculate for their own company
      const companyId = req.params.companyId;
      if (req.user.role !== 'platform_admin' && req.user.company_id !== companyId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      const result = await riskService.calculateCompanyRisk(companyId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async calculateUser(req, res) {
    try {
      const result = await riskService.calculateUserRisk(req.params.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async recalculateAll(req, res) {
    try {
      const results = await riskService.recalculateAll();
      res.json({ success: true, data: results });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getAlerts(req, res) {
    try {
      const companyId = req.user.role === 'platform_admin' ? null : req.user.company_id;
      const alerts = await riskService.getAlerts(companyId);
      res.json({ success: true, data: alerts });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = riskController;
