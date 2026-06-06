const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireEnterprise } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const sessionController = require('../controllers/sessionController');

// All routes require authentication
router.use(authenticate);
router.use(tenantScope);

// Current user's sessions
router.get('/me', sessionController.getMySessions);

// Enterprise: Sessions (only Owner/Co-Owner — Super Admin blocked)
router.get('/', requireEnterprise('sessions'), sessionController.getAllSessions);
router.post('/:id/revoke', requireEnterprise('sessions'), sessionController.revokeSession);
router.post('/revoke-all/:userId', requireEnterprise('sessions'), sessionController.revokeAllUserSessions);
router.post('/cleanup', requireEnterprise('sessions'), sessionController.cleanup);
router.get('/suspicious/:userId', requireEnterprise('sessions'), sessionController.checkSuspicious);

module.exports = router;
