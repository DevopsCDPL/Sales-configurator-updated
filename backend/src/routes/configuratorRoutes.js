'use strict';

/**
 * configuratorRoutes.js — `/api/configurator/*` mount.
 *
 * Sub-paths (all require authenticate + tenantScope):
 *   /components/*           — catalog
 *   /categories/*           — category list / upsert / rebuild
 *   /configurations/*       — configuration CRUD
 *   /quotations/*           — quotation CRUD + PDF
 *   /preview                — pricing preview (no persist)
 *   /compile                — compile + persist + (optional) PDF
 *   /system-parameters      — per-user param bag
 *   /system-sections/:n     — per-user section bag
 *   /market/copper          — COMEX copper spot
 *   /drawing-generation/*   — SolidWorks proxy
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { requireResource } = require('../middleware/departments');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const c = require('../controllers/configuratorController');

router.use(authenticate);
router.use(tenantScope);
router.use(requireResource('configurator'));

// ── Components ──────────────────────────────────────────────────────────────
router.get('/components', c.listComponents);
router.get('/components/stats/category-counts', c.componentCategoryCounts);
router.get('/catalog/non-addable-categories', c.nonAddableCategories);
// Convenience alias — path-style category filter (frontend configurator consumer)
router.get('/components/category/:category', (req, res, next) => {
  req.query.category = req.params.category;
  return c.listComponents(req, res, next);
});
router.get('/components/:id', c.getComponent);
router.post('/components', c.requireAdmin, validate([
  body('name').trim().notEmpty().withMessage('name is required'),
]), c.createComponent);
router.post('/components/bulk', c.requireAdmin, c.bulkCreateComponents);
router.put('/components/:id', c.requireAdmin, c.updateComponent);
router.delete('/components/:id', c.requireAdmin, c.deleteComponent);

// ── Categories ──────────────────────────────────────────────────────────────
router.get('/categories', c.listCategories);
router.post('/categories/upsert', c.requireAdmin, validate([
  body('name').trim().notEmpty().withMessage('name is required'),
]), c.upsertCategory);
router.post('/categories/rebuild', c.requireAdmin, c.rebuildCategories);

// ── Configurations ──────────────────────────────────────────────────────────
router.get('/configurations', c.listConfigurations);
router.get('/configurations/:id', c.getConfiguration);
router.post('/configurations', validate([
  body('name').trim().notEmpty().withMessage('name is required'),
  body('config_data').optional().isObject().withMessage('config_data must be an object'),
]), c.createConfiguration);
router.put('/configurations/:id', c.updateConfiguration);
router.delete('/configurations/:id', c.deleteConfiguration);

// ── Preview / compile ──────────────────────────────────────────────────────
router.post('/preview', validate([
  body('configuration_id').isUUID().withMessage('configuration_id must be a UUID'),
]), c.previewQuotation);
router.post('/configurations/:id/preview', c.previewQuotation);
router.post('/compile', validate([
  body('configuration_id').isUUID().withMessage('configuration_id must be a UUID'),
]), c.compileQuotation);
router.post('/configurations/:id/compile', c.compileQuotation);

// ── Quotations ──────────────────────────────────────────────────────────────
router.get('/quotations', c.listQuotations);
router.get('/quotations/:id', c.getQuotation);
router.delete('/quotations/:id', c.deleteQuotation);
router.post('/quotations/:id/mark-sold', c.markQuotationSold);
router.get('/quotations/:id/pdf', c.getQuotationPdf);
router.post('/quotations/:id/pdf', c.regeneratePdf);

// ── System parameters / sections (per-user) ────────────────────────────────
router.get('/system-parameters', c.getSystemParameters);
router.put('/system-parameters', c.setSystemParameters);
router.get('/system-sections/:n', validate([param('n').isInt({ min: 1 })]), c.getSystemSection);
router.put('/system-sections/:n', validate([param('n').isInt({ min: 1 })]), c.setSystemSection);

// ── Market data ────────────────────────────────────────────────────────────
router.get('/market/copper', c.getCopperPrice);

// ── Drawing generation proxy ───────────────────────────────────────────────
router.get('/drawing-generation/health', c.drawingHealth);
router.post('/drawing-generation/create', validate([
  body('folderName').isString().isLength({ min: 1, max: 200 }),
  body('panelCount').isInt({ min: 1, max: 20 }),
  body('circuitBreakerBrand').isIn(['ABB', 'SCHNEIDER', 'SIEMENS']),
]), c.drawingCreate);
router.get('/drawing-generation/jobs', c.drawingListJobs);
router.get('/drawing-generation/jobs/:jobId', c.drawingGetJob);
router.get('/drawing-generation/jobs/:jobId/files', c.drawingListFiles);
router.get('/drawing-generation/jobs/:jobId/download', c.drawingDownload);

module.exports = router;
