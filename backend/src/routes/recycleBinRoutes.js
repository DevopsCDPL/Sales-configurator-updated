const express = require('express');
const router = express.Router();
const recycleBinController = require('../controllers/recycleBinController');
const { authenticate, authorize, requireCoAdmin } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

router.use(authenticate);
router.use(tenantScope);

// Only Owner/Co-Owner can access recycle bin (Administration module)
router.use(requireCoAdmin);

// List deleted items (optionally filter by ?module=clients&search=...)
router.get('/', recycleBinController.list);

// Restore a deleted item
router.post('/:module/:id/restore', recycleBinController.restore);

// Permanently delete (main_admin only enforced in service)
router.delete('/:module/:id', recycleBinController.permanentDelete);

// Bulk operations
router.post('/bulk-restore', recycleBinController.bulkRestore);
router.post('/bulk-delete', recycleBinController.bulkPermanentDelete);

module.exports = router;
