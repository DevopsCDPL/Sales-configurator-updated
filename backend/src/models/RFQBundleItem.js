const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RFQBundleItem = sequelize.define('RFQBundleItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    rfq_bundle_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'rfq_bundles',
        key: 'id'
      }
    },
    part_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'ID of the custom part from estimate'
    },
    part_description: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    material: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    material_grade: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'pcs'
    },
    quoted_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'rfq_bundle_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return RFQBundleItem;
};
