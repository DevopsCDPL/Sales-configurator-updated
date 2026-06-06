const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProjectAnalytics = sequelize.define('ProjectAnalytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    part_description: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    total: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    mfg_cost: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    profit: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    materials_unused: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    raw_material_used: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    purchased_dimension: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    dimension_after_usage: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    qty_available: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    audit_info: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'project_analytics',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return ProjectAnalytics;
};
