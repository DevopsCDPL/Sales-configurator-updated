const express = require('express');
const router = express.Router();
const workOrderController = require('../controllers/workOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Create a new work order
router.post('/', workOrderController.createWorkOrder);

// Get work order by project ID
router.get('/project/:projectId', workOrderController.getByProjectId);

// Start production by project ID
router.post('/project/:projectId/start', authorize('admin', 'production'), workOrderController.startProductionByProject);

// Get work order by ID
router.get('/:id', workOrderController.getById);

// Initialize operations from estimate
router.post('/:id/initialize', authorize('admin', 'production'), workOrderController.initializeOperations);

// Start production
router.post('/:id/start', authorize('admin', 'production'), workOrderController.startProduction);

// Update operation
router.patch(
  '/:id/operations/:operationId',
  authorize('admin', 'production'),
  workOrderController.updateOperation
);

// Download production traveller PDF
router.get('/:id/traveller', workOrderController.generateTraveller);

// Download production PDF (full detailed version)
router.get('/:id/production-pdf', workOrderController.generateProductionPdf);

// Update notes
router.patch('/:id/notes', workOrderController.updateNotes);

// Save production forms (per-job data)
router.patch('/:id/production-forms', workOrderController.saveProductionForms);

// Download per-job Production Traveller PDF
router.post('/:id/job-pdf', workOrderController.generateJobPdf);

// Update work order fields (target_date, approved_by, quality_requirements, special_instructions)
router.patch('/:id', workOrderController.updateWorkOrder);

module.exports = router;
