const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireEnterprise } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const riskController = require('../controllers/riskController');

router.use(authenticate);
router.use(tenantScope);
// Risk Dashboard: accessible to Owner/Co-Owner AND Super Admin
router.use(requireEnterprise('risk'));

router.get('/', riskController.getAll);
router.get('/alerts', riskController.getAlerts);
router.post('/recalculate', authorize('main_admin'), riskController.recalculateAll);
router.get('/company/:companyId', riskController.calculateCompany);
router.get('/user/:userId', riskController.calculateUser);

module.exports = router;
