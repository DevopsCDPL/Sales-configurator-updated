const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RawMaterial = sequelize.define('RawMaterial', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    material_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      // Per-company unique — enforced via composite index (see index.js pre-sync).
      comment: 'Material ID (MAT-00001), unique per company',
    },
    material_category: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    material_grade: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    condition: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    density: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    form: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shape: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    cost_per_unit: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    cost_unit: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: '$/lb',
    },
    dimensions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    unit_system: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'imperial',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
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
    tableName: 'raw_materials',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return RawMaterial;
};
