const express = require('express');
const router = express.Router();
const logisticsController = require('../controllers/logisticsController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const multer = require('multer');
const path = require('path');

// Memory storage — buffers go straight to UnifiedFileService
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// All routes require authentication
router.use(authenticate);
router.use(tenantScope);

// get carriers
router.get('/carriers', logisticsController.getCarriers);

// Get shipment methods
router.get('/shipment-methods', logisticsController.getShipmentMethods);

// Get logistics data by project ID
router.get('/project/:projectId', logisticsController.getByProjectId);

// Update logistics
router.put(
  '/project/:projectId',
  authorize('admin', 'logistics'),
  logisticsController.update
);

// Mark as shipped
router.post(
  '/project/:projectId/ship',
  authorize('admin', 'logistics'),
  logisticsController.markShipped
);

// Close project
router.post(
  '/project/:projectId/close',
  authorize('admin'),
  logisticsController.closeProject
);

// Generate packing list PDF
router.post(
  '/project/:projectId/packing-list-pdf',
  logisticsController.generatePackingListPdf
);

// Upload tracking slip
router.post(
  '/project/:projectId/tracking-slip',
  upload.single('file'),
  logisticsController.uploadTrackingSlip
);

module.exports = router;
