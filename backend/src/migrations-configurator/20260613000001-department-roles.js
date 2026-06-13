'use strict';

/**
 * Department RBAC foundation — additive role ENUM extension.
 *
 * Adds 8 new department roles to the existing `users.role` ENUM
 * alongside the current values (platform_admin, main_admin, admin,
 * user, sales_engineer), which are all KEPT untouched:
 *
 *   manufacturing, procurement, assembly, outsourcing,
 *   quality, packing, logistics, commissioning
 *
 * Strictly additive (PostgreSQL cannot remove ENUM values), so the
 * down() migration is intentionally a no-op — same style as the
 * neighboring 20260511000010-extend-projects-status-enum migration.
 * Every ADD VALUE uses IF NOT EXISTS so re-running is non-fatal.
 */
const NEW_ROLES = [
  'manufacturing',
  'procurement',
  'assembly',
  'outsourcing',
  'quality',
  'packing',
  'logistics',
  'commissioning',
];

module.exports = {
  async up(queryInterface) {
    for (const role of NEW_ROLES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS '${role}';`
      );
    }
  },

  async down() {
    // No-op: PostgreSQL does not support removing ENUM values without
    // rebuilding the type. Department-roles policy is additive-only.
  },
};
