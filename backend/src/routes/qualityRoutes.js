const express = require('express');
const router = express.Router();
const qualityController = require('../controllers/qualityController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { requireResource } = require('../middleware/departments');
const multer = require('multer');
const path = require('path');

// Memory storage — buffers go straight to UnifiedFileService
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// All routes require authentication
router.use(authenticate);
router.use(tenantScope);
router.use(requireResource('quality'));

// Get inspection types
router.get('/inspection-types', qualityController.getInspectionTypes);

// Get quality record by project ID
router.get('/project/:projectId', qualityController.getByProjectId);

// Create or update quality record
router.post(
  '/project/:projectId',
  authorize('admin', 'quality'),
  qualityController.createOrUpdate
);

// Upload report
router.post(
  '/project/:projectId/reports',
  authorize('admin', 'quality'),
  upload.single('file'),
  qualityController.uploadReport
);

// Remove report
router.delete(
  '/project/:projectId/reports/:fileIndex',
  authorize('admin', 'quality'),
  qualityController.removeReport
);

// Mark inspection complete
router.post(
  '/project/:projectId/complete',
  authorize('admin', 'quality'),
  qualityController.markComplete
);

// Generate CoC
router.post(
  '/project/:projectId/coc',
  authorize('admin', 'quality'),
  qualityController.generateCoC
);

// ------ Per-job quality routes ---------------------------------------------------------------------------------------------------------------------------------------------------------------

// Save all job quality forms (draft)
router.patch(
  '/project/:projectId/job-forms',
  authorize('admin', 'quality'),
  qualityController.saveJobForms
);

// Mark a single job inspection as complete
router.post(
  '/project/:projectId/job/:jobIndex/complete',
  authorize('admin', 'quality'),
  qualityController.completeJobInspection
);

// Generate per-job CoC PDF
router.post(
  '/project/:projectId/job/:jobIndex/coc',
  authorize('admin', 'quality'),
  qualityController.generateJobCoC
);

// Upload document for a specific checklist item in a job
router.post(
  '/project/:projectId/job/:jobIndex/upload-doc/:itemIndex',
  authorize('admin', 'quality'),
  upload.single('file'),
  qualityController.uploadJobItemDoc
);

module.exports = router;
