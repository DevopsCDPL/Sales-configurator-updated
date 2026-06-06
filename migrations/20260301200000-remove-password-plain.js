'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'password_plain');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'password_plain', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  }
};
