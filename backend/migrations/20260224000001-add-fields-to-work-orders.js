'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('work_orders', 'target_date', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('work_orders', 'approved_by', {
      type: Sequelize.STRING(150),
      allowNull: true,
    });
    await queryInterface.addColumn('work_orders', 'quality_requirements', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('work_orders', 'special_instructions', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('work_orders', 'target_date');
    await queryInterface.removeColumn('work_orders', 'approved_by');
    await queryInterface.removeColumn('work_orders', 'quality_requirements');
    await queryInterface.removeColumn('work_orders', 'special_instructions');
  },
};
