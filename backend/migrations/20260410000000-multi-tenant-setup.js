'use strict';

/**
 * Multi-Tenant Setup Migration
 * ─────────────────────────────
 * ZERO DATA LOSS — Uses existing `companies` table as tenants.
 * 
 * What this migration does:
 * 1. Creates a default company "Cholan Dynamics" (CDPL-DEFAULT)
 * 2. Adds company_id (NULLABLE) to tables that lack it
 * 3. Backfills company_id on ALL existing rows from parent relationships or default
 * 4. Verifies zero NULL company_id rows remain on key tables
 * 
 * What this migration does NOT do:
 * - Does NOT create a redundant tenants table (companies table already serves this purpose)
 * - Does NOT drop any column or table
 * - Does NOT add NOT NULL constraints (deferred until full testing)
 * - Does NOT modify existing data beyond adding company_id
 * - Does NOT touch login logic or passwords
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1 + 2: Create default tenant company for ALL existing data
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[TENANT] Step 1-2: Creating default tenant company...');

      // Check if default company already exists
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM companies WHERE company_code = 'CDPL-DEFAULT' LIMIT 1`,
        { transaction }
      );

      let DEFAULT_TENANT_ID;

      if (existing.length > 0) {
        DEFAULT_TENANT_ID = existing[0].id;
        console.log(`[TENANT] Default company already exists: ${DEFAULT_TENANT_ID}`);
      } else {
        // Generate a UUID for the default company
        const [uuidResult] = await queryInterface.sequelize.query(
          `SELECT gen_random_uuid() as id`,
          { transaction }
        );
        DEFAULT_TENANT_ID = uuidResult[0].id;

        await queryInterface.sequelize.query(
          `INSERT INTO companies (id, name, company_code, subscription_status, is_active, plan, user_limit, risk_flags, settings, ip_whitelist, storage_used_mb, created_at, updated_at)
           VALUES (:id, :name, :code, 'active', true, 'enterprise', 999, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, 0, NOW(), NOW())`,
          {
            replacements: {
              id: DEFAULT_TENANT_ID,
              name: 'Cholan Dynamics',
              code: 'CDPL-DEFAULT'
            },
            transaction
          }
        );
        console.log(`[TENANT] Created default company: ${DEFAULT_TENANT_ID}`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: Add company_id column to tables that don't have it
      // All columns are NULLABLE to prevent breaking existing data
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[TENANT] Step 3: Adding company_id columns...');

      const tablesToAddCompanyId = [
        'estimates',
        'estimate_items',
        'sales_orders',
        'work_orders',
        'quality_records',
        'audit_logs',
        'login_history',
        'sessions',
        'invoices',
        'project_analytics',
        'conversations',
      ];

      for (const table of tablesToAddCompanyId) {
        // Check if column already exists
        const [cols] = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = :table AND column_name = 'company_id'`,
          { replacements: { table }, transaction }
        );

        if (cols.length === 0) {
          // Check if table exists first
          const [tableExists] = await queryInterface.sequelize.query(
            `SELECT to_regclass(:tableName) as tbl`,
            { replacements: { tableName: table }, transaction }
          );

          if (tableExists[0].tbl) {
            await queryInterface.addColumn(table, 'company_id', {
              type: Sequelize.UUID,
              allowNull: true,
              references: { model: 'companies', key: 'id' },
              onDelete: 'SET NULL',
            }, { transaction });
            console.log(`[TENANT]   Added company_id to ${table}`);
          } else {
            console.log(`[TENANT]   Table ${table} does not exist, skipping`);
          }
        } else {
          console.log(`[TENANT]   company_id already exists on ${table}`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 4: Backfill company_id on ALL existing rows
      // Strategy:
      //   - Tables with FK to projects: derive company_id from projects table
      //   - Tables with FK to users: derive company_id from users table
      //   - Independent tables: set to DEFAULT_TENANT_ID
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[TENANT] Step 4: Backfilling company_id...');

      // 4a. Tables that reference projects — derive company_id from parent project
      const projectLinkedTables = [
        { table: 'estimates', fk: 'project_id' },
        { table: 'sales_orders', fk: 'project_id' },
        { table: 'work_orders', fk: 'project_id' },
        { table: 'quality_records', fk: 'project_id' },
        { table: 'invoices', fk: 'project_id' },
        { table: 'project_analytics', fk: 'project_id' },
      ];

      for (const { table, fk } of projectLinkedTables) {
        const [tableExists] = await queryInterface.sequelize.query(
          `SELECT to_regclass(:tableName) as tbl`,
          { replacements: { tableName: table }, transaction }
        );
        if (!tableExists[0].tbl) continue;

        const [result] = await queryInterface.sequelize.query(
          `UPDATE ${table} t
           SET company_id = p.company_id
           FROM projects p
           WHERE t.${fk} = p.id
             AND t.company_id IS NULL
             AND p.company_id IS NOT NULL`,
          { transaction }
        );
        console.log(`[TENANT]   Backfilled ${table} from projects.company_id`);
      }

      // 4b. estimate_items — derive from estimates (which we just backfilled)
      const [eiExists] = await queryInterface.sequelize.query(
        `SELECT to_regclass('estimate_items') as tbl`, { transaction }
      );
      if (eiExists[0].tbl) {
        await queryInterface.sequelize.query(
          `UPDATE estimate_items ei
           SET company_id = e.company_id
           FROM estimates e
           WHERE ei.estimate_id = e.id
             AND ei.company_id IS NULL
             AND e.company_id IS NOT NULL`,
          { transaction }
        );
        console.log('[TENANT]   Backfilled estimate_items from estimates.company_id');
      }

      // 4c. Tables linked to users — derive company_id from users
      const userLinkedTables = [
        { table: 'audit_logs', fk: 'performed_by' },
        { table: 'login_history', fk: 'user_id' },
        { table: 'sessions', fk: 'user_id' },
        { table: 'conversations', fk: 'created_by' },
      ];

      for (const { table, fk } of userLinkedTables) {
        const [tableExists] = await queryInterface.sequelize.query(
          `SELECT to_regclass(:tableName) as tbl`,
          { replacements: { tableName: table }, transaction }
        );
        if (!tableExists[0].tbl) continue;

        await queryInterface.sequelize.query(
          `UPDATE ${table} t
           SET company_id = u.company_id
           FROM users u
           WHERE t.${fk} = u.id
             AND t.company_id IS NULL
             AND u.company_id IS NOT NULL`,
          { transaction }
        );
        console.log(`[TENANT]   Backfilled ${table} from users.company_id`);
      }

      // 4d. Backfill ALL remaining NULL company_id rows with DEFAULT_TENANT_ID
      // This catches any rows that couldn't be derived from parent relationships
      const allTenantTables = [
        'users', 'projects', 'clients', 'vendors', 'documents',
        'estimates', 'estimate_items', 'sales_orders', 'work_orders',
        'quality_records', 'audit_logs', 'login_history', 'sessions',
        'invoices', 'project_analytics', 'conversations',
        'parts', 'part_dimensions', 'part_templates',
        'stocks', 'materials', 'material_stocks', 'material_transactions',
        'material_vendor_mappings',
        'vendor_rfqs', 'vendor_pos', 'rfq_bundles', 'vendor_purchase_orders',
        'procurement_rfq', 'procurement_pos',
        'mgmt_procurement_rfqs', 'mgmt_procurement_pos',
        'raw_materials', 'file_manager_folders',
        'custom_roles', 'approval_workflows', 'api_tokens', 'webhooks',
        'activity_timelines', 'permission_templates',
      ];

      for (const table of allTenantTables) {
        const [tableExists] = await queryInterface.sequelize.query(
          `SELECT to_regclass(:tableName) as tbl`,
          { replacements: { tableName: table }, transaction }
        );
        if (!tableExists[0].tbl) continue;

        // Check if the table has company_id column
        const [cols] = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = :table AND column_name = 'company_id'`,
          { replacements: { table }, transaction }
        );
        if (cols.length === 0) continue;

        const [updateResult] = await queryInterface.sequelize.query(
          `UPDATE ${table} SET company_id = :defaultId WHERE company_id IS NULL`,
          { replacements: { defaultId: DEFAULT_TENANT_ID }, transaction }
        );
        console.log(`[TENANT]   Default-filled remaining NULLs in ${table}`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 5: Verify — no NULLs remain on key business tables
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[TENANT] Step 5: Verifying backfill...');

      const verifyTables = [
        'users', 'projects', 'clients', 'vendors', 'documents',
        'estimates', 'sales_orders', 'work_orders', 'quality_records',
      ];

      for (const table of verifyTables) {
        const [tableExists] = await queryInterface.sequelize.query(
          `SELECT to_regclass(:tableName) as tbl`,
          { replacements: { tableName: table }, transaction }
        );
        if (!tableExists[0].tbl) continue;

        const [cols] = await queryInterface.sequelize.query(
          `SELECT column_name FROM information_schema.columns 
           WHERE table_name = :table AND column_name = 'company_id'`,
          { replacements: { table }, transaction }
        );
        if (cols.length === 0) continue;

        const [nullCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) as cnt FROM ${table} WHERE company_id IS NULL`,
          { transaction }
        );
        const count = parseInt(nullCount[0].cnt, 10);
        if (count > 0) {
          // Platform admin users (role=platform_admin) may have NULL company_id — that's OK
          if (table === 'users') {
            const [nonAdminNulls] = await queryInterface.sequelize.query(
              `SELECT COUNT(*) as cnt FROM users WHERE company_id IS NULL AND role != 'platform_admin'`,
              { transaction }
            );
            const nonAdminCount = parseInt(nonAdminNulls[0].cnt, 10);
            if (nonAdminCount > 0) {
              throw new Error(
                `[TENANT] STOP: ${nonAdminCount} non-admin rows in users still have NULL company_id`
              );
            }
            console.log(`[TENANT]   ✓ users: ${count} NULL (all platform_admin — OK)`);
          } else {
            throw new Error(
              `[TENANT] STOP: ${count} rows in ${table} still have NULL company_id`
            );
          }
        } else {
          console.log(`[TENANT]   ✓ ${table}: 0 NULL company_id rows`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 7: Ensure platform admin user exists
      // ═══════════════════════════════════════════════════════════════════════
      console.log('[TENANT] Step 7: Checking platform admin users...');

      const [vikraman] = await queryInterface.sequelize.query(
        `SELECT id, role FROM users WHERE email = 'vikraman@cholandynamics.com' LIMIT 1`,
        { transaction }
      );

      if (vikraman.length > 0) {
        // User exists — update role to platform_admin, DO NOT change password
        if (vikraman[0].role !== 'platform_admin') {
          await queryInterface.sequelize.query(
            `UPDATE users SET role = 'platform_admin', company_id = NULL, updated_at = NOW()
             WHERE email = 'vikraman@cholandynamics.com'`,
            { transaction }
          );
          console.log('[TENANT]   Updated vikraman to platform_admin');
        } else {
          // Ensure company_id is NULL for platform admins
          await queryInterface.sequelize.query(
            `UPDATE users SET company_id = NULL, updated_at = NOW()
             WHERE email = 'vikraman@cholandynamics.com' AND company_id IS NOT NULL`,
            { transaction }
          );
          console.log('[TENANT]   vikraman already platform_admin');
        }
      } else {
        console.log('[TENANT]   vikraman@cholandynamics.com not found — skipping (will not create without password)');
      }

      // Add index on company_id for key tables (improves tenant-filtered queries)
      const indexTables = [
        'users', 'projects', 'clients', 'vendors', 'documents',
        'estimates', 'sales_orders', 'work_orders',
      ];

      for (const table of indexTables) {
        const [tableExists] = await queryInterface.sequelize.query(
          `SELECT to_regclass(:tableName) as tbl`,
          { replacements: { tableName: table }, transaction }
        );
        if (!tableExists[0].tbl) continue;

        const indexName = `idx_${table}_company_id`;
        const [idxExists] = await queryInterface.sequelize.query(
          `SELECT 1 FROM pg_indexes WHERE indexname = :indexName`,
          { replacements: { indexName }, transaction }
        );

        if (idxExists.length === 0) {
          await queryInterface.sequelize.query(
            `CREATE INDEX ${indexName} ON ${table} (company_id)`,
            { transaction }
          );
          console.log(`[TENANT]   Created index ${indexName}`);
        }
      }

      await transaction.commit();
      console.log('[TENANT] ✅ Multi-tenant migration completed successfully');

    } catch (error) {
      await transaction.rollback();
      console.error('[TENANT] ❌ Migration failed, rolled back:', error.message);
      throw error;
    }
  },

  async down(queryInterface) {
    // Safe rollback: only remove columns WE added, do NOT drop companies table
    const addedColumns = [
      'estimates', 'estimate_items', 'sales_orders', 'work_orders',
      'quality_records', 'audit_logs', 'login_history', 'sessions',
      'invoices', 'project_analytics', 'conversations',
    ];

    for (const table of addedColumns) {
      const [cols] = await queryInterface.sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = '${table}' AND column_name = 'company_id'`
      );
      if (cols.length > 0) {
        // Drop index first
        const indexName = `idx_${table}_company_id`;
        await queryInterface.sequelize.query(
          `DROP INDEX IF EXISTS ${indexName}`
        ).catch(() => {});

        await queryInterface.removeColumn(table, 'company_id');
      }
    }

    // Remove indexes on pre-existing tables
    const preExistingTables = ['users', 'projects', 'clients', 'vendors', 'documents'];
    for (const table of preExistingTables) {
      const indexName = `idx_${table}_company_id`;
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS ${indexName}`
      ).catch(() => {});
    }

    // Do NOT delete the default company — may have data referencing it
    console.log('[TENANT] Rollback complete. Default company "Cholan Dynamics" retained to preserve FK references.');
  }
};
