const analyticsService = require('../services/analyticsService');

const analyticsController = {
  async getPlatformAnalytics(req, res) {
    try {
      // Only platform_admin can see platform-wide analytics
      if (req.user.role !== 'platform_admin') {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      const data = await analyticsService.getPlatformAnalytics();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getCompanyAnalytics(req, res) {
    try {
      let companyId = req.params.companyId || req.user.company_id;
      // Non-platform_admin can only view their own company analytics
      if (req.user.role !== 'platform_admin' && req.user.company_id) {
        companyId = req.user.company_id;
      }
      if (!companyId) return res.status(400).json({ success: false, message: 'Company ID required' });
      const data = await analyticsService.getCompanyAnalytics(companyId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getActivityTimeline(req, res) {
    try {
      let companyId = req.params.companyId || req.user.company_id;
      // Non-platform_admin can only view their own company timeline
      if (req.user.role !== 'platform_admin' && req.user.company_id) {
        companyId = req.user.company_id;
      }
      const { page = 1, limit = 30 } = req.query;
      const data = await analyticsService.getActivityTimeline(
        companyId, { page: parseInt(page), limit: parseInt(limit) }
      );
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getGlobalTimeline(req, res) {
    try {
      // Only platform_admin can see global timeline
      if (req.user.role !== 'platform_admin') {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      const { page = 1, limit = 50, action } = req.query;
      const data = await analyticsService.getGlobalActivityTimeline({
        page: parseInt(page), limit: parseInt(limit), action,
      });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = analyticsController;
