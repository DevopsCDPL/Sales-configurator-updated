'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Idempotent: pre-sync hook in backend/src/index.js may have already added
    // this column on running deployments. Use raw SQL with IF NOT EXISTS so
    // `sequelize-cli db:migrate` succeeds in either case and does not break
    // existing work_orders data.
    await queryInterface.sequelize.query(`
      ALTER TABLE work_orders
        ADD COLUMN IF NOT EXISTS production_traveler_number VARCHAR(50);
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_production_traveler_number
        ON work_orders (production_traveler_number)
        WHERE production_traveler_number IS NOT NULL;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_work_orders_production_traveler_number;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE work_orders DROP COLUMN IF EXISTS production_traveler_number;
    `);
  },
};
