'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('raw_materials', 'dimensions', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('raw_materials', 'unit_system', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'imperial',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('raw_materials', 'dimensions');
    await queryInterface.removeColumn('raw_materials', 'unit_system');
  },
};
