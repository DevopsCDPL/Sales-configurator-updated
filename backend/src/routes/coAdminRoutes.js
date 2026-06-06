const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const coAdminController = require('../controllers/coAdminController');

// All routes require authentication
router.use(authenticate);
router.use(tenantScope);

// Check if current user has Co Admin access
router.get('/check-access', coAdminController.checkAccess);

// Owner info and role assignments
router.get('/owner-info', coAdminController.getOwnerInfo);

// Credential management
router.get('/credentials', coAdminController.listCredentials);
router.put('/credentials/:slotKey', coAdminController.updateCredential);

// Role transfer (Owner only)
router.post('/role-otp/generate', coAdminController.generateRoleOTP);
router.post('/transfer-role', coAdminController.transferRole);

// Generate OTP for Super Admin creation (Owner/Co-owner only)
router.post('/otp/generate', coAdminController.generateOTP);

// Verify OTP for Super Admin creation
router.post('/otp/verify', coAdminController.verifyOTP);

// Create Super Admin (OTP verified + user created atomically)
router.post('/create-super-admin', coAdminController.createSuperAdmin);

module.exports = router;
