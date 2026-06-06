const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProcurementRFQItem = sequelize.define('ProcurementRFQItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rfq_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'procurement_rfq',
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
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Kg',
    },
  }, {
    tableName: 'procurement_rfq_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ProcurementRFQItem;
};
