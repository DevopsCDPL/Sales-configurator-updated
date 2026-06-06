'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const cols = await queryInterface.describeTable('mgmt_procurement_pos');

    if (!cols.cost_mode) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'cost_mode', {
        type: Sequelize.STRING(20), allowNull: true, defaultValue: 'unit',
      });
    }
    if (!cols.unit_cost) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'unit_cost', {
        type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0,
      });
    }
    if (!cols.cost_per_weight) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'cost_per_weight', {
        type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0,
      });
    }
    if (!cols.weight_unit) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'weight_unit', {
        type: Sequelize.STRING(10), allowNull: true, defaultValue: 'KG',
      });
    }
    if (!cols.line_total) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'line_total', {
        type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0,
      });
    }
    if (!cols.terms_conditions) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'terms_conditions', {
        type: Sequelize.TEXT, allowNull: true,
      });
    }
    if (!cols.condition) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'condition', {
        type: Sequelize.STRING(200), allowNull: true,
      });
    }
    if (!cols.form) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'form', {
        type: Sequelize.STRING(50), allowNull: true,
      });
    }
    if (!cols.shape) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'shape', {
        type: Sequelize.STRING(50), allowNull: true,
      });
    }
    if (!cols.dimensions) {
      await queryInterface.addColumn('mgmt_procurement_pos', 'dimensions', {
        type: Sequelize.JSONB, allowNull: true, defaultValue: {},
      });
    }
  },

  down: async (queryInterface) => {
    const cols = await queryInterface.describeTable('mgmt_procurement_pos');
    for (const col of ['cost_mode', 'unit_cost', 'cost_per_weight', 'weight_unit', 'line_total', 'terms_conditions', 'condition', 'form', 'shape', 'dimensions']) {
      if (cols[col]) await queryInterface.removeColumn('mgmt_procurement_pos', col);
    }
  },
};
