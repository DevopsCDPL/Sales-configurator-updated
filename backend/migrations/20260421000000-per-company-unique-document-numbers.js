'use strict';

/**
 * Migration: Per-company unique constraints for auto-generated document numbers
 *
 * Document numbering (MSTK-, MAT-, PRT-, RFQ-, PO-, SO-, PRJ-, QTN-, INV-) is
 * scoped per company_id. Without this fix, the global UNIQUE constraints created
 * by the original CREATE TABLE migrations cause every non-first company to fail
 * with `duplicate key value violates unique constraint` on the second insert.
 *
 * For each affected (table, column):
 *   1. Drop the global unique constraint (default name: <table>_<col>_key) and
 *      any custom-named unique indexes.
 *   2. Create a composite unique index on (col, COALESCE(company_id, sentinel))
 *      so the same id can co-exist across companies but never within one.
 *
 * Mirrors the runtime self-healing block in backend/src/index.js so DBs that
 * never get migrations applied (Railway auto-deploy) and DBs that do (manual
 * `db:migrate` runs) end up identical.
 */

const TABLES = [
  // [tableName, idColumn, indexName]
  ['stocks',                 'stock_id',           'stocks_stock_id_company_unique'],
  ['raw_materials',          'material_id',        'raw_materials_material_id_company_unique'],
  ['parts',                  'part_id_seq',        'parts_part_id_seq_company_unique'],
  ['mgmt_procurement_pos',   'po_number',          'mgmt_pos_number_company_unique'],
  ['mgmt_procurement_rfqs',  'rfq_number',         'mgmt_rfqs_number_company_unique'],
  ['procurement_pos',        'po_number',          'procurement_pos_number_company_unique'],
  ['procurement_rfq',        'rfq_number',         'procurement_rfq_number_company_unique'],
  ['vendor_purchase_orders', 'po_number',          'vendor_pos_number_company_unique'],
  ['sales_orders',           'sales_order_number', 'sales_orders_number_company_unique'],
  ['projects',               'project_number',     'projects_project_number_company_unique'],
  ['projects',               'quotation_number',   'projects_quotation_number_company_unique'],
];

module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;

    for (const [table, col, idxName] of TABLES) {
      try {
        // Skip tables that don't exist in this DB
        const [exists] = await sequelize.query(
          `SELECT to_regclass(:t) AS reg`,
          { replacements: { t: table } }
        );
        if (!exists?.[0]?.reg) {
          console.log(`[per-company-unique] Skipping ${table} — table does not exist`);
          continue;
        }

        // 1. Drop standard PG unique constraint
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_${col}_key";
          EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL;
          END $$;
        `);
        // 2. Drop any plain unique index variants
        await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}_key";`);
        await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}";`);
        await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}_unique";`);
        // 3. Drop legacy custom-named indexes
        if (table === 'stocks' && col === 'stock_id') {
          await sequelize.query(`DROP INDEX IF EXISTS idx_stocks_stock_id;`);
        }
        if (table === 'raw_materials' && col === 'material_id') {
          await sequelize.query(`DROP INDEX IF EXISTS raw_materials_material_id_idx;`);
        }
        // 4. Create per-company composite unique index (NULL-safe)
        await sequelize.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}"
            ON "${table}" ("${col}", COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
            WHERE "${col}" IS NOT NULL;
        `);
        console.log(`[per-company-unique] ${table}.${col} → ${idxName} OK`);
      } catch (err) {
        console.warn(`[per-company-unique] ${table}.${col} failed: ${err.message}`);
      }
    }
  },

  down: async (queryInterface) => {
    const { sequelize } = queryInterface;
    for (const [table, col, idxName] of TABLES) {
      try {
        await sequelize.query(`DROP INDEX IF EXISTS "${idxName}";`);
        // Best-effort restore of the original global unique (may fail if duplicates exist)
        try {
          await queryInterface.addConstraint(table, {
            type: 'unique',
            fields: [col],
            name: `${table}_${col}_key`,
          });
        } catch (_e) { /* ignore — may have cross-company duplicates now */ }
      } catch (err) {
        console.warn(`[per-company-unique:down] ${table}.${col} failed: ${err.message}`);
      }
    }
  },
};
