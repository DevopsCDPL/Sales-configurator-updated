'use strict';

module.exports = {
  async up(queryInterface) {
    // Add 'sales_engineer' to the role ENUM type in PostgreSQL
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'sales_engineer';
    `);
  },

  async down() {
    // PostgreSQL does not support removing ENUM values directly.
    // A sales_engineer user would need to be re-assigned before rollback.
    console.log('Cannot remove ENUM value from PostgreSQL. Manual intervention required.');
  }
};
