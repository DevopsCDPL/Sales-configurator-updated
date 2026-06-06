'use strict';

/**
 * Phase 3: Settings Independence
 *
 * Adds a proper company_id column to the settings table, replacing the
 * brittle `${key}:${companyId}` string-based scoping pattern.
 *
 * Changes:
 * 1. Add `id` UUID as the new primary key (settings previously used `key` as PK)
 * 2. Add `company_id` UUID (nullable — NULL = global/platform-level row)
 * 3. Migrate existing `key:UUID` rows → key=baseKey, company_id=UUID
 * 4. Remove old string PK constraint, add new id-based PK
 * 5. Add partial unique indexes:
 *    - UNIQUE (key) WHERE company_id IS NULL      (one global row per key)
 *    - UNIQUE (key, company_id) WHERE company_id IS NOT NULL  (one per company per key)
 * 6. Add FK constraint + index on company_id
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. Add new id column (will become PK)
      await queryInterface.addColumn('settings', 'id', {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
      }, { transaction: t });

      // 2. Add company_id column (nullable)
      await queryInterface.addColumn('settings', 'company_id', {
        type: Sequelize.DataTypes.UUID,
        allowNull: true,
      }, { transaction: t });

      // 3. Migrate existing `baseKey:UUID` rows — extract UUID into company_id column
      //    Uses a regex to detect UUID suffix: 8-4-4-4-12 hex groups
      await queryInterface.sequelize.query(`
        UPDATE settings
        SET company_id = split_part(key, ':', 2)::uuid,
            key        = split_part(key, ':', 1)
        WHERE key LIKE '%:%'
          AND split_part(key, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `, { transaction: t });

      // 4a. Remove the old PK constraint (was on `key`)
      await queryInterface.sequelize.query(
        'ALTER TABLE settings DROP CONSTRAINT settings_pkey',
        { transaction: t }
      );

      // 4b. Set the new PK on `id`
      await queryInterface.sequelize.query(
        'ALTER TABLE settings ADD PRIMARY KEY (id)',
        { transaction: t }
      );

      // 5a. Partial unique index for global rows (company_id IS NULL)
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX settings_key_global_unique ON settings (key) WHERE company_id IS NULL',
        { transaction: t }
      );

      // 5b. Partial unique index for company-scoped rows (company_id IS NOT NULL)
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX settings_key_company_unique ON settings (key, company_id) WHERE company_id IS NOT NULL',
        { transaction: t }
      );

      // 6. Index on company_id for fast per-company lookups
      await queryInterface.addIndex('settings', ['company_id'], {
        name: 'settings_company_id_idx',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // Re-embed company_id back into the key string
      await queryInterface.sequelize.query(`
        UPDATE settings
        SET key = key || ':' || company_id::text
        WHERE company_id IS NOT NULL
      `, { transaction: t });

      // Drop indexes
      await queryInterface.removeIndex('settings', 'settings_company_id_idx', { transaction: t });
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS settings_key_company_unique', { transaction: t });
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS settings_key_global_unique', { transaction: t });

      // Restore original PK on `key`
      await queryInterface.sequelize.query('ALTER TABLE settings DROP CONSTRAINT settings_pkey', { transaction: t });
      await queryInterface.sequelize.query('ALTER TABLE settings ADD PRIMARY KEY (key)', { transaction: t });

      // Remove added columns
      await queryInterface.removeColumn('settings', 'company_id', { transaction: t });
      await queryInterface.removeColumn('settings', 'id', { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
