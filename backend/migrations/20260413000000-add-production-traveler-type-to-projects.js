'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add production_traveler_type column to projects table
    // This stores the traveler type at project creation time
    // so existing projects keep their original traveler type
    await queryInterface.addColumn('projects', 'production_traveler_type', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'machining_industry',
      comment: 'Production traveler type captured at project creation (machining_industry or anodizing_industry)'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('projects', 'production_traveler_type');
  }
};
