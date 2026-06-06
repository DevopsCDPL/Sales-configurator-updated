const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Stock = sequelize.define('Stock', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    stock_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      // Uniqueness is per-company (composite index on stock_id + company_id) —
      // see pre-sync block in index.js. Do NOT set unique:true here.
      comment: 'Auto-generated display ID (e.g. MSTK-0001), unique per company',
    },
    part_description: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    material_grade: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    condition: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    shape: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    dimension: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    heat_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    raw_material_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'raw_materials', key: 'id' },
      comment: 'FK to raw_materials for ID-based heat number matching',
    },
    certificate_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path to uploaded material certificate file',
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id',
      },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  }, {
    tableName: 'stocks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return Stock;
};
