const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { authenticate, requireCoAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// Audit log routes: co-admin only (Administration module)
router.use(authenticate);
router.use(tenantScope);
router.use(requireCoAdmin);

// GET /api/audit-logs - Get audit logs
router.get('/', auditLogController.getAll);

module.exports = router;
