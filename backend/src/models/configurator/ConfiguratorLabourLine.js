'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorLabourLine
 *
 * Per-category labour-hour summary for a configuration.
 *
 * Source: `Component.lbr_*` columns aggregated by the configurator
 * pricing engine (`quotation_calc.py`).
 *
 * Categories: 'cu' (copper), 'asm' (assembly), 'cnt' (connection/control),
 * 'qc' (quality), 'tst' (test), 'eng' (engineering), 'cad' (CAD).
 */
module.exports = (sequelize) => {
  const ConfiguratorLabourLine = sequelize.define(
    'ConfiguratorLabourLine',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      configuration_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_configurations', key: 'id' },
        onDelete: 'CASCADE',
      },
      category: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'cu | asm | cnt | qc | tst | eng | cad',
      },
      hours: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      rate: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      total_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },

      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
    },
    {
      tableName: 'configurator_labour_lines',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorLabourLine;
};
