const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const settingsController = require('../controllers/settingsController');
const { authenticate, authorize, requireCoAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/logo');
    const fs = require('fs');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `company-logo-temp${ext}`);
  }
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, SVG, WEBP) are allowed'));
    }
  }
});

// All routes require authentication
router.use(authenticate);
router.use(tenantScope);

// GET routes: all authenticated users can view settings
router.get('/', settingsController.getAll);
router.get('/company', settingsController.getCompany);
router.get('/system', settingsController.getSystem);

// Write routes: only co-admin (Owner/Co-Owner/Super Admin/Platform Admin)
router.put('/company', requireCoAdmin, settingsController.updateCompany);
router.post('/company/logo', requireCoAdmin, logoUpload.single('logo'), settingsController.uploadLogo);
router.put('/system', requireCoAdmin, settingsController.updateSystem);

module.exports = router;
