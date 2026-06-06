const businessAnalyticsService = require('../services/businessAnalyticsService');
const excelExportService = require('../services/excelExportService');

class BusinessAnalyticsController {
  async getDashboard(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) {
        dateFilter = { from, to };
      }
      const data = await businessAnalyticsService.getDashboard(companyId, dateFilter);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getKPIs(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getKPIs(companyId, dateFilter);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRevenueTrend(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getRevenueTrend(companyId, dateFilter);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getProfitVsCost(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getProfitVsCost(companyId, dateFilter);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getOrderPipeline(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getOrderPipeline(companyId, dateFilter);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getTopCustomers(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to, limit } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getTopCustomers(companyId, dateFilter, parseInt(limit) || 10);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async getRecentOrders(req, res) {
    try {
      const companyId = req.user.company_id;
      const { period, from, to, limit } = req.query;
      let dateFilter = period || 'all';
      if (period === 'custom' && from && to) dateFilter = { from, to };
      const data = await businessAnalyticsService.getRecentOrders(companyId, dateFilter, parseInt(limit) || 20);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
  async exportExcel(req, res) {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ success: false, message: 'Both from and to dates are required' });
      }
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ success: false, message: 'Dates must be in YYYY-MM-DD format' });
      }
      if (new Date(from) > new Date(to)) {
        return res.status(400).json({ success: false, message: 'From date must be before To date' });
      }

      const companyId = req.user.role === 'platform_admin' ? null : req.user.company_id;
      const buffer = await excelExportService.generateReport(from, to, companyId);
      if (!buffer) {
        return res.status(404).json({ success: false, message: 'No data available for selected date range' });
      }

      const filename = `Forge_Business_Report_${from}_${to}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error('Excel export error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new BusinessAnalyticsController();
