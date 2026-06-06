const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Estimate = sequelize.define('Estimate', {
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
    revision: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_locked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    raw_material_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    process_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    overhead_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    total_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0
    },
    final_price: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    is_approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    approved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    quotation: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    custom_parts: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'estimates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Estimate;
};
