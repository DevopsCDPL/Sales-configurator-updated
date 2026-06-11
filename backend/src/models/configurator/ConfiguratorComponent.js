'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComponent
 *
 * Master switchgear component catalogue used by the Sales Configurator
 * to populate every step card. Replaces the SQLAlchemy `Component`
 * polymorphic hierarchy from `config/backend/app/models/switchgear_components.py`.
 *
 * Polymorphism is flattened into a single table:
 *   • `component_type` is the discriminator (CAMLOCK, CONDUIT, ENCLOSURE, …).
 *   • `specifications` (JSONB) carries category-specific fields (CAMLOCK.color,
 *     amperage, etc.) so we do not need Sequelize STI.
 *
 * Cost / labour columns are preserved 1-for-1 from the original Excel-imported
 * `Component` table (`mat_cost`, `lbr_cu`, … `lbr_cad`) to guarantee parity
 * with `quotation_calc.py` once the pricing engine is ported in Phase 2.
 */
module.exports = (sequelize) => {
  const ConfiguratorComponent = sequelize.define(
    'ConfiguratorComponent',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      // ── Identity ───────────────────────────────────────────────
      part_number: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: 'Per-company unique (composite index in migration)',
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      category: { type: DataTypes.STRING(120), allowNull: true },
      subcategory: { type: DataTypes.STRING(120), allowNull: true },
      type: { type: DataTypes.STRING(120), allowNull: true },
      component_type: {
        type: DataTypes.STRING(60),
        allowNull: true,
        comment: 'Discriminator for polymorphic subtype (camlock, conduit, …)',
      },
      description: { type: DataTypes.TEXT, allowNull: true },

      // ── Pricing ───────────────────────────────────────────────
      price: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      material_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      labor_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      mat_cost: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
        defaultValue: 0,
        comment: 'Material cost (from Excel "MAT COST" column)',
      },

      // ── V2 spine columns (added by V2 migration) ──────────────
      price_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'FIRM',
        validate: { isIn: [['FIRM', 'ESTIMATED', 'PENDING_RFQ']] },
      },
      standards_regime: { type: DataTypes.STRING(8), allowNull: true },
      dims_h_in: { type: DataTypes.DECIMAL(8, 3), allowNull: true },
      dims_w_in: { type: DataTypes.DECIMAL(8, 3), allowNull: true },
      dims_d_in: { type: DataTypes.DECIMAL(8, 3), allowNull: true },
      weight_lbs: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
      pct_rated: { type: DataTypes.INTEGER, allowNull: true },
      ul_listing: { type: DataTypes.STRING(40), allowNull: true },
      voltage_rating_type: { type: DataTypes.STRING(20), allowNull: true },

      // ── Labour-hour buckets (verbatim from configurator Excel import) ─
      lbr_cu: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_asm: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_cnt: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_qc: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_tst: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_eng: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },
      lbr_cad: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 0 },

      // ── Subtype-specific data (CAMLOCK color, amperage, …) ────
      specifications: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Free-form JSON for subtype-specific fields and Excel metadata',
      },
      image_url: { type: DataTypes.TEXT, allowNull: true },

      // ── Original Excel metadata (Phase 0 analysis §4.5) ───────
      excel_date: { type: DataTypes.STRING(40), allowNull: true },
      comments: { type: DataTypes.TEXT, allowNull: true },

      // ── Lifecycle ─────────────────────────────────────────────
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      // ── Tenant + audit ────────────────────────────────────────
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
      deleted_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'configurator_components',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return ConfiguratorComponent;
};
