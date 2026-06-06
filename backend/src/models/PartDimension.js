const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PartDimension = sequelize.define('PartDimension', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    part_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'parts', key: 'id' },
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    value: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    unit: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: 'mm',
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
    tableName: 'part_dimensions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return PartDimension;
};
