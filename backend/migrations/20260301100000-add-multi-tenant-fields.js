'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add company_name column
    await queryInterface.addColumn('users', 'company_name', {
      type: Sequelize.STRING(255),
      allowNull: true
    });

    // Add created_by column (tracks which admin created this user)
    await queryInterface.addColumn('users', 'created_by', {
      type: Sequelize.UUID,
      allowNull: true
    });

    // Update role ENUM to include main_admin
    // PostgreSQL requires replacing the enum type
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'main_admin' BEFORE 'admin';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'company_name');
    await queryInterface.removeColumn('users', 'created_by');
    // Note: PostgreSQL does not support removing values from ENUM types
  }
};
