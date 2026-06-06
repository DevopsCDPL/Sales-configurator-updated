'use strict';

/**
 * Phase 4 follow-up: Ensure forged_app has default privileges.
 *
 * The previous RLS migration (20260418200000) created the forged_app role and
 * granted it access to all existing tables. This migration sets DEFAULT PRIVILEGES
 * so forged_app also gets access to tables/sequences created in the future
 * (e.g. by sequelize.sync() on subsequent deploys).
 *
 * Also re-grants on all current tables in case any were missed.
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const t = await q.transaction();
    try {
      // Grant on all currently existing tables/sequences
      await q.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forged_app`,
        { transaction: t }
      );
      await q.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forged_app`,
        { transaction: t }
      );

      // Default privileges: any future table/sequence created by the current role
      // will automatically be accessible to forged_app.
      await q.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public
           GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forged_app`,
        { transaction: t }
      );
      await q.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public
           GRANT USAGE, SELECT ON SEQUENCES TO forged_app`,
        { transaction: t }
      );

      await t.commit();
      console.log('[Phase 4] Default privileges for forged_app applied.');
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    const t = await q.transaction();
    try {
      await q.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public
           REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM forged_app`,
        { transaction: t }
      );
      await q.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public
           REVOKE USAGE, SELECT ON SEQUENCES FROM forged_app`,
        { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
