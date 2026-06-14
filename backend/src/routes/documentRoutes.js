const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { createDocumentSnapshot } = require('../services/documentDataMapper/documentSnapshotService');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Memory storage — buffers go straight to UnifiedFileService
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.step', '.stp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, images, Office docs, CAD files'));
    }
  }
});

// All routes require authentication + tenant scoping
router.use(authenticate);
const { tenantScope } = require('../middleware/tenantScope');
router.use(tenantScope);

// Get documents by project ID
router.get('/project/:projectId', documentController.getByProjectId);

// Structured document data via the DocumentDataMapper (single source of truth).
// documentType: work_order | production | coc | invoice | rfq | vendor_po
router.get('/data/:documentType/:projectId', async (req, res) => {
  try {
    const snap = await createDocumentSnapshot(req.params.projectId, req.params.documentType);
    if (!snap) return res.status(404).json({ success: false, message: 'No data for that document type / project.' });
    res.json({ success: true, data: snap });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get document by ID
router.get('/:id', documentController.getById);

// View document inline (preview in browser)
router.get('/:id/view', documentController.viewDocument);

// Download document
router.get('/:id/download', documentController.downloadDocument);

// Generate quotation
router.post(
  '/project/:projectId/quotation',
  authorize('admin', 'user'),
  documentController.generateQuotation
);

// Generate work order document
router.post(
  '/project/:projectId/work-order',
  authorize('admin', 'production'),
  documentController.generateWorkOrder
);

// Generate production traveller
router.post(
  '/project/:projectId/traveller',
  authorize('admin', 'production'),
  documentController.generateProductionTraveller
);

// Generate Certificate of Conformance
router.post(
  '/project/:projectId/coc',
  authorize('admin', 'quality'),
  documentController.generateCoC
);

// Generate packing list
router.post(
  '/project/:projectId/packing-list',
  authorize('admin', 'logistics'),
  documentController.generatePackingList
);

// Upload document to project
router.post(
  '/project/:projectId/upload',
  upload.single('file'),
  documentController.uploadDocument
);

// Finalize document
router.patch(
  '/:id/finalize',
  authorize('admin'),
  documentController.finalizeDocument
);

// Merge multiple documents into one PDF (server-side)
router.post('/merge', documentController.mergeDocuments);

// Delete document
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
