'use strict';

module.exports = {
  async up(queryInterface) {
    // Add 'premium' to the plan enum if it doesn't exist
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'premium'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_companies_plan')
        ) THEN
          ALTER TYPE "enum_companies_plan" ADD VALUE 'premium';
        END IF;
      END$$;
    `);
  },

  async down(queryInterface) {
    // Cannot remove enum values in PostgreSQL
  }
};
