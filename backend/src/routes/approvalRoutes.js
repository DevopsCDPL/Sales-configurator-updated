const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireEnterprise } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const approvalController = require('../controllers/approvalController');

router.use(authenticate);
router.use(tenantScope);

router.get('/types', approvalController.getTypes);
router.get('/pending-count', approvalController.getPendingCount);
router.get('/', approvalController.getAll);
router.get('/:id', approvalController.getById);
router.post('/', approvalController.create);
router.post('/:id/approve', requireEnterprise('approvals'), approvalController.approve);
router.post('/:id/reject', requireEnterprise('approvals'), approvalController.reject);
router.post('/:id/cancel', approvalController.cancel);

module.exports = router;
