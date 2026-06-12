'use strict';

/**
 * 20260612000003-rfq-batch-fields — additive: give configurator_price_rfqs a
 * JSONB `meta` column to carry RFQ-batch metadata (batch_code, vendor_id,
 * vendor_name, needed_by, qty) without widening the schema with one column
 * per attribute. Strictly IF-NOT-EXISTS / additive — safe on the live DB.
 *
 * RFQ procurement loop (vendor-grouped price queue → batches).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_price_rfqs')) return;
    const desc = await queryInterface.describeTable('configurator_price_rfqs');
    if (!desc.meta) {
      await queryInterface.addColumn('configurator_price_rfqs', 'meta', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      });
    }
    // Index batch_code lookups inside meta for the batches listing.
    await queryInterface.sequelize
      .query(
        `CREATE INDEX IF NOT EXISTS configurator_price_rfqs_batch_code_idx
         ON configurator_price_rfqs ((meta->>'batch_code'));`
      )
      .catch(() => {});
  },

  async down() {
    // No-op: additive-only policy (matches Phase A/V2 migrations).
  },
};
