const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const materialStockController = require('../controllers/materialStockController');

router.use(authenticate);
router.use(tenantScope);

router.get('/', materialStockController.getAllStock);
router.post('/upsert', authorize('main_admin', 'admin'), materialStockController.upsertStock);

module.exports = router;
