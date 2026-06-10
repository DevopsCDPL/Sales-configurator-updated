'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Add new module types to the existing ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_estimate_items_module_type" ADD VALUE IF NOT EXISTS 'laser_cutting';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_estimate_items_module_type" ADD VALUE IF NOT EXISTS 'fabrication_welding';
    `);
  },

  down: async () => {
    // PostgreSQL does not support removing ENUM values directly
    // To rollback, you would need to recreate the type without the new values
  },
};
