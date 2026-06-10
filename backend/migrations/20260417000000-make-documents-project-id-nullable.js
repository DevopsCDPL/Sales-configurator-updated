'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // The documents.project_id column was originally NOT NULL.
    // Migration 20260409000000 tried to make it nullable via changeColumn,
    // but Sequelize sync({ alter: true }) can also fail to drop NOT NULL
    // on FK columns. This migration explicitly forces it.
    await queryInterface.changeColumn('documents', 'project_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'projects', key: 'id' },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('documents', 'project_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    });
  },
};
