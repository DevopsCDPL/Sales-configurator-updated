'use strict';

/**
 * configuratorController.js — HTTP layer for the configurator feature.
 *
 * Exposes:
 *   • /api/configurator/components/*       — catalog CRUD + filtering
 *   • /api/configurator/categories/*       — distinct category names + counts
 *   • /api/configurator/configurations/*   — Configuration CRUD
 *   • /api/configurator/quotations/*       — Quotation CRUD + PDF + mark-sold
 *   • /api/configurator/preview            — pricing preview (no persist)
 *   • /api/configurator/system-parameters  — per-user param bag
 *   • /api/configurator/system-sections/*  — per-user section bag
 *   • /api/configurator/market/copper      — COMEX copper spot price
 *   • /api/configurator/drawing-generation — SolidWorks proxy
 *
 * All routes assume `authenticate` + `tenantScope` middleware ran upstream.
 */

const { Op } = require('sequelize');
const {
  ConfiguratorComponent,
  ConfiguratorComponentCategory,
  ConfiguratorConfiguration,
  ConfiguratorQuotation,
  ConfiguratorQuotationItem,
  ConfiguratorBomItem,
  ConfiguratorLabourLine,
  Document,
  sequelize,
} = require('../models');

const configuratorService = require('../services/configuratorService');
const marketDataService = require('../services/configurator/marketDataService');
const drawingService = require('../services/configurator/drawingGenerationService');
const r2 = require('../services/r2StorageService');
const { expandCategory, canonicalDisplay } = require('../services/configurator/categoryUtils');
const logger = require('../utils/logger');

// ── Helpers ─────────────────────────────────────────────────────────────────

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });
const fail = (res, status, message) => res.status(status).json({ success: false, message });

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) logger.error({ err: err.message, stack: err.stack }, '[configurator] unhandled error');
    return fail(res, status, err.message || 'Internal error');
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !['main_admin', 'platform_admin', 'super_admin'].includes(req.user.role)) {
    return fail(res, 403, 'Admin role required for this action.');
  }
  next();
};

// ── Components ──────────────────────────────────────────────────────────────

const listComponents = handle(async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const where = {};

  if (req.query.subcategory) where.subcategory = req.query.subcategory;
  if (req.query.q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${req.query.q}%` } },
      { part_number: { [Op.iLike]: `%${req.query.q}%` } },
      { description: { [Op.iLike]: `%${req.query.q}%` } },
    ];
  }
  if (req.query.category) {
    const variants = expandCategory(req.query.category);
    // Match category equal to ANY canonical / synonym variant (case-insensitive)
    where[Op.and] = (where[Op.and] || []).concat([{
      [Op.or]: variants.map((v) => ({ category: { [Op.iLike]: v } })),
    }]);
  }
  if (req.query.is_active != null) where.is_active = req.query.is_active === 'true';

  const { rows, count } = await ConfiguratorComponent.findAndCountAll({
    where, offset: skip, limit, order: [['name', 'ASC']],
  });
  ok(res, rows, { total: count });
});

const getComponent = handle(async (req, res) => {
  const row = await ConfiguratorComponent.findByPk(req.params.id);
  if (!row) return fail(res, 404, 'Component not found');
  ok(res, row);
});

const createComponent = handle(async (req, res) => {
  const payload = { ...req.body, company_id: req.user.company_id, created_by: req.user.id };
  if (payload.category) payload.category = canonicalDisplay(payload.category);
  const row = await ConfiguratorComponent.create(payload);
  res.status(201).json({ success: true, data: row });
});

const updateComponent = handle(async (req, res) => {
  const row = await ConfiguratorComponent.findByPk(req.params.id);
  if (!row) return fail(res, 404, 'Component not found');
  const payload = { ...req.body };
  if (payload.category) payload.category = canonicalDisplay(payload.category);
  await row.update(payload);
  ok(res, row);
});

const deleteComponent = handle(async (req, res) => {
  const row = await ConfiguratorComponent.findByPk(req.params.id);
  if (!row) return fail(res, 404, 'Component not found');
  // Stamp deleted_by so the recycle bin can attribute the action.
  if (req.user && req.user.id) {
    await row.update({ deleted_by: req.user.id });
  }
  await row.destroy();
  ok(res, { id: req.params.id, deleted: true });
});

const bulkCreateComponents = handle(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, 422, 'Body must be an array (or { items: [...] })');
  }
  const payload = items.map((c) => ({
    ...c,
    category: c.category ? canonicalDisplay(c.category) : null,
    company_id: req.user.company_id,
    created_by: req.user.id,
  }));
  const rows = await ConfiguratorComponent.bulkCreate(payload);
  res.status(201).json({ success: true, data: rows, count: rows.length });
});

const componentCategoryCounts = handle(async (req, res) => {
  const rows = await ConfiguratorComponent.findAll({
    attributes: [
      'category',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    where: { is_active: true },
    group: ['category'],
    raw: true,
  });
  ok(res, rows.map((r) => ({ category: r.category, count: Number(r.count) })));
});

// ── Categories ──────────────────────────────────────────────────────────────

const listCategories = handle(async (req, res) => {
  const rows = await ConfiguratorComponentCategory.findAll({ order: [['name', 'ASC']] });
  ok(res, rows);
});

const upsertCategory = handle(async (req, res) => {
  const name = canonicalDisplay(req.body.name);
  if (!name) return fail(res, 422, 'name is required');
  const normalized = name.toLowerCase().trim();
  const [row] = await ConfiguratorComponentCategory.findOrCreate({
    where: { normalized_name: normalized },
    defaults: {
      name,
      normalized_name: normalized,
      display_order: Number(req.body.display_order) || 0,
      company_id: req.user.company_id,
    },
  });
  ok(res, row);
});

const rebuildCategories = handle(async (req, res) => {
  // Distinct categories from components → upsert into category table
  const distinct = await ConfiguratorComponent.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('category')), 'category']],
    where: { category: { [Op.ne]: null } },
    raw: true,
  });
  let created = 0;
  for (const { category } of distinct) {
    const name = canonicalDisplay(category);
    if (!name) continue;
    const normalized = name.toLowerCase().trim();
    const [, isNew] = await ConfiguratorComponentCategory.findOrCreate({
      where: { normalized_name: normalized },
      defaults: { name, normalized_name: normalized, company_id: req.user.company_id },
    });
    if (isNew) created += 1;
  }
  ok(res, { rebuilt: distinct.length, created });
});

// ── Configurations ──────────────────────────────────────────────────────────

const listConfigurations = handle(async (req, res) => {
  const { rows, count } = await configuratorService.listConfigurations({
    skip: req.query.skip,
    limit: req.query.limit,
    projectId: req.query.project_id,
    q: req.query.q,
  });
  ok(res, rows, { total: count });
});

const getConfiguration = handle(async (req, res) => {
  const row = await configuratorService.getConfiguration(req.params.id);
  ok(res, row);
});

const createConfiguration = handle(async (req, res) => {
  const row = await configuratorService.createConfiguration(req.body, req.user);
  res.status(201).json({ success: true, data: row });
});

const updateConfiguration = handle(async (req, res) => {
  const row = await configuratorService.updateConfiguration(req.params.id, req.body);
  ok(res, row);
});

const deleteConfiguration = handle(async (req, res) => {
  await configuratorService.deleteConfiguration(req.params.id);
  ok(res, { id: req.params.id, deleted: true });
});

// ── Preview / compile ──────────────────────────────────────────────────────

const previewQuotation = handle(async (req, res) => {
  const configurationId = req.body.configuration_id || req.params.id;
  if (!configurationId) return fail(res, 422, 'configuration_id is required');
  const compiled = await configuratorService.previewQuotation(configurationId, req.body.overrides || {});
  ok(res, compiled);
});

const compileQuotation = handle(async (req, res) => {
  const configurationId = req.body.configuration_id || req.params.id;
  if (!configurationId) return fail(res, 422, 'configuration_id is required');
  const result = await configuratorService.compileAndPersistQuotation(
    configurationId,
    req.body.overrides || {},
    {
      user: req.user,
      generatePdf: req.body.generate_pdf !== false,
      customer: req.body.customer || null,
    }
  );
  res.status(201).json({
    success: true,
    data: {
      quotation: result.quotation,
      items: result.items,
      bom_items: result.bomItems,
      labour_lines: result.labourLines,
      pdf: result.pdf || null,
    },
  });
});

// ── Quotations ──────────────────────────────────────────────────────────────

const listQuotations = handle(async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const where = {};
  if (req.query.q) {
    where[Op.or] = [
      { customer_name: { [Op.iLike]: `%${req.query.q}%` } },
      { quotation_number: { [Op.iLike]: `%${req.query.q}%` } },
    ];
  }
  if (req.query.year) {
    const y = Number(req.query.year);
    if (Number.isInteger(y)) {
      where.created_at = {
        [Op.gte]: new Date(`${y}-01-01T00:00:00Z`),
        [Op.lt]: new Date(`${y + 1}-01-01T00:00:00Z`),
      };
    }
  }
  if (req.query.customer) where.customer_name = { [Op.iLike]: `%${req.query.customer}%` };
  if (req.query.sold != null) where.sold = req.query.sold === 'true';

  const { rows, count } = await ConfiguratorQuotation.findAndCountAll({
    where, offset: skip, limit, order: [['created_at', 'DESC']],
  });
  ok(res, rows, { total: count });
});

const getQuotation = handle(async (req, res) => {
  const row = await ConfiguratorQuotation.findByPk(req.params.id, {
    include: [{ model: ConfiguratorQuotationItem, as: 'items' }],
  });
  if (!row) return fail(res, 404, 'Quotation not found');
  ok(res, row);
});

const deleteQuotation = handle(async (req, res) => {
  const row = await ConfiguratorQuotation.findByPk(req.params.id);
  if (!row) return fail(res, 404, 'Quotation not found');
  await row.destroy();
  ok(res, { id: req.params.id, deleted: true });
});

const markQuotationSold = handle(async (req, res) => {
  const row = await configuratorService.markQuotationSold(req.params.id);
  ok(res, row);
});

const getQuotationPdf = handle(async (req, res) => {
  const row = await ConfiguratorQuotation.findByPk(req.params.id);
  if (!row) return fail(res, 404, 'Quotation not found');
  if (!row.pdf_document_id) return fail(res, 404, 'No PDF generated yet — POST to /pdf to create one');

  const doc = await Document.findByPk(row.pdf_document_id);
  if (!doc) return fail(res, 404, 'PDF document missing');

  if (doc.r2_url && r2.isConfigured()) {
    try {
      const { buffer, contentType } = await r2.download(doc.r2_url);
      res.setHeader('Content-Type', contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
      return res.send(buffer);
    } catch (err) {
      logger.warn({ err: err.message }, '[configurator] R2 download failed; returning JSON pointer');
    }
  }
  ok(res, doc);
});

const regeneratePdf = handle(async (req, res) => {
  const result = await configuratorService.regenerateQuotationPdf(req.params.id, req.user);
  ok(res, { quotation: result.quotation, pdf: result.pdf });
});

// ── System parameters / sections (per-user) ────────────────────────────────

const getSystemParameters = handle(async (req, res) => {
  const row = await configuratorService.getOrCreateSystemParameters(req.user.id, req.user.company_id);
  ok(res, row.data || {});
});

const setSystemParameters = handle(async (req, res) => {
  const row = await configuratorService.setSystemParameters(req.user.id, req.user.company_id, req.body);
  ok(res, row.data || {});
});

const getSystemSection = handle(async (req, res) => {
  const row = await configuratorService.getSystemSection(req.user.id, Number(req.params.n));
  ok(res, row ? row.data : {});
});

const setSystemSection = handle(async (req, res) => {
  const row = await configuratorService.setSystemSection(
    req.user.id, req.user.company_id, Number(req.params.n), req.body
  );
  ok(res, row.data || {});
});

// ── Market data ────────────────────────────────────────────────────────────

const getCopperPrice = handle(async (req, res) => {
  const date = req.query.date;
  if (date) {
    const snap = await marketDataService.getCopperPriceForDate(date, { companyId: req.user.company_id });
    if (!snap) return fail(res, 404, `No snapshot for ${date}`);
    return ok(res, snap);
  }
  const live = await marketDataService.getCopperPrice({ companyId: req.user.company_id });
  ok(res, live);
});

// ── Drawing generation proxy ───────────────────────────────────────────────

const drawingHealth = handle(async (req, res) => {
  const r = await drawingService.health();
  res.status(r.status || 200).json({ success: r.ok, ...r });
});

const drawingCreate = handle(async (req, res) => {
  const r = await drawingService.createDrawing({
    folderName: req.body.folderName,
    panelCount: Number(req.body.panelCount),
    circuitBreakerBrand: req.body.circuitBreakerBrand,
  });
  res.status(r.status || 200).json({ success: r.ok, ...r });
});

const drawingListJobs = handle(async (req, res) => {
  const r = await drawingService.listJobs();
  res.status(r.status || 200).json({ success: r.ok, ...r });
});

const drawingGetJob = handle(async (req, res) => {
  const r = await drawingService.getJob(req.params.jobId);
  res.status(r.status || 200).json({ success: r.ok, ...r });
});

const drawingListFiles = handle(async (req, res) => {
  const r = await drawingService.listJobFiles(req.params.jobId);
  res.status(r.status || 200).json({ success: r.ok, ...r });
});

const drawingDownload = handle(async (req, res) => {
  const filename = req.query.file;
  if (!filename) return fail(res, 422, 'file query param required');
  const r = await drawingService.downloadJobFile(req.params.jobId, filename);
  if (!r.ok) return res.status(r.status || 503).json({ success: false, ...r });
  if (r.body instanceof ArrayBuffer || Buffer.isBuffer(r.body)) {
    res.setHeader('Content-Type', r.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(r.body));
  }
  res.json({ success: true, ...r });
});

module.exports = {
  // helpers (exposed for routes file)
  requireAdmin,

  // components
  listComponents, getComponent, createComponent, updateComponent, deleteComponent,
  bulkCreateComponents, componentCategoryCounts,
  // categories
  listCategories, upsertCategory, rebuildCategories,
  // configurations
  listConfigurations, getConfiguration, createConfiguration, updateConfiguration, deleteConfiguration,
  // preview / compile
  previewQuotation, compileQuotation,
  // quotations
  listQuotations, getQuotation, deleteQuotation, markQuotationSold, getQuotationPdf, regeneratePdf,
  // system params / sections
  getSystemParameters, setSystemParameters, getSystemSection, setSystemSection,
  // market
  getCopperPrice,
  // drawing
  drawingHealth, drawingCreate, drawingListJobs, drawingGetJob, drawingListFiles, drawingDownload,
};
