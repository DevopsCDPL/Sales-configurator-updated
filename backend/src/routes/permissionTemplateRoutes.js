const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/permissionTemplateController');
const { authenticate, authorize, requireCoAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', requireCoAdmin, ctrl.create);
router.put('/:id', requireCoAdmin, ctrl.update);
router.post('/:id/clone', requireCoAdmin, ctrl.clone);
router.post('/:id/apply', requireCoAdmin, ctrl.applyToUser);
router.delete('/:id', requireCoAdmin, ctrl.delete);

module.exports = router;
