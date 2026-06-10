'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('vendors', 'contact_position', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Vendor contact person position/designation (e.g., Sales Engineer)',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vendors', 'contact_position');
  },
};
