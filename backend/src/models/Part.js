const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Part = sequelize.define('Part', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    part_id_seq: {
      type: DataTypes.STRING(20),
      allowNull: true,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    part_name: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    part_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Part Number / Drawing Number',
    },
    heat_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Heat Number for material traceability',
    },
    revision: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'R0',
      comment: 'Part revision (R0-R8)',
    },
    drawing_given_by_client: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Whether drawing was provided by client',
    },
    drawing_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'URL/path to uploaded drawing PDF',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // ─── Material (linked to Raw Material Master - MANDATORY) ────
    raw_material_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'raw_materials', key: 'id' },
    },
    material_category: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    material_grade: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    condition: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    density: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    // ─── Form & Shape ───────────────────────────────────────────
    form: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shape: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // ─── Dimensions & Volume ────────────────────────────────────
    dimensions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    volume: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    // ─── Weight ─────────────────────────────────────────────────
    weight_per_piece: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    total_weight: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    weight_unit: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'Kg',
    },
    // ─── Quantity ───────────────────────────────────────────────
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    // ─── Cost ───────────────────────────────────────────────────
    cost_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: 'Per Kg',
    },
    cost_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    cost_per_piece: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    total_cost: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    // ─── Manufacturing Details ──────────────────────────────────
    manufacturing_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Machining',
    },
    operator_initials: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    cut_method: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    cut_length: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    lathe_ops_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    mill_ops_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    deburr_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    heat_treat_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    marking_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    final_qc_inspection_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    final_acceptance_required: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    },
    // ─── Anodizing Specs ────────────────────────────────────────
    anodize_type: { type: DataTypes.STRING(50), allowNull: true },
    anodize_thickness_spec: { type: DataTypes.STRING(50), allowNull: true },
    anodize_class: { type: DataTypes.STRING(50), allowNull: true },
    anodize_dye_color: { type: DataTypes.STRING(50), allowNull: true },
    anodize_seal: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    anodize_mask_threads: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    anodize_tumbled: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    anodize_scotch_brite: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    // ─── Anodizing Ops ──────────────────────────────────────────
    anodize_visual_inspection: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_alkaline_wash: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_masking: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_racking: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_secondary_cleaning: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_caustic_etch: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_acid_etch: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_deox_rinse: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_anodize_rinse: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_neutralize: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_dye: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_seal_rinse: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_dry: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_un_rack: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_technical_inspect: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_commercial_inspection: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_package: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_final_acceptance: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    anodize_product_release: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'Yes' },
    // ─── Vendor (future-ready, no UI change now) ────────────────
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'vendors', key: 'id' },
    },
    client_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'clients', key: 'id' },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
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
    // Keep legacy columns for backward compat (nullable, unused by new logic)
    material_id: { type: DataTypes.UUID, allowNull: true },
    unit: { type: DataTypes.STRING(50), allowNull: true },
    weight: { type: DataTypes.FLOAT, allowNull: true },
    cost_per_unit: { type: DataTypes.FLOAT, allowNull: true },
    auto_calculate: { type: DataTypes.BOOLEAN, allowNull: true },
    vendor_price: { type: DataTypes.FLOAT, allowNull: true },
    vendor_lead_time: { type: DataTypes.INTEGER, allowNull: true },
    manufacturing_type: { type: DataTypes.STRING(100), allowNull: true },
    cut_method: { type: DataTypes.STRING(250), allowNull: true },
    cut_length: { type: DataTypes.STRING(250), allowNull: true },
    lathe_ops_required: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'Yes' },
    mill_ops_required: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'Yes' },
    deburr_required: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'Yes' },
    heat_treat_required: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'Yes' },
    marking_required: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'Yes' },
  }, {
    tableName: 'parts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return Part;
};
