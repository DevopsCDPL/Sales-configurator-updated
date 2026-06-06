const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MgmtProcurementPO = sequelize.define('MgmtProcurementPO', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    po_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    rfq_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'mgmt_procurement_rfqs', key: 'id' },
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendors', key: 'id' },
    },
    po_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    tax_type: {
      type: DataTypes.ENUM('Exempt', '5%', '12%', '18%'),
      defaultValue: 'Exempt',
    },
    // ── Snapshot from RFQ ──────────────────────────────────────────────
    part_name: { type: DataTypes.STRING(300), allowNull: true },
    material_category: { type: DataTypes.STRING(50), allowNull: true },
    material_grade: { type: DataTypes.STRING(200), allowNull: true },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    weight_per_piece: { type: DataTypes.FLOAT, allowNull: true },
    total_weight: { type: DataTypes.FLOAT, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    grand_total: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    cost_mode: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'unit' },
    unit_cost: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    cost_per_weight: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    weight_unit: { type: DataTypes.STRING(10), allowNull: true, defaultValue: 'KG' },
    line_total: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
    // ── Multi-part line items (JSONB array) ────────────────────────
    line_items: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of {part_id, part_name, material_category, material_grade, quantity, weight, unit_cost, cost_per_weight, weight_unit, line_total}',
    },
    terms_conditions: { type: DataTypes.TEXT, allowNull: true },
    condition: { type: DataTypes.STRING(200), allowNull: true },
    form: { type: DataTypes.STRING(50), allowNull: true },
    shape: { type: DataTypes.STRING(50), allowNull: true },
    dimensions: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    status: {
      type: DataTypes.ENUM('Draft', 'Sent', 'Ordered', 'Received'),
      defaultValue: 'Draft',
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
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
    deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    deleted_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null, references: { model: 'users', key: 'id' } },
  }, {
    tableName: 'mgmt_procurement_pos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MgmtProcurementPO;
};
