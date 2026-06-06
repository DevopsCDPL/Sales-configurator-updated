const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const stockController = require('../controllers/stockController');
const { Document, FileManagerFolder, Stock, RawMaterial } = require('../models');
const { processUpload } = require('../services/unifiedFileService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Certificate upload — memory storage (buffer sent to UnifiedFileService)
const certUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);
router.use(tenantScope);

router.get('/heat-numbers', stockController.getHeatNumbers);
router.get('/', stockController.getAll);
router.get('/:id', stockController.getById);
router.post('/import', authorize('main_admin', 'admin'), upload.single('file'), stockController.importStock);
router.post('/', authorize('main_admin', 'admin'), stockController.create);
router.post('/bulk', authorize('main_admin', 'admin'), stockController.bulkCreate);
router.put('/:id', authorize('main_admin', 'admin'), stockController.update);
router.delete('/:id', authorize('main_admin', 'admin'), stockController.delete);
router.post('/add-unused', authorize('main_admin', 'admin'), stockController.addUnused);
router.get('/raw-material/:raw_material_id', stockController.getRawMaterialById);

// Upload material certificate for a stock item → registers in File Manager
router.post('/:id/upload-certificate', authorize('main_admin', 'admin'), (req, res, next) => {
  certUpload.single('certificate')(req, res, (err) => {
    if (err) {
      console.error('Multer certificate upload error:', err);
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20MB)' : err.message || 'File upload failed';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const stockUuid = req.params.id;

    // Fetch stock + rawMaterial to build the display filename
    const stock = await Stock.findByPk(stockUuid, {
      include: [{ model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'material_id'], required: false }],
    });
    if (!stock) return res.status(404).json({ success: false, message: 'Stock not found' });

    // Build renamed filename: STOCKID_RAWMID_DD-MM-YYYY_certificate.ext
    const ext = path.extname(req.file.originalname);
    const displayStockId = (stock.stock_id || stockUuid.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '');
    const rawMid = stock.rawMaterial?.material_id
      ? String(stock.rawMaterial.material_id).replace(/[^a-zA-Z0-9_-]/g, '')
      : 'NA';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const newFilename = `${displayStockId}_${rawMid}_${dd}-${mm}-${yyyy}_certificate${ext}`;

    // Process through Unified File Service (R2 → Document → File Manager)
    const result = await processUpload(req.file, {
      module_type: 'inventory',
      section: 'certificate',
      reference_id: stockUuid,
      user: req.user,
      standardizedName: newFilename,
      description: `Material Certificate - ${newFilename}`,
    });

    // Keep certificate_url on Stock record pointing to Document for backward compat
    await stock.update({ certificate_url: result.file_url });

    res.json({ success: true, data: { url: result.file_url, filename: newFilename, document_id: result.document_id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Download / view certificate for a stock item
router.get('/:id/certificate', async (req, res) => {
  try {
    const stock = await Stock.findByPk(req.params.id);
    if (!stock || !stock.certificate_url) {
      return res.status(404).json({ success: false, message: 'No certificate found for this stock item' });
    }

    // Try R2 first (primary storage)
    const r2 = require('../services/r2StorageService');
    if (r2.isConfigured) {
      // Check for Document record with r2_url
      const doc = await Document.findOne({
        where: { module_type: 'inventory', reference_id: req.params.id, document_type: 'certificate', status: 'latest' },
        order: [['created_at', 'DESC']],
      });
      const r2Key = doc?.r2_url || r2.keyFromDbPath(stock.certificate_url);
      if (r2Key) {
        try {
          const { buffer, contentType } = await r2.download(r2Key);
          const filename = doc?.file_name || path.basename(stock.certificate_url);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
          return res.send(buffer);
        } catch { /* not in R2, fall through to disk */ }
      }
    }

    // Fallback to local disk
    const uploadsBase = process.env.UPLOAD_PATH ? path.resolve(process.env.UPLOAD_PATH) : path.join(__dirname, '..', '..', 'uploads');
    const filePath = path.join(uploadsBase, stock.certificate_url.replace(/^\/uploads\/?/, ''));
    if (!fs.existsSync(filePath)) {
      await stock.update({ certificate_url: null });
      return res.status(404).json({ success: false, message: 'Certificate file not found. Please re-upload.' });
    }
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Link stock certificate to a project (reference only, no file duplication)
router.post('/:id/link-certificate-to-project', authorize('main_admin', 'admin'), async (req, res) => {
  try {
    const stockId = req.params.id;
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ success: false, message: 'project_id is required' });

    // Find certificate document for this stock in Inventory
    const cert = await Document.findOne({
      where: {
        module_type: 'inventory',
        reference_id: stockId,
        document_type: 'certificate',
      },
      order: [['created_at', 'DESC']],
    });
    if (!cert) return res.status(404).json({ success: false, message: 'No certificate found for this stock item' });

    // Check if reference already exists for this project
    const existing = await Document.findOne({
      where: {
        project_id,
        module_type: 'project',
        reference_id: stockId,
        document_type: 'material_cert',
      },
    });
    if (existing) return res.json({ success: true, data: existing, message: 'Reference already exists' });

    // Create reference link (no file copy)
    const refDoc = await Document.create({
      project_id,
      module_type: 'project',
      reference_id: stockId,
      document_type: 'material_cert',
      description: `Material Certificate - ${cert.file_name}`,
      file_name: cert.file_name,
      file_path: cert.file_path,
      size: cert.size,
      version: 1,
      status: 'latest',
      file_type: 'reference',
      uploaded_by: cert.uploaded_by,
      generated_by: req.user.id,
      generated_at: new Date(),
      company_id: req.user.company_id || null,
    });

    res.status(201).json({ success: true, data: refDoc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
