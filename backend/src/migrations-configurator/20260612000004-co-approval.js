'use strict';

/**
 * 20260612000004-co-approval — additive: add approval-workflow columns to
 * configurator_change_orders so COs can flow pending_approval → applied /
 * rejected instead of being instantly applied.
 *
 * Columns added (IF NOT EXISTS):
 *   approved_at     TIMESTAMPTZ  — when approve route stamped the CO
 *   rejected_reason TEXT         — free-text reason supplied by rejector
 *
 * Existing rows without these columns default to NULL (applied COs stay
 * valid — their status column already reads 'applied').
 *
 * The status column already exists with value 'applied' on legacy rows;
 * this migration does NOT alter the column's CHECK constraint because
 * Sequelize validates at the ORM level. The new 'pending_approval' value
 * is accepted by the DB (VARCHAR) and validated by the model.
 *
 * Strictly IF-NOT-EXISTS / additive — safe to run against the live DB.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_change_orders')) return;

    const desc = await queryInterface.describeTable('configurator_change_orders');

    if (!desc.approved_at) {
      await queryInterface.addColumn('configurator_change_orders', 'approved_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!desc.rejected_reason) {
      await queryInterface.addColumn('configurator_change_orders', 'rejected_reason', {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down() {
    // No-op: additive-only policy (matches Phase A/V2 migrations).
  },
};
