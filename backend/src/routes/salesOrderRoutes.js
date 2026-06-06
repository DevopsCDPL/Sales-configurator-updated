const express = require('express');
const router = express.Router();
const salesOrderController = require('../controllers/salesOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const multer = require('multer');
const path = require('path');

// Memory storage — buffers go straight to UnifiedFileService
const poUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, images, Word documents'));
    }
  }
});

// All routes require authentication + tenant scoping
router.use(authenticate);
const { tenantScope } = require('../middleware/tenantScope');
router.use(tenantScope);

// Get sales order by project ID
router.get('/project/:projectId', salesOrderController.getByProjectId);

// Upload PO document (must be before the generic POST /project/:projectId)
router.post(
  '/project/:projectId/upload-po',
  authorize('admin', 'user'),
  poUpload.single('po_document'),
  salesOrderController.uploadPoDocument
);

// Create or confirm sales order
router.post(
  '/project/:projectId',
  authorize('admin', 'user'),
  validate([
    body('customer_po_number').optional().isString(),
    body('delivery_date').optional().isISO8601()
  ]),
  salesOrderController.create
);

// Update sales order
router.put(
  '/:id',
  authorize('admin', 'user'),
  salesOrderController.update
);

// Download Sales Order PDF
router.get('/:id/pdf', salesOrderController.generatePdf);

module.exports = router;
