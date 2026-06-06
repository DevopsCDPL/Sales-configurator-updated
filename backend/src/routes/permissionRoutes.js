const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const { authenticate, authorize, requireCoAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

router.use(authenticate);
router.use(tenantScope);

// Get permission definitions (metadata) - all authenticated users
router.get('/definitions', permissionController.getDefinitions);

// All management routes: co-admin only (Administration module)
router.get('/', requireCoAdmin, permissionController.getAll);
router.get('/:role', requireCoAdmin, permissionController.getByRole);
router.put('/:role', requireCoAdmin, permissionController.updatePermission);
router.put('/:role/bulk', requireCoAdmin, permissionController.bulkUpdate);
router.post('/seed', requireCoAdmin, permissionController.seed);

module.exports = router;
