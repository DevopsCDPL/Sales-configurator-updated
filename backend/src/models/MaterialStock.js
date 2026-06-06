const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MaterialStock = sequelize.define('MaterialStock', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'materials', key: 'id' },
    },
    current_quantity: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0,
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Kg',
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
    },
    last_updated: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'material_stock',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MaterialStock;
};
