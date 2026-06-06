'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('companies');
    if (!tableInfo.logo_data) {
      await queryInterface.addColumn('companies', 'logo_data', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Base64-encoded logo data URI for persistence across deploys',
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('companies');
    if (tableInfo.logo_data) {
      await queryInterface.removeColumn('companies', 'logo_data');
    }
  },
};
