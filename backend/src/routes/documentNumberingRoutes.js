const express = require('express');
const router = express.Router();
const documentNumberingController = require('../controllers/documentNumberingController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// All routes require authentication + admin role minimum
router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin'));

// Initialize document numbering system
router.post('/initialize', documentNumberingController.initialize);

// Get all configurations (grouped by category) - must come before /:documentType
router.get('/', documentNumberingController.getAll);

// Bulk get all configurations (flat) - must come before /:documentType
router.get('/all-configs', documentNumberingController.getAllConfigurations);

// Parameterized routes - more specific ones first
// Preview route must come before GET /:documentType to avoid being caught by parameter
router.get('/:documentType/preview', documentNumberingController.getPreview);

// Generate route must come before GET /:documentType
router.post('/:documentType/generate', documentNumberingController.generateNumber);

// Generic parameterized routes - must come last
router.get('/:documentType', documentNumberingController.getConfiguration);
router.put('/:documentType', documentNumberingController.saveConfiguration);

module.exports = router;
