const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { processMessage, getSuggestions, processDocument, getActionHistory } = require('../controllers/aiAssistantController');

// Multer configuration --- keep file in memory buffer for text extraction
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/ai-assistant/message --- Process a user message
router.post('/message', authenticate, tenantScope, processMessage);

// GET /api/ai-assistant/suggestions --- Get page-aware suggestions
router.get('/suggestions', authenticate, tenantScope, getSuggestions);

// POST /api/ai-assistant/document --- Upload & classify a document
router.post('/document', authenticate, tenantScope, upload.single('file'), processDocument);

// GET /api/ai-assistant/action-history --- AI action audit log
router.get('/action-history', authenticate, tenantScope, getActionHistory);

module.exports = router;
