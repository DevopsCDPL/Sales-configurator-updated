const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const partController = require('../controllers/partController');
const multer = require('multer');
const path = require('path');
const { processUpload } = require('../services/unifiedFileService');
const { NewDocument, Part } = require('../models');

// UUID v4 format check
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Memory storage — buffers go straight to UnifiedFileService
const drawingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for drawings'));
    }
  }
});

router.use(authenticate);
router.use(tenantScope);

// Lookup endpoints (static material/form data — no DB needed)
router.get('/lookup/categories', partController.getMaterialCategories);
router.get('/lookup/grades/:category', partController.getGrades);
router.get('/lookup/forms', partController.getForms);
router.get('/lookup/shapes/:form', partController.getShapes);

// CRUD
router.get('/', partController.getAll);
router.get('/:id', partController.getById);
router.post('/', authorize('main_admin', 'admin'), partController.create);
router.put('/:id', authorize('main_admin', 'admin'), partController.update);
router.delete('/:id', authorize('main_admin', 'admin'), partController.delete);
router.patch('/:id/toggle-status', authorize('main_admin', 'admin'), partController.toggleStatus);
router.post('/:id/duplicate', authorize('main_admin', 'admin'), partController.duplicate);

// Get presigned download URL for a part's drawing
router.get('/:id/drawing-url', async (req, res) => {
  try {
    const r2 = require('../services/r2StorageService');
    const part = await Part.findOne({
      where: { id: req.params.id, company_id: req.user.company_id },
      attributes: ['id', 'drawing_url'],
    });
    if (!part) return res.status(404).json({ success: false, message: 'Part not found' });
    if (!part.drawing_url) return res.status(404).json({ success: false, message: 'No drawing uploaded for this part' });
    if (!r2.isConfigured) return res.status(503).json({ success: false, message: 'R2 storage not configured' });

    const presignedUrl = await r2.getPresignedUrl(part.drawing_url, 300); // 5-min window
    res.json({ success: true, data: { presigned_url: presignedUrl, r2_key: part.drawing_url } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload drawing (PDF only) — via UnifiedFileService
router.post('/upload-drawing', authorize('main_admin', 'admin'), drawingUpload.single('drawing'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const result = await processUpload(req.file, {
      module_type: 'part_master',
      section: 'drawing',
      reference_id: req.body.part_id || null,
      part_id: req.body.part_id || null,
      user: req.user,
      description: `Drawing - ${req.file.originalname}`,
    });
    // ── PARALLEL: Safe insert into NewDocument (non-blocking) ───
    try {
      // STEP 1: Resolve part UUID
      let resolvedPartId = null;

      const rawPartId = req.body.part_id;
      const partNumber = req.body.part_number || req.body.part_code || null;

      if (rawPartId && UUID_RE.test(rawPartId)) {
        // CASE 1: part_id is already a valid UUID
        resolvedPartId = rawPartId;
      } else if (partNumber) {
        // CASE 2: Look up Part by part_number
        const partRecord = await Part.findOne({ where: { part_number: partNumber }, attributes: ['id'] });
        if (partRecord) resolvedPartId = partRecord.id;
      } else if (rawPartId) {
        // CASE 3: part_id exists but is NOT a UUID — try lookup by part_number
        const partRecord = await Part.findOne({ where: { part_number: rawPartId }, attributes: ['id'] });
        if (partRecord) resolvedPartId = partRecord.id;
      }

      // STEP 2: Validate resolved UUID
      if (!resolvedPartId || !UUID_RE.test(resolvedPartId)) {
        console.warn('[PART] NewDocument skipped — could not resolve part UUID for part_id:', req.body.part_id);
      } else {
        // STEP 3: Insert into NewDocument
        const ndPayload = {
          entity_type: 'part',
          entity_id: resolvedPartId,
          company_id: req.user.company_id,
          created_by: req.user.id,
          document_type: 'drawing',
          file_name: result.file_name,
          r2_key: result.file_url,
          size: req.file.size || null,
        };
        await NewDocument.create(ndPayload);
      }
    } catch (ndErr) {
      // Non-blocking: never crash the main upload
      console.error('[ERROR] NewDocument parallel insert FAILED (non-blocking):', ndErr.message);
      if (ndErr.errors) {
        console.error('[ERROR] Sequelize validation:', JSON.stringify(ndErr.errors.map(e => ({ path: e.path, message: e.message, value: e.value }))));
      }
      if (ndErr.parent) {
        console.error('[ERROR] DB error:', ndErr.parent.message, '| code:', ndErr.parent.code, '| detail:', ndErr.parent.detail);
      }
    }
    // ── END PARALLEL ────────────────────────────────────────────

    res.json({ success: true, data: { url: result.file_url, filename: req.file.originalname, document_id: result.document_id } });
  } catch (err) {
    console.error('[PART] Upload failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
