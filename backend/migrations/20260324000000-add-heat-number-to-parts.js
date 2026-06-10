'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('parts', 'heat_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Heat Number for material traceability',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('parts', 'heat_number');
  },
};
