const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VendorPOItem = sequelize.define('VendorPOItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendor_po_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendor_purchase_orders', key: 'id' },
    },
    part_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    part_description: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    unit_cost: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    line_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    weight: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0,
    },
    weight_unit: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'KG',
    },
    cost_per_weight: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0,
    },
    selected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'vendor_po_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return VendorPOItem;
};
