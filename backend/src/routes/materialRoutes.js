const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const materialController = require('../controllers/materialController');

router.use(authenticate);
router.use(tenantScope);

router.get('/', materialController.getAll);
router.get('/:id', materialController.getById);
router.get('/:id/vendors', materialController.getVendorMappings);
router.post('/', authorize('main_admin', 'admin'), materialController.create);
router.put('/:id', authorize('main_admin', 'admin'), materialController.update);
router.delete('/:id', authorize('main_admin', 'admin'), materialController.delete);
router.patch('/:id/toggle-status', authorize('main_admin', 'admin'), materialController.toggleStatus);

module.exports = router;
