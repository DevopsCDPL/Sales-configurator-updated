const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EstimateItem = sequelize.define('EstimateItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    estimate_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'estimates',
        key: 'id'
      }
    },
    module_type: {
      type: DataTypes.ENUM(
        'cnc_turning',
        'cnc_milling',
        'welding',
        'heat_treatment',
        'grinding',
        'drilling',
        'boring',
        'threading',
        'surface_treatment',
        'assembly',
        'testing',
        'other',
        'laser_cutting',
        'fabrication_welding'
      ),
      allowNull: false
    },
    input_json: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Store module input parameters'
    },
    calculated_json: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Store calculated output values'
    },
    total_cost: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0
    },
    sequence_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'estimate_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return EstimateItem;
};
