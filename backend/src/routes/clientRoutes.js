const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Get all clients (all roles - service layer filters by company_id)
router.get('/', clientController.getAll);

// Get client by ID (all roles - service layer enforces access)
router.get('/:id', clientController.getById);

// Create client - main_admin and admin only
router.post(
  '/',
  authorize('main_admin', 'admin'),
  validate([
    body('client_name').notEmpty().withMessage('Client name is required'),
    body('poc_email').optional().isEmail().withMessage('Valid email is required')
  ]),
  clientController.create
);

// Update client - main_admin and admin only
router.put(
  '/:id',
  authorize('main_admin', 'admin'),
  validate([
    body('client_name').optional().notEmpty().withMessage('Client name cannot be empty'),
    body('poc_email').optional().isEmail().withMessage('Valid email is required')
  ]),
  clientController.update
);

// Delete client - main_admin and admin only
router.delete('/:id', authorize('main_admin', 'admin'), clientController.delete);

module.exports = router;
