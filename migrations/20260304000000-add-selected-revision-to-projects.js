'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add selected_revision column to projects table
    await queryInterface.addColumn('projects', 'selected_revision', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Selected estimate revision for quotation and approval'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('projects', 'selected_revision');
  }
};
