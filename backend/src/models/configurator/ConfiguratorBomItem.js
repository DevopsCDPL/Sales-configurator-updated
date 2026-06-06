'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorBomItem
 *
 * Compiled BOM (Bill of Materials) line for a configuration. Produced by
 * the Phase 2 `bomEngine` from a Configuration's `config_data`.
 *
 * Kept normalized (instead of pure JSONB) so analytics/reporting can
 * aggregate across configurations without un-nesting JSON.
 */
module.exports = (sequelize) => {
  const ConfiguratorBomItem = sequelize.define(
    'ConfiguratorBomItem',
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
      component_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'SET NULL',
        comment: 'NULL allowed for ad-hoc / manually-added BOM rows',
      },
      step_key: {
        type: DataTypes.STRING(60),
        allowNull: true,
        comment: 'Configurator step that produced this row (enclosure, bussing, …)',
      },
      category: { type: DataTypes.STRING(120), allowNull: true },
      part_number: { type: DataTypes.STRING(120), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 1,
      },
      unit: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'ea' },
      unit_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      total_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },

      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
    },
    {
      tableName: 'configurator_bom_items',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorBomItem;
};
