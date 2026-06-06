const express = require('express');
const router = express.Router();
const fileManagerController = require('../controllers/fileManagerController');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const multer = require('multer');
const path = require('path');

// Memory storage — buffers go straight to UnifiedFileService
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.dwg', '.dxf', '.step', '.stp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

router.use(authenticate);
router.use(tenantScope);

// Tree view — all folders
router.get('/tree', fileManagerController.getTree);

// R2 browse (folder navigation)
router.get('/browse', fileManagerController.browseR2);

// R2 project-level endpoints (skip company level)
router.get('/r2/projects', fileManagerController.r2Projects);
router.get('/r2/project-files', fileManagerController.r2ProjectFiles);

// R2 direct file operations by key
router.get('/r2/view', fileManagerController.viewByKey);
router.get('/r2/download', fileManagerController.downloadByKey);
router.get('/r2/signed-url', fileManagerController.getSignedUrl);
router.delete('/r2/file', fileManagerController.deleteByKey);

// Folder contents by ID
router.get('/folders/by-path', fileManagerController.getFolderByPath);
router.get('/folders/:id', fileManagerController.getFolderContents);

// Documents query
router.get('/documents', fileManagerController.getDocuments);

// Specialized flat tables
router.get('/parts', fileManagerController.getPartMasterDocuments);
router.get('/inventory', fileManagerController.getInventoryDocuments);

// All projects (for folder name display)
router.get('/projects', fileManagerController.getProjects);

// Upload
router.post('/upload', upload.single('file'), fileManagerController.uploadFile);

// Ensure project folder structure
router.post('/ensure-project-folders', fileManagerController.ensureProjectFolders);

// Ensure procurement folder structure
router.post('/ensure-procurement-folders', fileManagerController.ensureProcurementFolders);

// Update document status
router.patch('/documents/:id/status', fileManagerController.updateDocumentStatus);

// Download
router.get('/documents/:id/download', fileManagerController.downloadFile);

// View (inline)
router.get('/documents/:id/view', fileManagerController.viewFile);

// View by file path (for drawings without document ID)
router.get('/view-by-path', fileManagerController.viewFileByPath);

// Delete
router.delete('/documents/:id', fileManagerController.deleteFile);

module.exports = router;
