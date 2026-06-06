const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { authenticate, authorize, requirePlatformAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// List teams (platform_admin sees all, others see own company)
router.get('/', teamController.getAll);

// Get team by ID
router.get('/:id', teamController.getById);

// Get team activity feed
router.get('/:id/activity', teamController.getActivity);

// Create team (platform_admin, main_admin, admin)
router.post('/',
  authorize('platform_admin', 'main_admin', 'admin'),
  validate([
    body('name').notEmpty().withMessage('Team name is required').isString().trim(),
    body('description').optional().isString().trim(),
    body('company_id').optional().isUUID().withMessage('Invalid company ID'),
    body('members').optional().isArray(),
    body('members.*.user_id').optional().isUUID(),
    body('members.*.role').optional().isIn(['Lead', 'Senior Dev', 'Developer', 'QA', 'Member']),
  ]),
  teamController.create
);

// Update team (platform_admin, main_admin, admin)
router.put('/:id',
  authorize('platform_admin', 'main_admin', 'admin'),
  validate([
    body('name').optional().isString().trim(),
    body('description').optional().isString().trim(),
  ]),
  teamController.update
);

// Delete team (platform_admin, main_admin)
router.delete('/:id',
  authorize('platform_admin', 'main_admin'),
  teamController.delete
);

// Add member (platform_admin, main_admin, admin)
router.post('/:id/members',
  authorize('platform_admin', 'main_admin', 'admin'),
  validate([
    body('user_id').notEmpty().isUUID().withMessage('Valid user ID is required'),
    body('role').optional().isIn(['Lead', 'Senior Dev', 'Developer', 'QA', 'Member']),
  ]),
  teamController.addMember
);

// Update member role (platform_admin, main_admin, admin)
router.put('/:id/members/:userId',
  authorize('platform_admin', 'main_admin', 'admin'),
  validate([
    body('role').notEmpty().isIn(['Lead', 'Senior Dev', 'Developer', 'QA', 'Member']).withMessage('Valid role is required'),
  ]),
  teamController.updateMemberRole
);

// Remove member (platform_admin, main_admin, admin)
router.delete('/:id/members/:userId',
  authorize('platform_admin', 'main_admin', 'admin'),
  teamController.removeMember
);

// Update permissions (platform_admin, main_admin only)
router.put('/:id/permissions',
  authorize('platform_admin', 'main_admin'),
  validate([
    body('permissions').notEmpty().isObject().withMessage('Permissions object is required'),
  ]),
  teamController.updatePermissions
);

module.exports = router;
