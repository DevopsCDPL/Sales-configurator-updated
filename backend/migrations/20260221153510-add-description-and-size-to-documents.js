'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('documents');

    if (!table.description) {
      await queryInterface.addColumn('documents', 'description', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }

    if (!table.size) {
      await queryInterface.addColumn('documents', 'size', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('documents');

    if (table.description) {
      await queryInterface.removeColumn('documents', 'description');
    }

    if (table.size) {
      await queryInterface.removeColumn('documents', 'size');
    }
  },
};