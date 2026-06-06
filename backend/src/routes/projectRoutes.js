const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Get status workflow
router.get('/workflow', projectController.getStatusWorkflow);

// Get next auto-generated quotation number (for dialog preview)
router.get('/next-quotation-number', projectController.getNextQuotationNumber);

// Get next auto-generated project number (for dialog preview)
router.get('/next-project-number', projectController.getNextProjectNumber);

// Get all projects
router.get('/', projectController.getAll);

// Get project by ID
router.get('/:id', projectController.getById);

// Create project
router.post(
  '/',
  validate([
    body('project_name').trim().notEmpty().withMessage('Project name is required'),
    body('client_id').isUUID().withMessage('Valid client ID is required'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('ship_to_address').optional().isString().withMessage('Ship-to address must be a string'),
    body('delivery_date').optional().isISO8601().withMessage('Delivery date must be a valid date (YYYY-MM-DD)'),
    body('currency').optional().isString().isLength({ max: 10 }).withMessage('Currency must be a string (max 10 chars)'),
  ]),
  projectController.create
);

// Update project
router.put(
  '/:id',
  validate([
    body('project_name').optional().notEmpty().withMessage('Project name cannot be empty'),
    body('client_id').optional().isUUID().withMessage('Valid client ID is required')
  ]),
  projectController.update
);

// Update project status
router.patch(
  '/:id/status',
  validate([
    body('status').isIn([
      'draft', 'estimated', 'quoted', 'order_confirmed',
      'in_production', 'inspected', 'shipped', 'closed'
    ]).withMessage('Invalid status')
  ]),
  projectController.updateStatus
);

// Advance workflow based on completed tab step
router.patch('/:id/advance-workflow', projectController.advanceWorkflow);

// Copy (duplicate) project
router.post('/:id/copy', projectController.copy);

// Select estimate revision for quotation/approval
router.patch('/:id/select-revision', projectController.selectRevision);

// Update production traveler type for a single project
router.patch('/:id/traveler-type', async (req, res) => {
  try {
    const { Project } = require('../models');
    const { production_traveler_type } = req.body;
    if (!['machining_industry', 'anodizing_industry'].includes(production_traveler_type)) {
      return res.status(400).json({ success: false, message: 'Invalid production_traveler_type value' });
    }
    const project = await Project.findByPk(req.params.id, { attributes: ['id', 'company_id'] });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    // Tenant check
    if (req.user.company_id && project.company_id && req.user.company_id !== project.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await project.update({ production_traveler_type });
    res.json({ success: true, data: { id: req.params.id, production_traveler_type } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete project
router.delete('/:id', projectController.delete);

// Project Analytics
router.get('/:id/analytics', projectController.getAnalytics);
router.post('/:id/analytics', projectController.saveAnalytics);
router.post('/:id/commission', projectController.commissionProject);

module.exports = router;
