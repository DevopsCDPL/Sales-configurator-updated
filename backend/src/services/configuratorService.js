'use strict';

/**
 * configuratorService.js — DB-side orchestration for the configurator HTTP layer.
 *
 * Responsibilities:
 *   • Hydrate component catalogs (single bulk fetch — no N+1)
 *   • Glue pure engines (bom / labour / pricing / compiler) to Sequelize models
 *   • Persist compiled BOM / labour / quotation rows
 *   • Generate quotation PDFs (delegates to pdfQuotationService)
 *
 * Tenant-awareness: relies on the Sequelize beforeFind/beforeCreate
 * hooks set up in `models/index.js` (TENANT_MODELS array). Callers
 * MUST be inside `tenantContext.run({ companyId, ... })` — the route
 * middleware does this automatically. Background workers should wrap
 * with `tenantContext.runWithTenantContext(companyId, fn)`.
 */

const { Op } = require('sequelize');
const {
  ConfiguratorConfiguration,
  ConfiguratorComponent,
  ConfiguratorBomItem,
  ConfiguratorLabourLine,
  ConfiguratorQuotation,
  ConfiguratorQuotationItem,
  ConfiguratorSystemParameters,
  ConfiguratorSystemSection,
  Project,
  Document,
  sequelize,
} = require('../models');

const bomEngine = require('./configurator/bomEngine');
const labourEngine = require('./configurator/labourEngine');
const quotationCompiler = require('./configurator/quotationCompiler');
const pdfQuotationService = require('./configurator/pdfQuotationService');
const documentNumberingService = require('./documentNumberingService');
const tenantContext = require('../middleware/tenantContext');
const logger = require('../utils/logger');

const DEFAULT_LOOKUP = Object.freeze({
  LBR_CU_rate:  85,
  LBR_ASM_rate: 75,
  LBR_CNT_rate: 95,
  LBR_QC_rate:  80,
  LBR_TST_rate: 90,
  LBR_ENG_rate: 130,
  LBR_CAD_rate: 110,
  OVERHEAD_PCT: 0.10,
  COPPER_RATE_PER_LB: 4.5,
});

const DEFAULT_PRICING = Object.freeze({
  strategy: 'DESIRED GM%',
  desired_gm_pct: 0.30,
  roundup_factor: -1,
});

const DEFAULT_SCHEDULE = Object.freeze({
  long_lead_sub_weeks: 2,
  long_lead_approve_weeks: 2,
  eng_sub_weeks: 4,
  sub_approve_weeks: 2,
  lead_time_weeks: 6,
  mfg_time_weeks: 4,
});

// ── Catalog helpers ─────────────────────────────────────────────────────────

/**
 * normalizeConfigurationData — canonical schema adapter.
 *
 * The Phase 4 frontend stores component selections using the reducer
 * serialisation shape (see `frontend/src/configurator/state/state.ts`
 * `configSerialize`):
 *
 *   config_data.stepLines.<stepKey> = [
 *     { componentId, partNumber, name, unitPrice, quantity, meta }
 *   ]
 *
 * The bomEngine / quotationCompiler pipeline expects:
 *
 *   config_data.<stepKey>.selected_components = [
 *     { component_id, part_number, name, unit_cost, quantity, meta }
 *   ]
 *
 * This function produces a SHALLOW COPY of configData where stepLines
 * entries are promoted to their canonical per-step homes, translating
 * camelCase → snake_case field names in the process.
 *
 * Behaviour:
 *  • Does NOT mutate the input (safe to call with DB-fetched rows).
 *  • Preserves any per-step node that already exists in compiler shape
 *    (backwards-compatible with legacy config blobs that used the old
 *    `selected_components` / `bom_rows` format directly).
 *  • Works for ALL step keys (no hardcoded step names).
 */
function normalizeConfigurationData(configData) {
  if (!configData || typeof configData !== 'object') return {};
  const out = Object.assign({}, configData);

  const stepLines = configData.stepLines;
  if (!stepLines || typeof stepLines !== 'object') return out;

  for (const stepKey of bomEngine.STEP_KEYS) {
    const lines = stepLines[stepKey];
    if (!Array.isArray(lines) || lines.length === 0) continue;

    // Translate each frontend SelectedComponentLine → compiler entry.
    const selectedComponents = lines.map((line) => ({
      // Support both new camelCase (frontend) and legacy snake_case in same field
      component_id:   line.componentId   ?? line.component_id   ?? null,
      part_number:    line.partNumber    ?? line.part_number    ?? null,
      name:           line.name          ?? null,
      unit_cost:      line.unitPrice     ?? line.unit_cost      ?? null,
      quantity: typeof line.quantity === 'number' ? line.quantity : 1,
      meta:           line.meta          ?? {},
    }));

    const existing = out[stepKey];
    if (existing && typeof existing === 'object') {
      // Only backfill selected_components when the existing node doesn't already
      // have compiler-shape data (avoids overwriting a legacy config).
      const alreadyHasData =
        (Array.isArray(existing.bom_rows) && existing.bom_rows.length > 0) ||
        (Array.isArray(existing.selected_components) && existing.selected_components.length > 0) ||
        (Array.isArray(existing.items) && existing.items.length > 0);
      if (!alreadyHasData) {
        out[stepKey] = { ...existing, selected_components: selectedComponents };
      }
    } else {
      out[stepKey] = { selected_components: selectedComponents };
    }
  }

  return out;
}

/**
 * Bulk-fetch every component referenced by a config_data JSON blob in
 * a SINGLE query. Returns { byId, byPartNumber } Maps.
 *
 * Accepts already-normalized data (call normalizeConfigurationData first).
 */
async function buildComponentCatalog(configData) {
  const ids = new Set();
  const partNumbers = new Set();
  const data = configData || {};
  for (const stepKey of bomEngine.STEP_KEYS) {
    const node = data[stepKey];
    if (!node) continue;
    const entries = []
      .concat(Array.isArray(node.bom_rows) ? node.bom_rows : [])
      .concat(Array.isArray(node.selected_components) ? node.selected_components : [])
      .concat(Array.isArray(node.items) ? node.items : []);
    for (const e of entries) {
      if (e.component_id) ids.add(e.component_id);
      if (e.part_number) partNumbers.add(e.part_number);
    }
  }

  const where = [];
  if (ids.size) where.push({ id: { [Op.in]: Array.from(ids) } });
  if (partNumbers.size) where.push({ part_number: { [Op.in]: Array.from(partNumbers) } });
  const components = where.length
    ? await ConfiguratorComponent.findAll({ where: { [Op.or]: where } })
    : [];

  const byId = new Map();
  const byPartNumber = new Map();
  for (const c of components) {
    const plain = c.get({ plain: true });
    byId.set(plain.id, plain);
    if (plain.part_number) byPartNumber.set(plain.part_number, plain);
  }
  return { byId, byPartNumber };
}

// ── Configuration CRUD ──────────────────────────────────────────────────────

async function generateConfigurationCode(companyId) {
  try {
    return await documentNumberingService.generateNumber('configuration_number', companyId);
  } catch (err) {
    logger.warn({ err: err.message }, '[configurator] document numbering failed; falling back');
    return `CFG-${Date.now().toString().slice(-6)}`;
  }
}

async function createConfiguration(payload, user) {
  const code = payload.code || (await generateConfigurationCode(user.company_id));
  const row = await ConfiguratorConfiguration.create({
    code,
    name: payload.name,
    description: payload.description || null,
    project_id: payload.project_id || null,
    user_id: user.id,
    config_data: payload.config_data || {},
    active_step: payload.active_step || 'system_design',
    progress_pct: payload.progress_pct || 0,
    is_template: !!payload.is_template,
    is_draft: payload.is_draft != null ? !!payload.is_draft : true,
    company_id: user.company_id,
    created_by: user.id,
  });
  return row;
}

async function updateConfiguration(id, payload) {
  const row = await ConfiguratorConfiguration.findByPk(id);
  if (!row) throw notFound('Configuration not found');
  const fields = ['name', 'description', 'project_id', 'config_data',
    'active_step', 'progress_pct', 'is_template', 'is_draft'];
  for (const f of fields) {
    if (payload[f] !== undefined) row[f] = payload[f];
  }
  await row.save();
  return row;
}

async function listConfigurations({ skip = 0, limit = 50, projectId, q }) {
  const where = {};
  if (projectId) where.project_id = projectId;
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  return ConfiguratorConfiguration.findAndCountAll({
    where,
    offset: Number(skip) || 0,
    limit: Math.min(Number(limit) || 50, 500),
    order: [['created_at', 'DESC']],
  });
}

async function getConfiguration(id) {
  const row = await ConfiguratorConfiguration.findByPk(id);
  if (!row) throw notFound('Configuration not found');
  return row;
}

async function deleteConfiguration(id) {
  const row = await ConfiguratorConfiguration.findByPk(id);
  if (!row) throw notFound('Configuration not found');
  await row.destroy();
  return true;
}

// ── Quotation preview / compile ─────────────────────────────────────────────

/**
 * Run the full pricing pipeline WITHOUT persisting anything. Used by
 * the configurator UI's live preview.
 *
 * @param {string} configurationId
 * @param {object} overrides   { lookup?, pricing?, schedule?, holidays?, lineAdders?, preBuiltSections? }
 * @returns {object} compiled quotation payload (see quotationCompiler)
 */
async function previewQuotation(configurationId, overrides = {}) {
  const config = await getConfiguration(configurationId);
  // Normalise the persisted blob to the compiler's canonical shape.
  // The frontend reducer serialises step selections under config_data.stepLines
  // (camelCase), while the bom/quotation engines expect config_data.<stepKey>
  // .selected_components (snake_case). normalizeConfigurationData bridges this.
  const configData = normalizeConfigurationData(config.config_data);
  const catalog = await buildComponentCatalog(configData);
  const compiled = quotationCompiler.compileQuotation({
    configuration: config.get({ plain: true }),
    configData,
    catalog,
    lookup: { ...DEFAULT_LOOKUP, ...(overrides.lookup || {}) },
    pricing: { ...DEFAULT_PRICING, ...(overrides.pricing || {}) },
    schedule: { ...DEFAULT_SCHEDULE, ...(overrides.schedule || {}) },
    holidays: overrides.holidays || [],
    lineAdders: overrides.lineAdders || [],
    preBuiltSections: overrides.preBuiltSections || null,
  });
  return compiled;
}

/**
 * Persist BOM + labour + quotation header + items (one transaction).
 * Optionally generates a PDF.
 *
 * @param {string} configurationId
 * @param {object} overrides         see previewQuotation()
 * @param {object} ctx               { user, generatePdf?: boolean, customer?: string }
 * @returns {object}                 { quotation, items, bomItems, labourLines, pdf? }
 */
async function compileAndPersistQuotation(configurationId, overrides, ctx) {
  const compiled = await previewQuotation(configurationId, overrides || {});
  const config = await getConfiguration(configurationId);
  const project = config.project_id ? await Project.findByPk(config.project_id) : null;
  // console.log('COMPILED TOTALS', JSON.stringify(compiled, null, 2));

  const result = await sequelize.transaction(async (transaction) => {
    try {
    // Replace any existing BOM / labour rows for this configuration
    await ConfiguratorBomItem.destroy({ where: { configuration_id: config.id }, transaction });
    await ConfiguratorLabourLine.destroy({ where: { configuration_id: config.id }, transaction });

    const bomItems = await ConfiguratorBomItem.bulkCreate(
      compiled.bom_spec.rows.map((r) => ({
        configuration_id: config.id,
        component_id: r.component_id,
        step_key: r.step_key,
        category: r.category,
        part_number: r.part_number,
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
        unit_cost: r.unit_cost,
        total_cost: r.total_cost,
        meta: r.meta || {},
        company_id: ctx.user.company_id,
      })),
      { transaction }
    );

    const labourLines = await ConfiguratorLabourLine.bulkCreate(
      Object.entries(compiled.labour.costs).map(([cat, cost]) => ({
        configuration_id: config.id,
        category: cat.toLowerCase(),
        hours: compiled.labour.hours[cat] || 0,
        rate: compiled.labour.rates[cat] || 0,
        total_cost: cost || 0,
        meta: {},
        company_id: ctx.user.company_id,
      })),
      { transaction }
    );

    const quotationNumber = (project && project.quotation_number) || null;
    const quotation = await ConfiguratorQuotation.create({
      quotation_number: quotationNumber,
      project_id: config.project_id,
      configuration_id: config.id,
      customer_name: (ctx && ctx.customer) || null,
      issued_at: new Date(),
      status: 'draft',
      sold: false,
      subtotal:       Number(compiled.totals.section_cost_total) || 0,
      labour_total:   Number(compiled.labour.totals.cost_total) || 0,
      material_total: Number(compiled.totals.material_total) || 0,
      overhead_total: Number(compiled.totals.overhead_amount) || 0,
      margin_pct:     Number(compiled.totals.actual_gm) || 0,
      margin_total:   Number(compiled.totals.actual_profit) || 0,
      grand_total:    Number(compiled.totals.rounded_price) || 0,
      currency: 'USD',
      bom_spec: compiled.bom_spec,
      pricing_spec: compiled.pricing_spec,
      company_id: ctx.user.company_id,
      created_by: ctx.user.id,
    }, { transaction });

    const items = await ConfiguratorQuotationItem.bulkCreate(
      compiled.items.map((it) => ({
        quotation_id: quotation.id,
        component_id: it.component_id,
        line_no: it.line_number,
        step_key: it.step_key,
        category: it.category,
        part_number: it.part_number,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_cost,
        line_total: it.total_cost,
        meta: it.meta || {},
        company_id: ctx.user.company_id,
      })),
      { transaction }
    );

    return { quotation, items, bomItems, labourLines, compiled, project };
  } catch(err) {
    console.error('Configurator compile error');
    console.error('message: ', err.message);

    if (err.errors) {
      console.error(
        'VALIDATION ERRORS:',
        JSON.stringify(
          err.errors.map((e) => ({
            message: e.message,
            path: e.path,
            value: e.value,
            validatorKey: e.validatorKey,
            validatorName: e.validatorName,
          })),
          null,
          2
        )
      );
    }

    console.error(err.stack);

    throw err;
  }
});

  // PDF generation happens AFTER the transaction (it does HTTP/R2 calls).
  if (ctx && ctx.generatePdf) {
    try {
      const pdf = await pdfQuotationService.generateAndStoreQuotationPdf({
        compiled: result.compiled,
        quotation: result.quotation.get({ plain: true }),
        configuration: config.get({ plain: true }),
        project: project ? project.get({ plain: true }) : null,
        companyId: ctx.user.company_id,
        userId: ctx.user.id,
      });
      result.quotation.pdf_document_id = pdf.document_id;
      await result.quotation.save();
      result.pdf = pdf;
    } catch (err) {
      logger.error({ err: err.message, quotation_id: result.quotation.id },
        '[configurator] PDF generation failed (quotation persisted without PDF)');
    }
  }

  return result;
}

async function regenerateQuotationPdf(quotationId, user) {
  const quotation = await ConfiguratorQuotation.findByPk(quotationId);
  if (!quotation) throw notFound('Quotation not found');
  const config = quotation.configuration_id
    ? await ConfiguratorConfiguration.findByPk(quotation.configuration_id)
    : null;
  const project = quotation.project_id ? await Project.findByPk(quotation.project_id) : null;

  // Re-derive `compiled` from stored bom_spec + pricing_spec to avoid recomputing
  // (preserves the snapshot used at quotation-creation time).
  const compiled = {
    configuration: config ? config.get({ plain: true }) : null,
    quote: quotation.pricing_spec?.quote || {},
    labour: quotation.pricing_spec?.labour_summary || {
      hours: {}, costs: {}, rates: {}, totals: { hours_total: 0, cost_total: 0 },
    },
    items: (quotation.bom_spec?.rows || []).map((r, idx) => ({
      line_number: idx + 1,
      component_id: r.component_id,
      part_number: r.part_number,
      description: r.description || r.name || '',
      category: r.category,
      step_key: r.step_key,
      section_number: r.section_number,
      quantity: r.quantity,
      unit: r.unit,
      unit_cost: r.unit_cost,
      total_cost: r.total_cost,
      meta: r.meta,
    })),
    bom_spec: quotation.bom_spec || {},
    pricing_spec: quotation.pricing_spec || {},
    totals: {
      material_total: Number(quotation.material_total) || 0,
      section_cost_total: Number(quotation.subtotal) || 0,
      overhead_amount: Number(quotation.overhead_total) || 0,
      copper_cost: Number(quotation.pricing_spec?.quote?.totals?.copper_cost) || 0,
      total_cost: Number(quotation.pricing_spec?.quote?.total_cost) || 0,
      target_price: Number(quotation.pricing_spec?.quote?.pricing?.target_price) || 0,
      rounded_price: Number(quotation.grand_total) || 0,
      actual_profit: Number(quotation.margin_total) || 0,
      actual_gm: Number(quotation.margin_pct) || 0,
    },
  };

  const pdf = await pdfQuotationService.generateAndStoreQuotationPdf({
    compiled,
    quotation: quotation.get({ plain: true }),
    configuration: config ? config.get({ plain: true }) : null,
    project: project ? project.get({ plain: true }) : null,
    companyId: user.company_id,
    userId: user.id,
  });

  quotation.pdf_document_id = pdf.document_id;
  await quotation.save();
  return { quotation, pdf };
}

async function markQuotationSold(quotationId) {
  const quotation = await ConfiguratorQuotation.findByPk(quotationId);
  if (!quotation) throw notFound('Quotation not found');
  quotation.sold = true;
  quotation.status = 'sold';
  await quotation.save();
  return quotation;
}

// ── Misc per-user state (system parameters / sections) ──────────────────────

async function getOrCreateSystemParameters(userId, companyId) {
  let row = await ConfiguratorSystemParameters.findOne({ where: { user_id: userId } });
  if (!row) {
    row = await ConfiguratorSystemParameters.create({
      user_id: userId, data: {}, company_id: companyId,
    });
  }
  return row;
}

async function setSystemParameters(userId, companyId, data) {
  const row = await getOrCreateSystemParameters(userId, companyId);
  row.data = data || {};
  await row.save();
  return row;
}

async function getSystemSection(userId, sectionNumber) {
  const row = await ConfiguratorSystemSection.findOne({
    where: { user_id: userId, section_number: Number(sectionNumber) },
  });
  return row;
}

async function setSystemSection(userId, companyId, sectionNumber, data) {
  let row = await getSystemSection(userId, sectionNumber);
  if (!row) {
    row = await ConfiguratorSystemSection.create({
      user_id: userId,
      section_number: Number(sectionNumber),
      data: data || {},
      company_id: companyId,
    });
  } else {
    row.data = data || {};
    await row.save();
  }
  return row;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

module.exports = {
  DEFAULT_LOOKUP,
  DEFAULT_PRICING,
  DEFAULT_SCHEDULE,
  buildComponentCatalog,

  createConfiguration,
  updateConfiguration,
  listConfigurations,
  getConfiguration,
  deleteConfiguration,

  previewQuotation,
  compileAndPersistQuotation,
  regenerateQuotationPdf,
  markQuotationSold,

  getOrCreateSystemParameters,
  setSystemParameters,
  getSystemSection,
  setSystemSection,
};
