const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const rawMaterialController = require('../controllers/rawMaterialController');

router.use(authenticate);
router.use(tenantScope);

// Lookup endpoints (static catalog data — no DB needed)
router.get('/lookup/catalog', rawMaterialController.getCatalog);
router.get('/lookup/categories', rawMaterialController.getCategories);
router.get('/lookup/grades/:category', rawMaterialController.getGrades);
router.get('/lookup/conditions/:category/:grade', rawMaterialController.getConditions);
router.get('/lookup/density/:category/:grade', rawMaterialController.getDensity);
router.get('/lookup/forms', rawMaterialController.getFormOptions);
router.get('/lookup/shape/:form', rawMaterialController.getShapeForForm);

// CRUD
router.get('/', rawMaterialController.getAll);
router.get('/:id', rawMaterialController.getById);
router.post('/', authorize('main_admin', 'admin'), rawMaterialController.create);
router.post('/bulk-delete', authorize('main_admin', 'admin'), rawMaterialController.bulkDelete);
router.post('/duplicate/:id', authorize('main_admin', 'admin'), rawMaterialController.duplicate);
router.put('/:id', authorize('main_admin', 'admin'), rawMaterialController.update);
router.delete('/:id', authorize('main_admin', 'admin'), rawMaterialController.delete);
router.patch('/:id/toggle-status', authorize('main_admin', 'admin'), rawMaterialController.toggleStatus);

module.exports = router;
