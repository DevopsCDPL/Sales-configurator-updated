'use strict';

/**
 * Multi-Tenant HARDENING Migration
 * ─────────────────────────────────
 * ⚠️  RUN ONLY AFTER FULL TESTING AND VERIFICATION ⚠️
 *
 * This migration adds NOT NULL constraints to company_id on key tables.
 * Before running:
 *   1. Verify all rows have company_id set (run verification query)
 *   2. Verify platform_admin users have NULL company_id (that's correct)
 *   3. Verify application works correctly with tenant filtering
 *   4. Verify new company creation works
 *   5. Verify existing data is visible and accessible
 *
 * DO NOT run this migration until ALL of the above are confirmed.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('[TENANT-HARDENING] Starting hardening...');

      // Tables to harden (add NOT NULL constraint on company_id)
      // Excludes: users (platform_admin has NULL company_id)
      // Excludes: system tables (settings, otp_tokens, etc.)
      const tablesToHarden = [
        'projects',
        'clients',
        'vendors',
        'documents',
        'estimates',
        'sales_orders',
        'work_orders',
        'quality_records',
        'parts',
        'stocks',
        'materials',
        'raw_materials',
      ];

      for (const table of tablesToHarden) {
        // Safety check: verify zero NULLs before adding constraint
        const [nullCheck] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as cnt FROM ${table} WHERE company_id IS NULL`,
          { transaction }
        );
        const nullCount = parseInt(nullCheck[0].cnt, 10);

        if (nullCount > 0) {
          console.error(`[TENANT-HARDENING] ❌ ABORT: ${table} has ${nullCount} NULL company_id rows`);
          throw new Error(
            `Cannot harden ${table}: ${nullCount} rows still have NULL company_id. Fix data first.`
          );
        }

        // Add NOT NULL constraint
        await queryInterface.changeColumn(table, 'company_id', {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'companies', key: 'id' },
        }, { transaction });

        console.log(`[TENANT-HARDENING] ✓ ${table}.company_id set to NOT NULL`);
      }

      await transaction.commit();
      console.log('[TENANT-HARDENING] ✅ Hardening complete');

    } catch (error) {
      await transaction.rollback();
      console.error('[TENANT-HARDENING] ❌ Failed:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Roll back: make company_id nullable again
    const tables = [
      'projects', 'clients', 'vendors', 'documents',
      'estimates', 'sales_orders', 'work_orders', 'quality_records',
      'parts', 'stocks', 'materials', 'raw_materials',
    ];

    for (const table of tables) {
      await queryInterface.changeColumn(table, 'company_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      }).catch(() => {});
    }
  }
};
