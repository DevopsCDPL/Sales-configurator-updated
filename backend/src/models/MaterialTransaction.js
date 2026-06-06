const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MaterialTransaction = sequelize.define('MaterialTransaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    material_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'materials', key: 'id' },
    },
    type: {
      type: DataTypes.ENUM('IN', 'OUT', 'ADJUSTMENT'),
      allowNull: false,
    },
    direction: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Kg',
    },
    heat_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'vendors', key: 'id' },
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'projects', key: 'id' },
    },
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    reference_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'material_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return MaterialTransaction;
};
