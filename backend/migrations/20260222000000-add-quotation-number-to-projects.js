'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('projects', 'quotation_number', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('projects', 'quotation_number');
  }
};
