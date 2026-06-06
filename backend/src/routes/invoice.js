const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const invoiceController = require('../controllers/invoiceController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// 'Tax' is the value sent by the frontend dropdown (displayed as "Tax Invoice");
// 'Tax Invoice' is kept for backwards-compatibility with any existing records.
const INVOICE_TYPES = ['Commercial', 'Proforma', 'Tax Invoice', 'Tax', 'Credit Note'];

// Shared optional rules (safe for both create and update)
const invoiceOptionalRules = () => [
  body('invoice_type').optional().isIn(INVOICE_TYPES)
    .withMessage(`Invoice type must be one of: ${INVOICE_TYPES.join(', ')}`),
  body('invoice_date').optional().isISO8601()
    .withMessage('Invoice date must be a valid date (YYYY-MM-DD)'),
  body('tax_percent').optional().isFloat({ min: 0, max: 100 })
    .withMessage('Tax percent must be a number between 0 and 100'),
  body('shipping_charges').optional().isFloat({ min: 0 })
    .withMessage('Shipping charges must be a non-negative number'),
  body('line_items').optional().isArray()
    .withMessage('Line items must be an array'),
  body('line_items.*.quantity').optional().isFloat({ min: 0 })
    .withMessage('Each line item quantity must be a non-negative number'),
  body('line_items.*.unit_price').optional().isFloat({ min: 0 })
    .withMessage('Each line item unit price must be a non-negative number'),
  body('line_items.*.description').optional().isString()
    .withMessage('Each line item description must be a string'),
  body('project_id').optional().isUUID()
    .withMessage('project_id must be a valid UUID'),
];

const invoiceCreateRules = [
  body('customer_name').trim().notEmpty().withMessage('Customer name is required'),
  ...invoiceOptionalRules(),
];

const invoiceUpdateRules = [
  body('customer_name').optional().trim().notEmpty().withMessage('Customer name cannot be empty'),
  ...invoiceOptionalRules(),
];

// All invoice routes require authentication
router.use(authenticate);
router.use(tenantScope);

// Auto-populate invoice data from project
router.get('/auto-populate/:project_id', invoiceController.getAutoPopulatedData);
// Analytics metrics
router.get('/analytics/metrics', invoiceController.getAnalyticsData);
// Get all invoices
router.get('/all', invoiceController.getAllInvoices);
// Create invoice
router.post('/', authorize('admin', 'user'), validate(invoiceCreateRules), invoiceController.createInvoice);
// Get all invoices for a project
router.get('/project/:project_id', invoiceController.getInvoicesByProject);
// Get single invoice
router.get('/:id', invoiceController.getInvoice);
// Update invoice
router.put('/:id', authorize('admin', 'user'), validate(invoiceUpdateRules), invoiceController.updateInvoice);
// Delete invoice
router.delete('/:id', authorize('admin'), invoiceController.deleteInvoice);
// Generate PDF
router.get('/:id/pdf', invoiceController.generatePdf);

module.exports = router;
