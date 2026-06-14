const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { requireResource } = require('../middleware/departments');
const analyticsController = require('../controllers/analyticsController');

router.use(authenticate);
router.use(tenantScope);
router.use(requireResource('analytics'));

// Platform-wide analytics (Super Admin only)
router.get('/platform', authorize('main_admin'), analyticsController.getPlatformAnalytics);

// Company analytics
router.get('/company/:companyId', authorize('main_admin', 'admin'), analyticsController.getCompanyAnalytics);
router.get('/company', authorize('main_admin', 'admin'), analyticsController.getCompanyAnalytics);

// Activity timeline
router.get('/timeline/global', authorize('main_admin'), analyticsController.getGlobalTimeline);
router.get('/timeline/:companyId', authorize('main_admin', 'admin'), analyticsController.getActivityTimeline);
router.get('/timeline', authorize('main_admin', 'admin'), analyticsController.getActivityTimeline);

module.exports = router;
