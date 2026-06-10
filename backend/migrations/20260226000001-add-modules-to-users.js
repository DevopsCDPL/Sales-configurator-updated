'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'modules', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings']
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'modules');
  }
};
