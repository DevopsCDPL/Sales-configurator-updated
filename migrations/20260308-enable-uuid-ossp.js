"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Enable uuid-ossp extension if not already enabled
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  },
  down: async (queryInterface, Sequelize) => {
    // Optionally, you can remove the extension (not recommended if other tables use UUIDs)
    // await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS "uuid-ossp";');
  }
};
