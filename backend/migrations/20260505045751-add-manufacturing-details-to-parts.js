'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('parts', 'manufacturing_type', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'Machining',
    });
    await queryInterface.addColumn('parts', 'cut_method', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('parts', 'cut_length', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('parts', 'lathe_ops_required', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    });
    await queryInterface.addColumn('parts', 'mill_ops_required', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    });
    await queryInterface.addColumn('parts', 'deburr_required', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    });
    await queryInterface.addColumn('parts', 'heat_treat_required', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    });
    await queryInterface.addColumn('parts', 'marking_required', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Yes',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('parts', 'manufacturing_type');
    await queryInterface.removeColumn('parts', 'cut_method');
    await queryInterface.removeColumn('parts', 'cut_length');
    await queryInterface.removeColumn('parts', 'lathe_ops_required');
    await queryInterface.removeColumn('parts', 'mill_ops_required');
    await queryInterface.removeColumn('parts', 'deburr_required');
    await queryInterface.removeColumn('parts', 'heat_treat_required');
    await queryInterface.removeColumn('parts', 'marking_required');
  }
};
