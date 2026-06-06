const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MaterialVendorMapping = sequelize.define('MaterialVendorMapping', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'materials', key: 'id' },
      onDelete: 'CASCADE',
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'vendors', key: 'id' },
      onDelete: 'CASCADE',
    },
    price_per_unit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    lead_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  }, {
    tableName: 'material_vendor_mappings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MaterialVendorMapping;
};
