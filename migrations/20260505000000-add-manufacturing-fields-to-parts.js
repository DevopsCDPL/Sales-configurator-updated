'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('parts');

    if (!tableInfo.manufacturing_type) {
      await queryInterface.addColumn('parts', 'manufacturing_type', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!tableInfo.cut_method) {
      await queryInterface.addColumn('parts', 'cut_method', {
        type: Sequelize.STRING(250),
        allowNull: true,
      });
    }
    if (!tableInfo.cut_length) {
      await queryInterface.addColumn('parts', 'cut_length', {
        type: Sequelize.STRING(250),
        allowNull: true,
      });
    }
    if (!tableInfo.lathe_ops_required) {
      await queryInterface.addColumn('parts', 'lathe_ops_required', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Yes',
      });
    }
    if (!tableInfo.mill_ops_required) {
      await queryInterface.addColumn('parts', 'mill_ops_required', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Yes',
      });
    }
    if (!tableInfo.deburr_required) {
      await queryInterface.addColumn('parts', 'deburr_required', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Yes',
      });
    }
    if (!tableInfo.heat_treat_required) {
      await queryInterface.addColumn('parts', 'heat_treat_required', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Yes',
      });
    }
    if (!tableInfo.marking_required) {
      await queryInterface.addColumn('parts', 'marking_required', {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Yes',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('parts');
    
    if (tableInfo.manufacturing_type) await queryInterface.removeColumn('parts', 'manufacturing_type');
    if (tableInfo.cut_method) await queryInterface.removeColumn('parts', 'cut_method');
    if (tableInfo.cut_length) await queryInterface.removeColumn('parts', 'cut_length');
    if (tableInfo.lathe_ops_required) await queryInterface.removeColumn('parts', 'lathe_ops_required');
    if (tableInfo.mill_ops_required) await queryInterface.removeColumn('parts', 'mill_ops_required');
    if (tableInfo.deburr_required) await queryInterface.removeColumn('parts', 'deburr_required');
    if (tableInfo.heat_treat_required) await queryInterface.removeColumn('parts', 'heat_treat_required');
    if (tableInfo.marking_required) await queryInterface.removeColumn('parts', 'marking_required');
  }
};
