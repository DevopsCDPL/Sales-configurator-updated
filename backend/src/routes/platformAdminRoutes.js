const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const platformAdminController = require('../controllers/platformAdminController');
const { authenticate, requirePlatformAdmin } = require('../middleware/auth');

// Multer config for company logo uploads
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dest = path.join(
      process.env.UPLOAD_PATH ? path.resolve(process.env.UPLOAD_PATH) : path.join(__dirname, '..', '..', 'uploads'),
      'logos'
    );
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only JPG, PNG, and SVG files are allowed'));
    cb(null, true);
  }
});

// All routes require platform_admin role
router.use(authenticate, requirePlatformAdmin);

// Dashboard
router.get('/dashboard', platformAdminController.getDashboardStats);

// Company (Tenant) management
router.get('/companies', platformAdminController.getAllCompanies);
router.get('/companies/:id', platformAdminController.getCompanyById);
router.post('/companies', logoUpload.single('logo'), platformAdminController.createCompany);
router.put('/companies/:id', logoUpload.single('logo'), platformAdminController.updateCompany);
router.post('/companies/:id/activate', platformAdminController.activateCompany);
router.post('/companies/:id/deactivate', platformAdminController.deactivateCompany);
router.post('/companies/:id/enter', platformAdminController.enterCompany);
router.post('/companies/:id/reset-password', platformAdminController.resetCompanyAdminPassword);
router.delete('/companies/:id', platformAdminController.deleteCompany);

// Company user management
router.get('/companies/:id/users', platformAdminController.getCompanyUsers);
router.post('/companies/:id/users', platformAdminController.addCompanyUser);
router.put('/companies/:id/users/:userId', platformAdminController.updateCompanyUser);
router.delete('/companies/:id/users/:userId', platformAdminController.deleteCompanyUser);
router.post('/companies/:id/users/bulk-delete', platformAdminController.bulkDeleteCompanyUsers);
router.get('/companies/:id/activity', platformAdminController.getCompanyActivity);

// Platform admin user management
router.get('/users', platformAdminController.getPlatformAdmins);
router.post('/users', platformAdminController.createPlatformAdmin);
router.put('/users/:id', platformAdminController.updatePlatformAdmin);
router.delete('/users/:id', platformAdminController.deletePlatformAdmin);

// Company owners
router.get('/company-owners', platformAdminController.getCompanyOwners);

// Subscription check
router.post('/check-subscriptions', platformAdminController.checkSubscriptions);

// Roles & Permissions overview
router.get('/roles-overview', platformAdminController.getRolesOverview);

// Access Control
router.get('/access-control/users', platformAdminController.getAccessControlUsers);
router.get('/access-control/companies', platformAdminController.getAccessControlCompanies);
router.post('/users/bulk-delete', platformAdminController.bulkDeleteUsers);
router.post('/users/:userId/reset-password', platformAdminController.resetUserPassword);

// User Activity
router.get('/user-activity', platformAdminController.getUserActivity);

module.exports = router;
