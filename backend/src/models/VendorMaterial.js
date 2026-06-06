const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VendorMaterial = sequelize.define('VendorMaterial', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    part_description: {
      type: DataTypes.STRING,
      allowNull: false
    },
    material_grade: {
      type: DataTypes.STRING,
      allowNull: false
    },
    dimension: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    tableName: 'vendor_materials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return VendorMaterial;
};
