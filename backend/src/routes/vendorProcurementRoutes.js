const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { requireResource } = require('../middleware/departments');
const { tenantScope } = require('../middleware/tenantScope');
const ctrl = require('../controllers/vendorProcurementController');

router.use(authenticate);
router.use(tenantScope);
// Department RBAC: only procurement-allowed roles (and admins) reach these routes.
router.use(requireResource('procurement'));

// Procurement items overview
router.get('/', ctrl.getProcurementItems);

// Suggested vendors for a material
router.get('/suggested-vendors/:materialId', ctrl.getSuggestedVendors);

// RFQ routes
router.post('/rfq', ctrl.uploadMiddleware, ctrl.createRFQ);
router.put('/rfq/:id', ctrl.uploadMiddleware, ctrl.updateRFQ);
router.delete('/rfq/:id', ctrl.deleteRFQ);
router.patch('/rfq/:id/select', ctrl.selectVendor);

// Vendor PO routes
router.get('/po', ctrl.getAllPOs);
router.get('/po/:id', ctrl.getPOById);
router.post('/po', ctrl.generatePO);
router.put('/po/:id', ctrl.updatePO);

// RFQ Bundle routes (Multi-Part RFQ System)
router.get('/bundles', ctrl.getRFQBundles);
router.get('/bundles/:id', ctrl.getRFQBundleById);
router.post('/bundles', ctrl.createRFQBundle);
router.put('/bundles/:id', ctrl.updateRFQBundle);
router.delete('/bundles/:id', ctrl.deleteRFQBundle);
router.post('/bundles/:id/duplicate', ctrl.duplicateRFQBundle);
router.post('/bundles/:id/send', ctrl.sendRFQToVendor);
router.get('/bundles/:id/pdf', ctrl.downloadRFQBundlePdf);
router.get('/vendor-parts/:projectId', ctrl.getVendorSuppliedParts);

// Vendor Purchase Order routes (from approved RFQ bundles)
router.get('/purchase-orders', ctrl.getVendorPurchaseOrders);
router.get('/purchase-orders/:id', ctrl.getVendorPurchaseOrderById);
router.post('/purchase-orders', ctrl.uploadMiddleware, ctrl.createVendorPurchaseOrder);
router.put('/purchase-orders/:id', ctrl.uploadMiddleware, ctrl.updateVendorPurchaseOrder);
router.delete('/purchase-orders/:id', ctrl.deleteVendorPurchaseOrder);
router.post('/purchase-orders/:id/send', ctrl.sendVendorPOToVendor);
router.patch('/purchase-orders/:id/ratings', ctrl.rateVendorPurchaseOrder);
router.get('/purchase-orders/:id/pdf', ctrl.downloadVendorPOPdf);

module.exports = router;
