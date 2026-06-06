const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const businessAnalyticsController = require('../controllers/businessAnalyticsController');

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin'));

// Full dashboard data
router.get('/dashboard', businessAnalyticsController.getDashboard);

// Individual endpoints
router.get('/kpis', businessAnalyticsController.getKPIs);
router.get('/revenue-trend', businessAnalyticsController.getRevenueTrend);
router.get('/profit-vs-cost', businessAnalyticsController.getProfitVsCost);
router.get('/order-pipeline', businessAnalyticsController.getOrderPipeline);
router.get('/top-customers', businessAnalyticsController.getTopCustomers);
router.get('/recent-orders', businessAnalyticsController.getRecentOrders);

// Excel export
router.get('/export-excel', businessAnalyticsController.exportExcel);

module.exports = router;
