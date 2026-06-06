'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('rfq_bundles', 'instructions', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Array of instruction strings shown on RFQ PDF',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('rfq_bundles', 'instructions');
  },
};
