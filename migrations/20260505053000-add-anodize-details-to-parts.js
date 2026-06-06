'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('parts', 'anodize_alkaline_wash', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'No',
    });
    await queryInterface.addColumn('parts', 'anodize_masking', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'No',
    });
    await queryInterface.addColumn('parts', 'anodize_acid_etch', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'No',
    });
    await queryInterface.addColumn('parts', 'anodize_neutralize', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'No',
    });
    await queryInterface.addColumn('parts', 'anodize_dye', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'No',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('parts', 'anodize_alkaline_wash');
    await queryInterface.removeColumn('parts', 'anodize_masking');
    await queryInterface.removeColumn('parts', 'anodize_acid_etch');
    await queryInterface.removeColumn('parts', 'anodize_neutralize');
    await queryInterface.removeColumn('parts', 'anodize_dye');
  }
};