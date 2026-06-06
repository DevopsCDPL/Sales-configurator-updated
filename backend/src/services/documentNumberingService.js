/**
 * Centralized Document Numbering Service
 *
 * Stores all numbering configurations as a single JSONB blob in the
 * `settings` table under key = 'document_numbering'.
 *
 * Concurrency: uses a per-document-type in-memory promise-chain lock
 * so that no two generateNumber() calls for the same type overlap.
 * The DB write uses Sequelize transactions for atomicity.
 */

const DOCUMENT_TYPES = {
  // ── Section 1: Project Flow ──────────────────────────────────
  PROJECT_NUMBER: 'project_number',
  CONFIGURATION_NUMBER: 'configuration_number',
  QUOTATION_NUMBER: 'quotation_number',
  CLIENT_PO_NUMBER: 'client_po_number',
  VENDOR_PO_NUMBER: 'vendor_po_number',
  WORK_ORDER_NUMBER: 'work_order_number',
  PRODUCTION_TRAVELER_NUMBER: 'production_traveler_number',
  COC_NUMBER: 'coc_number',
  PACKING_LIST_NUMBER: 'packing_list_number',
  COMMERCIAL_INVOICE_NUMBER: 'commercial_invoice_number',
  TAX_INVOICE_NUMBER: 'tax_invoice_number',
  PROFORMA_INVOICE_NUMBER: 'proforma_invoice_number',
  // ── Section 2: Material System ───────────────────────────────
  RAW_MATERIAL_ID: 'raw_material_id',
  PART_ID: 'part_id',
  MATERIAL_STOCK_ENTRY_ID: 'material_stock_entry_id',
};

const DOCUMENT_CATEGORIES = {
  PROJECT_FLOW: 'project_flow',
  MATERIAL_SYSTEM: 'material_system',
  LINKED_REFERENCES: 'linked_references',
};

const CATEGORY_MAPPING = {
  [DOCUMENT_TYPES.PROJECT_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.CONFIGURATION_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.QUOTATION_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.CLIENT_PO_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.VENDOR_PO_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.WORK_ORDER_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.PRODUCTION_TRAVELER_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.COC_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.PACKING_LIST_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.COMMERCIAL_INVOICE_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.TAX_INVOICE_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.PROFORMA_INVOICE_NUMBER]: DOCUMENT_CATEGORIES.PROJECT_FLOW,
  [DOCUMENT_TYPES.RAW_MATERIAL_ID]: DOCUMENT_CATEGORIES.MATERIAL_SYSTEM,
  [DOCUMENT_TYPES.PART_ID]: DOCUMENT_CATEGORIES.MATERIAL_SYSTEM,
  [DOCUMENT_TYPES.MATERIAL_STOCK_ENTRY_ID]: DOCUMENT_CATEGORIES.MATERIAL_SYSTEM,
};

const DOCUMENT_LABELS = {
  [DOCUMENT_TYPES.PROJECT_NUMBER]: 'Project Number',
  [DOCUMENT_TYPES.CONFIGURATION_NUMBER]: 'Configuration Number',
  [DOCUMENT_TYPES.QUOTATION_NUMBER]: 'Quotation Number',
  [DOCUMENT_TYPES.CLIENT_PO_NUMBER]: 'Vendor RFQ Number',
  [DOCUMENT_TYPES.VENDOR_PO_NUMBER]: 'Vendor PO Number',
  [DOCUMENT_TYPES.WORK_ORDER_NUMBER]: 'Work Order Number',
  [DOCUMENT_TYPES.PRODUCTION_TRAVELER_NUMBER]: 'Production Traveler Number',
  [DOCUMENT_TYPES.COC_NUMBER]: 'COC Number',
  [DOCUMENT_TYPES.PACKING_LIST_NUMBER]: 'Packing List Number',
  [DOCUMENT_TYPES.COMMERCIAL_INVOICE_NUMBER]: 'Commercial Invoice Number',
  [DOCUMENT_TYPES.TAX_INVOICE_NUMBER]: 'Tax Invoice Number',
  [DOCUMENT_TYPES.PROFORMA_INVOICE_NUMBER]: 'Proforma Invoice Number',
  [DOCUMENT_TYPES.RAW_MATERIAL_ID]: 'Raw Material ID',
  [DOCUMENT_TYPES.PART_ID]: 'Part ID',
  [DOCUMENT_TYPES.MATERIAL_STOCK_ENTRY_ID]: 'Material Stock Entry ID',
};

/** Default configurations for every document type */
const DEFAULT_CONFIGS = {
  [DOCUMENT_TYPES.PROJECT_NUMBER]:            { prefix: 'PRJ-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.CONFIGURATION_NUMBER]:      { prefix: 'CFG-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.QUOTATION_NUMBER]:          { prefix: 'QT-',   current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.CLIENT_PO_NUMBER]:          { prefix: 'RFQ-P-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 5 },
  [DOCUMENT_TYPES.VENDOR_PO_NUMBER]:          { prefix: 'PO-P-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 5 },
  [DOCUMENT_TYPES.WORK_ORDER_NUMBER]:         { prefix: 'WO-',   current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.PRODUCTION_TRAVELER_NUMBER]:{ prefix: 'PT-',   current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.COC_NUMBER]:                { prefix: 'COC-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.PACKING_LIST_NUMBER]:       { prefix: 'PL-',   current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.COMMERCIAL_INVOICE_NUMBER]: { prefix: 'INV-',  current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.TAX_INVOICE_NUMBER]:        { prefix: 'TINV-', current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.PROFORMA_INVOICE_NUMBER]:   { prefix: 'PINV-', current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.RAW_MATERIAL_ID]:           { prefix: 'RM-',   current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.PART_ID]:                   { prefix: 'PART-', current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
  [DOCUMENT_TYPES.MATERIAL_STOCK_ENTRY_ID]:   { prefix: 'MSTK-', current_counter: 1, increment_step: 1, suffix: '', number_length: 4 },
};

// All valid type values for quick lookup
const VALID_TYPES = new Set(Object.values(DOCUMENT_TYPES));

// Map document type to system_module_config.section_name
const DOC_TYPE_TO_SECTION = {
  [DOCUMENT_TYPES.PROJECT_NUMBER]: 'project_id',
  [DOCUMENT_TYPES.CONFIGURATION_NUMBER]: 'configuration',
  [DOCUMENT_TYPES.QUOTATION_NUMBER]: 'quotation',
  [DOCUMENT_TYPES.CLIENT_PO_NUMBER]: 'po',
  [DOCUMENT_TYPES.VENDOR_PO_NUMBER]: 'rfq',
  [DOCUMENT_TYPES.WORK_ORDER_NUMBER]: 'work_order',
  [DOCUMENT_TYPES.PRODUCTION_TRAVELER_NUMBER]: 'production_traveler',
  [DOCUMENT_TYPES.COC_NUMBER]: 'quality',
  [DOCUMENT_TYPES.PACKING_LIST_NUMBER]: 'logistics',
  [DOCUMENT_TYPES.COMMERCIAL_INVOICE_NUMBER]: 'invoice',
  [DOCUMENT_TYPES.TAX_INVOICE_NUMBER]: 'invoice',
  [DOCUMENT_TYPES.PROFORMA_INVOICE_NUMBER]: 'invoice',
};

class DocumentNumberingService {
  constructor() {
    this._Setting = null;
    this._sequelize = null;
    this._lockChain = new Map(); // Per-type promise chain for serialization
  }

  /** Lazy-load Setting model */
  _getModel() {
    if (!this._Setting) {
      const models = require('../models');
      this._Setting = models.Setting;
      this._sequelize = models.sequelize;
    }
    return this._Setting;
  }

  /** Check if a document type string is valid */
  _isValidType(type) {
    return VALID_TYPES.has(type);
  }

  /** Settings key is always 'document_numbering'; company scope is tracked via company_id column */
  _settingsKey() {
    return 'document_numbering';
  }

  /** Build the lock-chain key scoped to company + type */
  _lockKey(documentType, companyId) {
    return companyId ? `${documentType}:${companyId}` : documentType;
  }

  /**
   * Fetch override config from system_module_config for a given section_name.
   * Returns { numbering_prefix, numbering_start, numbering_increment, numbering_suffix } or null.
   */
  async _getSystemConfig(sectionName, companyId) {
    try {
      if (!sectionName) return null;
      const sequelize = this._sequelize || require('../models').sequelize;
      const { QueryTypes } = require('sequelize');
      // When companyId is provided, prefer the company-specific row; fall back to global
      let sql = `SELECT numbering_prefix, numbering_start, numbering_increment, numbering_suffix
         FROM system_module_config
         WHERE section_name = :sectionName`;
      const replacements = { sectionName };
      if (companyId) {
        sql += ` AND company_id = :companyId`;
        replacements.companyId = companyId;
      }
      sql += ` LIMIT 1`;
      const rows = await sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
      if (!rows || rows.length === 0) return null;
      const row = rows[0];
      // Only return if ALL numbering fields are non-null
      if (row.numbering_prefix == null || row.numbering_start == null ||
          row.numbering_increment == null || row.numbering_suffix == null) {
        return null;
      }
      return row;
    } catch {
      return null;
    }
  }

  // ─── INITIALIZATION ──────────────────────────────────────────

  /**
   * Ensure the document_numbering row exists in the settings table.
   * Called once at server startup AND defensively on every read.
   */
  async initialize(companyId) {
    try {
      const Setting = this._getModel();
      const key = this._settingsKey();
      const company_id = companyId || null;

      const existing = await Setting.findOne({
        where: { key, company_id },
        _skipTenantScope: true,
      });

      if (!existing) {
        const configs = {};
        for (const [, type] of Object.entries(DOCUMENT_TYPES)) {
          configs[type] = { ...DEFAULT_CONFIGS[type] };
        }
        await Setting.create({ key, company_id, value: configs });
        console.log(`DocumentNumbering: initialized with default configurations`);
        return;
      }

      const value = existing.value || {};
      let patched = false;
      for (const [, type] of Object.entries(DOCUMENT_TYPES)) {
        if (!value[type]) {
          value[type] = { ...DEFAULT_CONFIGS[type] };
          patched = true;
        }
      }
      if (patched) {
        await existing.update({ value });
        console.log(`DocumentNumbering: patched missing types into existing config`);
      }
    } catch (err) {
      console.error('DocumentNumbering initialization failed:', err.message);
    }
  }

  // ─── READ ────────────────────────────────────────────────────

  /**
   * Return configs for ALL document types.
   * Auto-initializes if the settings row is missing.
   */
  async getAllConfigurations(companyId) {
    const Setting = this._getModel();
    const key = this._settingsKey();
    const company_id = companyId || null;

    let row;
    try {
      row = await Setting.findOne({ where: { key, company_id }, _skipTenantScope: true });
    } catch (err) {
      console.error('DocumentNumbering: DB read failed, returning defaults:', err.message);
      return { ...DEFAULT_CONFIGS };
    }

    if (!row) {
      try {
        await this.initialize(companyId);
        row = await Setting.findOne({ where: { key, company_id }, _skipTenantScope: true });
      } catch (initErr) {
        console.error('DocumentNumbering: auto-init failed, using defaults:', initErr.message);
      }
    }

    const configs = row?.value || {};

    // Merge with defaults so newly added types always appear
    const result = {};
    for (const type of VALID_TYPES) {
      result[type] = configs[type] || { ...(DEFAULT_CONFIGS[type] || { prefix: type.substring(0, 3).toUpperCase() + '-', current_counter: 1, increment_step: 1, suffix: '', number_length: 4 }) };
    }
    return result;
  }

  /**
   * Get config for a single document type
   */
  async getConfiguration(documentType, companyId) {
    if (!this._isValidType(documentType)) {
      throw new Error(`Invalid document type: ${documentType}`);
    }
    const all = await this.getAllConfigurations(companyId);
    return all[documentType];
  }

  // ─── SAVE ────────────────────────────────────────────────────

  /**
   * Save (update) configuration for a single document type.
   * Validates all fields before writing.
   */
  async saveConfiguration(documentType, config, companyId) {
    if (!this._isValidType(documentType)) {
      throw new Error(`Invalid document type: ${documentType}`);
    }

    // Validate
    if (!config.prefix || !String(config.prefix).trim()) {
      throw new Error('Prefix cannot be empty');
    }
    const counter = parseInt(config.current_counter, 10);
    if (isNaN(counter) || counter < 0) {
      throw new Error('Starting number must be a non-negative integer');
    }
    const step = parseInt(config.increment_step, 10);
    if (isNaN(step) || step < 1) {
      throw new Error('Increment step must be ≥ 1');
    }
    const numLen = parseInt(config.number_length, 10);
    if (isNaN(numLen) || numLen < 1) {
      throw new Error('Number length (padding) must be ≥ 1');
    }

    const Setting = this._getModel();
    const key = this._settingsKey();
    const company_id = companyId || null;
    const allConfigs = await this.getAllConfigurations(companyId);

    allConfigs[documentType] = {
      prefix: String(config.prefix).trim(),
      current_counter: counter,
      increment_step: step,
      suffix: String(config.suffix || '').trim(),
      number_length: numLen,
    };

    const existing = await Setting.findOne({ where: { key, company_id }, _skipTenantScope: true });
    if (existing) {
      await existing.update({ value: allConfigs });
    } else {
      await Setting.create({ key, company_id, value: allConfigs });
    }
    return allConfigs[documentType];
  }

  // ─── FORMAT ──────────────────────────────────────────────────

  /**
   * Format: [Prefix][Zero-Padded Number][Suffix]
   */
  _formatNumber(number, config) {
    const padded = String(number).padStart(config.number_length, '0');
    return `${config.prefix}${padded}${config.suffix}`;
  }

  // ─── PREVIEW ─────────────────────────────────────────────────

  /**
   * Preview the NEXT number (read-only, does NOT increment)
   */
  async generatePreview(documentType, companyId) {
    const config = await this.getConfiguration(documentType, companyId);
    return {
      preview: this._formatNumber(config.current_counter, config),
      config,
    };
  }

  // ─── GENERATE (ATOMIC) ──────────────────────────────────────

  /**
   * Generate a new document number and atomically increment the counter.
   *
   * Concurrency control:
   *  1. Per-type promise chain ensures no two calls for the same type
   *     run their DB read-modify-write simultaneously.
   *  2. The DB write is wrapped in a Sequelize transaction.
   *  3. Numbers are NEVER reused — counters only go forward.
   */
  generateNumber(documentType, companyId) {
    if (!this._isValidType(documentType)) {
      return Promise.reject(new Error(`Invalid document type: ${documentType}`));
    }

    // Use company-scoped lock key so different companies don't block each other
    const lockKey = this._lockKey(documentType, companyId);

    // Build a new promise that chains after the previous one for this type+company
    const prev = this._lockChain.get(lockKey) || Promise.resolve();

    const next = prev.then(() => this._doGenerate(documentType, companyId)).catch((err) => {
      // Don't let a failure break the chain for future callers
      throw err;
    });

    // Store the NEW promise so the next caller waits for this one
    this._lockChain.set(lockKey, next.catch(() => {}));

    return next;
  }

  /** Internal: execute the actual generate + increment inside a transaction */
  async _doGenerate(documentType, companyId) {
    const Setting = this._getModel();
    const sequelize = this._sequelize;
    const key = this._settingsKey();
    const company_id = companyId || null;

    const transaction = await sequelize.transaction();
    try {
      // Read with row-level lock — use IS NOT DISTINCT FROM for NULL-safe company_id comparison
      const [rows] = await sequelize.query(
        `SELECT value FROM settings WHERE key = :key AND company_id IS NOT DISTINCT FROM :company_id FOR UPDATE`,
        { replacements: { key, company_id }, transaction }
      );

      let configs;
      if (rows.length === 0) {
        configs = {};
        for (const [, t] of Object.entries(DOCUMENT_TYPES)) {
          configs[t] = { ...DEFAULT_CONFIGS[t] };
        }
      } else {
        configs = rows[0].value || {};
      }

      if (!configs[documentType]) {
        configs[documentType] = { ...(DEFAULT_CONFIGS[documentType] || {
          prefix: documentType.substring(0, 3).toUpperCase() + '-',
          current_counter: 1, increment_step: 1, suffix: '', number_length: 4,
        })};
      }

      const config = configs[documentType];

      // ── System config override: apply values from system_module_config if present ──
      const sectionName = DOC_TYPE_TO_SECTION[documentType];
      if (sectionName) {
        const sysConfig = await this._getSystemConfig(sectionName, companyId);
        if (sysConfig) {
          config.prefix = String(sysConfig.numbering_prefix);
          config.suffix = String(sysConfig.numbering_suffix);
          config.increment_step = parseInt(sysConfig.numbering_increment, 10) || config.increment_step;
        }
      }

      const generatedNumber = this._formatNumber(config.current_counter, config);

      // Increment counter (never decrement)
      config.current_counter += config.increment_step;

      // Write back — include all required columns to satisfy NOT NULL constraints
      if (rows.length === 0) {
        await sequelize.query(
          `INSERT INTO settings (id, key, company_id, value, created_at, updated_at)
           VALUES (uuid_generate_v4(), :key, :company_id, :val::jsonb, NOW(), NOW())`,
          { replacements: { key, company_id, val: JSON.stringify(configs) }, transaction }
        );
      } else {
        await sequelize.query(
          `UPDATE settings SET value = :val::jsonb, updated_at = NOW()
           WHERE key = :key AND company_id IS NOT DISTINCT FROM :company_id`,
          { replacements: { key, company_id, val: JSON.stringify(configs) }, transaction }
        );
      }

      await transaction.commit();
      return generatedNumber;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  // ─── GENERATE UNIQUE (collision-safe wrapper) ────────────────

  /**
   * Generate a number that is guaranteed unique against `model.columnName`
   * across ALL companies (defends against legacy global rows + race conditions).
   *
   * Use this whenever the caller is about to INSERT a row whose number column
   * has a unique constraint of any kind (per-company or legacy global).
   *
   * INTERNAL_ONLY: uses `_skipTenantScope: true` solely for the global existence
   * check. The caller still inserts under their own tenant scope.
   *
   * @param {string} documentType   e.g. 'work_order_number'
   * @param {string|null} companyId
   * @param {object} model          Sequelize model (e.g. Invoice, WorkOrder)
   * @param {string} columnName     attribute on the model (e.g. 'invoice_number')
   * @param {number} maxAttempts    safety cap; default 200
   */
  async generateUniqueNumber(documentType, companyId, model, columnName, maxAttempts = 200) {
    if (!model || typeof model.findOne !== 'function') {
      // No model provided — fall back to plain counter increment.
      return this.generateNumber(documentType, companyId);
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = await this.generateNumber(documentType, companyId);
      const exists = await model.findOne({
        where: { [columnName]: candidate },
        attributes: ['id'],
        _skipTenantScope: true,
      });
      if (!exists) return candidate;
      // Counter has already advanced — loop will get the next slot.
    }
    // Emergency fallback: timestamp-based unique suffix.
    return `${documentType.split('_')[0].toUpperCase()}-${Date.now().toString().slice(-8)}`;
  }
  /**
   * Generates a preview of the next number without incrementing the counter.
   */
  async generatePreview(documentType, companyId) {
    if (!this._isValidType(documentType)) {
      throw new Error(`Invalid document type: ${documentType}`);
    }

    try {
      const config = await this.getConfiguration(documentType, companyId);
      
      // ── System config override
      const sectionName = DOC_TYPE_TO_SECTION[documentType];
      if (sectionName) {
        const sysConfig = await this._getSystemConfig(sectionName, companyId);
        if (sysConfig) {
          config.prefix = String(sysConfig.numbering_prefix);
          config.suffix = String(sysConfig.numbering_suffix);
          config.increment_step = parseInt(sysConfig.numbering_increment, 10) || config.increment_step;
        }
      }

      return {
        preview: this._formatNumber(config.current_counter, config),
        config
      };
    } catch (error) {
      throw error;
    }
  }

  // ─── GROUPED READ (for UI) ──────────────────────────────────
  async getConfigurationsByCategory(companyId) {
    const allConfigs = await this.getAllConfigurations(companyId);

    return {
      [DOCUMENT_CATEGORIES.PROJECT_FLOW]: Object.entries(DOCUMENT_TYPES)
        .filter(([, type]) => CATEGORY_MAPPING[type] === DOCUMENT_CATEGORIES.PROJECT_FLOW)
        .map(([, type]) => ({
          type,
          label: DOCUMENT_LABELS[type],
          config: allConfigs[type],
        })),
      [DOCUMENT_CATEGORIES.MATERIAL_SYSTEM]: Object.entries(DOCUMENT_TYPES)
        .filter(([, type]) => CATEGORY_MAPPING[type] === DOCUMENT_CATEGORIES.MATERIAL_SYSTEM)
        .map(([, type]) => ({
          type,
          label: DOCUMENT_LABELS[type],
          config: allConfigs[type],
        })),
      [DOCUMENT_CATEGORIES.LINKED_REFERENCES]: [
        {
          type: DOCUMENT_TYPES.CLIENT_PO_NUMBER,
          label: `${DOCUMENT_LABELS[DOCUMENT_TYPES.CLIENT_PO_NUMBER]} (Linked)`,
          config: allConfigs[DOCUMENT_TYPES.CLIENT_PO_NUMBER],
          readonly: true,
        },
        {
          type: DOCUMENT_TYPES.VENDOR_PO_NUMBER,
          label: `${DOCUMENT_LABELS[DOCUMENT_TYPES.VENDOR_PO_NUMBER]} (Linked)`,
          config: allConfigs[DOCUMENT_TYPES.VENDOR_PO_NUMBER],
          readonly: true,
        },
      ],
    };
  }
}

module.exports = new DocumentNumberingService();
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.DOCUMENT_CATEGORIES = DOCUMENT_CATEGORIES;
module.exports.DOCUMENT_LABELS = DOCUMENT_LABELS;
