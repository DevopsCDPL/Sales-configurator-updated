const express = require('express');
const router = express.Router();
const estimateController = require('../controllers/estimateController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Get process module types
router.get('/module-types', estimateController.getProcessModuleTypes);

// Calculate process cost (preview)
router.post('/calculate', estimateController.calculateProcessCost);

// Get all estimate revisions for a project
router.get('/project/:projectId/all', estimateController.getAllByProjectId);

// Copy estimate to new revision
router.post('/project/:projectId/copy', estimateController.copyRevision);

// Delete a specific revision
router.delete('/project/:projectId/revision/:revision', estimateController.deleteRevision);

// Get estimate by project ID (optional ?revision=N query param)
router.get('/project/:projectId', estimateController.getByProjectId);

// Create or update estimate
router.post(
  '/project/:projectId',
  validate([
    body('revision').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('Revision must be a non-negative integer'),
    body('raw_material_cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Raw material cost must be a non-negative number'),
    body('overhead_cost').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Overhead cost must be a non-negative number'),
    body('margin_percent').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('Margin percent must be between 0 and 100'),
    body('custom_parts').optional({ checkFalsy: true }).isArray().withMessage('custom_parts must be an array'),
    body('custom_parts.*.job_description').optional({ checkFalsy: true }).isString().withMessage('Each custom part must have a string description'),
    body('custom_parts.*.job_cost_per_unit').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Each custom part cost must be a non-negative number'),
    body('custom_parts.*.quantity').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Each custom part quantity must be a non-negative number'),
    body('custom_parts.*.drawing_part_no').optional({ checkFalsy: true }).isString().withMessage('Each custom part must have a string drawing number'),
    body('custom_parts.*.material').optional({ checkFalsy: true }).isString().withMessage('Each custom part must have a string material'),
    body('custom_parts.*.bulk_order_variable_price').optional().isBoolean(),
    body('custom_parts.*.pricing_tiers').optional().isArray(),
    body('custom_parts.*.pricing_tiers.*.quantity').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('custom_parts.*.pricing_tiers.*.unit_price').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ]),
  estimateController.createOrUpdate
);

// Add estimate item
router.post(
  '/:estimateId/items',
  validate([
    body('module_type').trim().notEmpty().withMessage('Module type is required'),
    body('input_json').optional().isObject().withMessage('input_json must be an object'),
    body('sequence_order').optional().isInt({ min: 0 }).withMessage('sequence_order must be a non-negative integer'),
  ]),
  estimateController.addItem
);

// Update estimate item
router.put('/:estimateId/items/:itemId', estimateController.updateItem);

// Delete estimate item
router.delete('/:estimateId/items/:itemId', estimateController.deleteItem);

// Approve estimate
router.post(
  '/:estimateId/approve',
  authorize('admin', 'user'),
  estimateController.approve
);

// Update quotation details
router.put(
  '/:estimateId/quotation',
  authorize('admin', 'user'),
  estimateController.updateQuotation
);

// Generate quotation PDF
router.get(
  '/:estimateId/quotation/pdf',
  estimateController.generateQuotationPdf
);

// Send quotation to client
router.post(
  '/:estimateId/quotation/send',
  authorize('admin', 'user'),
  estimateController.sendQuotationToClient
);

module.exports = router;
