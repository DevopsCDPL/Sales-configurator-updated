const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const companyController = require('../controllers/companyController');
const { authenticate, authorize, requireCoAdmin } = require('../middleware/auth');

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

// Stats --- all roles (returns role-specific data)
router.get('/stats', authenticate, companyController.getStats);

// CRUD --- list/read for co-admin only, write for co-admin only (Administration module)
router.get('/', authenticate, requireCoAdmin, companyController.getAll);
router.get('/:id', authenticate, requireCoAdmin, companyController.getById);
router.post('/', authenticate, requireCoAdmin, logoUpload.single('logo'), companyController.create);
router.put('/:id', authenticate, requireCoAdmin, logoUpload.single('logo'), companyController.update);
router.delete('/:id', authenticate, requireCoAdmin, companyController.delete);

// Enterprise actions --- co-admin only
router.post('/:id/suspend', authenticate, requireCoAdmin, companyController.suspend);
router.post('/:id/reactivate', authenticate, requireCoAdmin, companyController.reactivate);
router.post('/:id/change-plan', authenticate, requireCoAdmin, companyController.changePlan);
router.post('/:id/reset-limit', authenticate, requireCoAdmin, companyController.resetUserLimit);

module.exports = router;
