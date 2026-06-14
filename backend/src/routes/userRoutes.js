const express = require('express');
const router = express.Router();
const multer = require('multer');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { passwordStrength } = require('../middleware/passwordPolicy');
const { DEPARTMENT_ROLES } = require('../middleware/departments');
// Roles an admin may assign when creating/updating a user: base roles + the
// 8 department roles (model enum already includes them).
const ROLE_OPTIONS = ['main_admin', 'admin', 'user', 'sales_engineer', ...DEPARTMENT_ROLES];

// Multer for avatar upload (memory storage — stored as base64 in DB)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG files are allowed'));
    }
  },
});

const { tenantScope } = require('../middleware/tenantScope');

// All routes require authentication + tenant scoping
router.use(authenticate);
router.use(tenantScope);

// Profile routes (must come before /:id routes)
router.get('/profile', userController.getProfile);
router.put(
  '/profile',
  validate([
    body('name').optional().isString().withMessage('Name must be a string'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone').optional().isString().withMessage('Phone must be a string'),
    body('position').optional().isString().withMessage('Position must be a string'),
    body('role').optional().isIn(ROLE_OPTIONS).withMessage('Invalid role')
  ]),
  userController.updateProfile
);
router.put('/password', userController.changePassword);

// Avatar (profile picture) routes
router.post('/avatar', avatarUpload.single('avatar'), userController.uploadAvatar);
router.delete('/avatar', userController.deleteAvatar);

// Get all companies (main_admin only)
router.get('/companies', authorize('main_admin'), userController.getCompanies);

// Get user stats (dashboard summary)
router.get('/stats', userController.getStats);

// Get all users (all roles can call this; filtering is role-based in service)
router.get('/', userController.getAll);

// Get user by ID
router.get('/:id', userController.getById);

// Create user (main_admin and admin only; admin can only create sales)
router.post(
  '/',
  authorize('main_admin', 'admin'),
  validate([
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    passwordStrength('password'),
    body('role').isIn(ROLE_OPTIONS).withMessage('Invalid role'),
  ]),
  userController.create
);

// Update user (main_admin and admin only; service enforces access control)
router.put(
  '/:id',
  authorize('main_admin', 'admin'),
  validate([
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(ROLE_OPTIONS).withMessage('Invalid role')
  ]),
  userController.update
);

// Reset password (main_admin and admin only)
router.post(
  '/:id/reset-password',
  authorize('main_admin', 'admin'),
  validate([
    passwordStrength('newPassword'),
  ]),
  userController.resetPassword
);

// Delete (deactivate) user (main_admin and admin only)
router.delete('/:id', authorize('main_admin', 'admin'), userController.delete);

// --------- Security Controls (main_admin and admin) ---------------------------------------------------------------------------------------
router.post('/:id/force-password-reset', authorize('main_admin', 'admin'), userController.forcePasswordReset);
router.post('/:id/toggle-2fa', authorize('main_admin', 'admin'), userController.toggle2FA);
router.post('/:id/lock', authorize('main_admin', 'admin'), userController.lockAccount);
router.post('/:id/unlock', authorize('main_admin', 'admin'), userController.unlockAccount);
router.put('/:id/module-permissions', authorize('main_admin', 'admin'), userController.updateModulePermissions);
router.get('/:id/login-history', authorize('main_admin', 'admin'), userController.getLoginHistory);

// --------- Bulk Operations ------------------------------------------------------------------------------------------------------------------------------------------------------------------
router.post('/bulk/deactivate', authorize('main_admin', 'admin'), userController.bulkDeactivate);
router.post('/bulk/import', authorize('main_admin', 'admin'), userController.bulkImport);
router.post('/invite', authorize('main_admin', 'admin'), userController.inviteUser);

module.exports = router;
