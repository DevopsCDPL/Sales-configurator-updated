'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorQuotationItem
 *
 * Normalized quotation line. Mirror of the JSON `items` array stored in
 * the configurator's original `quotations.bom_spec` blob, surfaced as
 * rows so reporting/analytics can query without un-nesting.
 */
module.exports = (sequelize) => {
  const ConfiguratorQuotationItem = sequelize.define(
    'ConfiguratorQuotationItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      quotation_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_quotations', key: 'id' },
        onDelete: 'CASCADE',
      },
      component_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'SET NULL',
      },
      line_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      step_key: { type: DataTypes.STRING(60), allowNull: true },
      category: { type: DataTypes.STRING(120), allowNull: true },
      part_number: { type: DataTypes.STRING(120), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      unit: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'ea' },
      unit_price: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      line_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },

      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
    },
    {
      tableName: 'configurator_quotation_items',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorQuotationItem;
};
