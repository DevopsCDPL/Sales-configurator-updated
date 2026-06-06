const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MgmtProcurementRFQ = sequelize.define('MgmtProcurementRFQ', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rfq_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      // Per-company unique — composite index in DB (see index.js pre-sync).
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    need_materials_before: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('Draft', 'Sent'),
      defaultValue: 'Draft',
    },
    // ── Part snapshot (frozen at selection time) ────────────────────────
    part_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Reference to original part (traceability only)',
    },
    part_name: { type: DataTypes.STRING(300), allowNull: true },
    material_category: { type: DataTypes.STRING(50), allowNull: true },
    material_grade: { type: DataTypes.STRING(200), allowNull: true },
    density: { type: DataTypes.FLOAT, allowNull: true },
    form: { type: DataTypes.STRING(50), allowNull: true },
    shape: { type: DataTypes.STRING(50), allowNull: true },
    dimensions: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    weight_per_piece: { type: DataTypes.FLOAT, allowNull: true },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 1,
    },
    // ── Multi-part line items (JSONB array) ────────────────────────
    line_items: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of {part_id, part_name, material_category, material_grade, density, form, shape, dimensions, weight_per_piece, quantity}',
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendors', key: 'id' },
    },
    parent_rfq_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Links split RFQs back to original draft',
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
    deleted_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    deleted_by: { type: DataTypes.UUID, allowNull: true, defaultValue: null, references: { model: 'users', key: 'id' } },
  }, {
    tableName: 'mgmt_procurement_rfqs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MgmtProcurementRFQ;
};
