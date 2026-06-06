'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Extends the existing `projects.status` ENUM with two new values
 * required by the Configuration sub-flow:
 *
 *   • 'configured'         — set when a Configuration is finalized
 *   • 'drawing_generated'  — set after Drawing-Generation step
 *
 * Strictly additive (PostgreSQL cannot remove ENUM values), so the
 * down() migration is intentionally a no-op. Forge backward
 * compatibility is preserved because every existing project status
 * value is still present.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'configured';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_projects_status" ADD VALUE IF NOT EXISTS 'drawing_generated';
    `);
  },

  async down() {
    // No-op: PostgreSQL does not support removing ENUM values without
    // rebuilding the type. Rolling back would require dropping the
    // projects.status default + recreating the ENUM, which would force
    // a full re-validation of historical projects. Phase-1 policy is
    // additive-only.
  },
};
