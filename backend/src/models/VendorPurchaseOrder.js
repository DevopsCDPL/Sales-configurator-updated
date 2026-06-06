const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VendorPurchaseOrder = sequelize.define('VendorPurchaseOrder', {
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
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    rfq_bundle_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'rfq_bundles', key: 'id' },
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
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'exempt',
    },
    subtotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    tax_amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grand_total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    quotation_file: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    terms_conditions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cost_mode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'unit',
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'acknowledged', 'delivered', 'cancelled'),
      defaultValue: 'draft',
    },
    ratings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
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
  }, {
    tableName: 'vendor_purchase_orders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return VendorPurchaseOrder;
};
