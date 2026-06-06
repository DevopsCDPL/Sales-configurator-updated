const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const ctrl = require('../controllers/mgmtProcurementController');

router.use(authenticate);
router.use(tenantScope);

// ─── RFQ Routes ──────────────────────────────────────────────────────────────
router.get('/rfqs', ctrl.getAllRFQs);
router.get('/rfqs/:id', ctrl.getRFQById);
router.post('/rfqs', authorize('main_admin', 'admin', 'procurement'), ctrl.createRFQ);
router.put('/rfqs/:id', authorize('main_admin', 'admin', 'procurement'), ctrl.updateRFQ);
router.patch('/rfqs/:id/send', authorize('main_admin', 'admin', 'procurement'), ctrl.sendRFQ);
router.delete('/rfqs/:id', authorize('main_admin', 'admin', 'procurement'), ctrl.deleteRFQ);
router.get('/rfqs/:id/pdf', ctrl.downloadRFQPdf);
router.post('/rfqs/:id/email', authorize('main_admin', 'admin', 'procurement'), ctrl.sendRFQEmail);
router.post('/rfqs/:id/copy', authorize('main_admin', 'admin', 'procurement'), ctrl.copyRFQ);
router.post('/rfqs/bulk-delete', authorize('main_admin', 'admin', 'procurement'), ctrl.bulkDeleteRFQs);

// ─── PO Routes ───────────────────────────────────────────────────────────────
router.get('/pos', ctrl.getAllPOs);
router.get('/pos/:id', ctrl.getPOById);
router.post('/pos', authorize('main_admin', 'admin', 'procurement'), ctrl.createPO);
router.put('/pos/:id', authorize('main_admin', 'admin', 'procurement'), ctrl.updatePO);
router.patch('/pos/:id/send', authorize('main_admin', 'admin', 'procurement'), ctrl.sendPO);
router.patch('/pos/:id/ordered', authorize('main_admin', 'admin', 'procurement'), ctrl.markOrdered);
router.patch('/pos/:id/received', authorize('main_admin', 'admin', 'procurement'), ctrl.markReceived);
router.post('/pos/:id/copy', authorize('main_admin', 'admin', 'procurement'), ctrl.copy);
router.delete('/pos/:id', authorize('main_admin', 'admin', 'procurement'), ctrl.deletePO);
router.get('/pos/:id/pdf', ctrl.downloadPOPdf);
router.post('/pos/:id/email', authorize('main_admin', 'admin', 'procurement'), ctrl.sendPOEmail);

// ─── Purchased Materials ─────────────────────────────────────────────────────
router.get('/purchased-materials', ctrl.getPurchasedMaterials);

module.exports = router;
