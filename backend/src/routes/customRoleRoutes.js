const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireEnterprise } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const customRoleController = require('../controllers/customRoleController');

router.use(authenticate);
router.use(tenantScope);

router.get('/schema', customRoleController.getSchema);
router.get('/', customRoleController.getAll);
router.get('/:id', customRoleController.getById);
router.post('/', requireEnterprise('custom-roles'), customRoleController.create);
router.put('/:id', requireEnterprise('custom-roles'), customRoleController.update);
router.delete('/:id', requireEnterprise('custom-roles'), customRoleController.delete);
router.post('/:id/clone', requireEnterprise('custom-roles'), customRoleController.clone);
router.post('/:id/assign', requireEnterprise('custom-roles'), customRoleController.assignToUser);

module.exports = router;
