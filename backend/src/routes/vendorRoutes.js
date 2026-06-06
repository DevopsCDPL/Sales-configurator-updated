const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Get all vendors (all roles - service layer filters by company_id)
router.get('/', vendorController.getAll);

// Get all vendor materials across all vendors (for Estimation dropdown)
router.get('/materials/all', vendorController.getAllMaterials);

// Get vendor by ID (all roles - service layer enforces access)
router.get('/:id', vendorController.getById);

// Create vendor - main_admin and admin only
router.post(
	'/',
	authorize('main_admin', 'admin'),
	validate([
		body('company_name').optional().notEmpty().withMessage('Vendor name cannot be empty'),
		body('vendor_name').optional().notEmpty().withMessage('Vendor name cannot be empty'),
		body('email').optional().isEmail().withMessage('Valid email is required'),
		body('contact_email').optional().isEmail().withMessage('Valid email is required')
	]),
	vendorController.create
);

// Update vendor - main_admin and admin only
router.put(
	'/:id',
	authorize('main_admin', 'admin'),
	validate([
		body('company_name').optional().notEmpty().withMessage('Vendor name cannot be empty'),
		body('vendor_name').optional().notEmpty().withMessage('Vendor name cannot be empty'),
		body('email').optional().isEmail().withMessage('Valid email is required'),
		body('contact_email').optional().isEmail().withMessage('Valid email is required')
	]),
	vendorController.update
);

// Delete vendor - main_admin and admin only
router.delete('/:id', authorize('main_admin', 'admin'), vendorController.delete);

module.exports = router;
