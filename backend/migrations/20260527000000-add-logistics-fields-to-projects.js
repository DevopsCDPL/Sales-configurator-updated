'use strict';

/**
 * Adds logistics-specific columns to the `projects` table.
 *
 * These columns are required by the logistics workflow and are read/written
 * by both the Node.js and Java backends via the `/api/logistics` routes.
 * All columns are nullable so existing rows are unaffected.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS dispatch_date     TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS tracking_number   VARCHAR(100),
        ADD COLUMN IF NOT EXISTS carrier           VARCHAR(100),
        ADD COLUMN IF NOT EXISTS packaging_details TEXT,
        ADD COLUMN IF NOT EXISTS logistics_notes   TEXT,
        ADD COLUMN IF NOT EXISTS shipment_method   VARCHAR(50);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE projects
        DROP COLUMN IF EXISTS dispatch_date,
        DROP COLUMN IF EXISTS tracking_number,
        DROP COLUMN IF EXISTS carrier,
        DROP COLUMN IF EXISTS packaging_details,
        DROP COLUMN IF EXISTS logistics_notes,
        DROP COLUMN IF EXISTS shipment_method;
    `);
  },
};
