const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const procurementController = require('../controllers/procurementController');

router.use(authenticate);
router.use(tenantScope);

// ─── Stats ───────────────────────────────────────────────────────────────────
router.get('/stats', procurementController.getStats);

// ─── RFQ Routes ──────────────────────────────────────────────────────────────
router.get('/rfqs', procurementController.getAllRFQs);
router.get('/rfqs/:id', procurementController.getRFQById);
router.post('/rfqs', authorize('main_admin', 'admin'), procurementController.createRFQ);
router.put('/rfqs/:id', authorize('main_admin', 'admin'), procurementController.updateRFQ);
router.patch('/rfqs/:id/send', authorize('main_admin', 'admin'), procurementController.sendRFQ);
router.delete('/rfqs/:id', authorize('main_admin', 'admin'), procurementController.deleteRFQ);

// ─── Vendor Quote Routes ─────────────────────────────────────────────────────
router.post('/rfqs/:rfqId/quotes', authorize('main_admin', 'admin'), procurementController.addVendorQuote);
router.get('/rfqs/:rfqId/comparison', procurementController.getVendorComparison);

// ─── Purchase Order Routes ───────────────────────────────────────────────────
router.get('/pos', procurementController.getAllPOs);
router.get('/pos/:id', procurementController.getPOById);
router.post('/pos', authorize('main_admin', 'admin'), procurementController.createPO);
router.patch('/pos/:id/issue', authorize('main_admin', 'admin'), procurementController.issuePO);
router.patch('/pos/:id/receive', authorize('main_admin', 'admin'), procurementController.receivePO);
router.delete('/pos/:id', authorize('main_admin', 'admin'), procurementController.deletePO);

module.exports = router;
