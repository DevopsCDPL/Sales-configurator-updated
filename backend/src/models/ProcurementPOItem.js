const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementPOItem = sequelize.define('ProcurementPOItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    po_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'procurement_po',
        key: 'id',
      },
    },
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'materials',
        key: 'id',
      },
    },
    quantity: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    price_per_unit: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    heat_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Kg',
    },
  }, {
    tableName: 'procurement_po_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementPOItem;
};
