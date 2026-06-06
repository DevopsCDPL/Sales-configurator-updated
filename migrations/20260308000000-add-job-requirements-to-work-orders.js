'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('work_orders', 'job_requirements', {
      type: Sequelize.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Per-job requirement strings, keyed by job index',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('work_orders', 'job_requirements');
  },
};
