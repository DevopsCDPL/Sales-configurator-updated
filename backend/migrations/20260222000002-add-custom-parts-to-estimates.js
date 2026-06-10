'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('estimates', 'custom_parts', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: []
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('estimates', 'custom_parts');
  }
};
