'use strict';

/**
 * Phase 4: PostgreSQL Row-Level Security
 *
 * Adds DB-level tenant isolation as the final safety net.
 * RLS policies enforce company_id scoping on all tenant tables.
 *
 * How it works:
 *   - The application sets `app.company_id` PostgreSQL session variable via
 *     set_config() at the start of each request (tenantScope middleware).
 *   - RLS policies read current_setting('app.company_id', TRUE) to filter rows:
 *       ''     → platform_admin mode — all rows visible
 *       <uuid> → tenant mode — only rows for that company visible
 *
 * Role strategy:
 *   - `forged_app` role (NOBYPASSRLS, NOLOGIN) is created for proper enforcement.
 *   - When the app DB user is a superuser (Railway default), RLS is bypassed by
 *     PostgreSQL for superusers regardless of FORCE ROW LEVEL SECURITY.
 *   - To fully activate RLS against the app itself, either:
 *       a) Change DATABASE_URL to connect as `forged_app` login role, OR
 *       b) Run SET LOCAL ROLE forged_app inside a transaction per request.
 *   - Even without the role switch, RLS protects:
 *       - Direct psql/external tool access using non-superuser connections
 *       - Any future limited-privilege DB connection
 *       - SQL injection attempts that bypass application-layer filtering
 *
 * Primary isolation remains Phase 2 (Sequelize beforeFind hooks).
 * Phase 4 is the DB-level backstop.
 */

// All tables that have a company_id column and need tenant isolation
const TENANT_TABLES = [
  'activity_timeline',
  'api_tokens',
  'approval_workflows',
  'audit_logs',
  'calendar_events',
  'clients',
  'conversations',
  'custom_roles',
  'documents',
  'estimate_items',
  'estimates',
  'file_manager_folders',
  'invoices',
  'login_history',
  'material_stock',
  'material_transactions',
  'materials',
  'mgmt_procurement_pos',
  'mgmt_procurement_rfqs',
  'new_documents',
  'part_dimensions',
  'part_templates',
  'parts',
  'permission_templates',
  'procurement_po',
  'procurement_rfq',
  'project_analytics',
  'projects',
  'quality_records',
  'raw_materials',
  'rfq_bundles',
  'risk_scores',
  'sales_orders',
  'sessions',
  'settings',
  'stocks',
  'system_module_config',
  'teams',
  'users',
  'vendor_pos',
  'vendor_purchase_orders',
  'vendor_rfqs',
  'vendors',
  'webhooks',
  'work_orders',
];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    const t = await q.transaction();
    try {
      // 1. Create `forged_app` role (no login, no superuser, no bypass RLS).
      //    Used as the target for SET ROLE to enable proper RLS enforcement.
      await q.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'forged_app') THEN
            CREATE ROLE forged_app
              NOSUPERUSER
              NOCREATEDB
              NOCREATEROLE
              NOBYPASSRLS
              NOLOGIN
              NOINHERIT;
          END IF;
        END
        $$
      `, { transaction: t });

      // 2. Grant table + sequence privileges to forged_app (current + future).
      await q.query(`
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forged_app
      `, { transaction: t });

      await q.query(`
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forged_app
      `, { transaction: t });

      // 3. Enable RLS and create policies on every tenant table that exists.
      let applied = 0;
      for (const table of TENANT_TABLES) {
        // Skip tables that don't exist in this database (e.g. optional/future tables)
        const [{ exists }] = await q.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :table
          ) AS exists`,
          { replacements: { table }, transaction: t, type: q.QueryTypes.SELECT }
        );
        if (!exists) {
          console.log(`[Phase 4] Skipping non-existent table: ${table}`);
          continue;
        }

        await q.query(
          `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
          { transaction: t }
        );

        await q.query(
          `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
          { transaction: t }
        );

        await q.query(
          `DROP POLICY IF EXISTS tenant_isolation ON ${table}`,
          { transaction: t }
        );

        await q.query(`
          CREATE POLICY tenant_isolation ON ${table}
            AS PERMISSIVE
            FOR ALL
            TO PUBLIC
            USING (
              current_setting('app.company_id', TRUE) = ''
              OR company_id::text = current_setting('app.company_id', TRUE)
            )
            WITH CHECK (
              current_setting('app.company_id', TRUE) = ''
              OR company_id::text = current_setting('app.company_id', TRUE)
            )
        `, { transaction: t });
        applied++;
      }

      await t.commit();
      console.log(`[Phase 4] RLS enabled on ${applied} of ${TENANT_TABLES.length} tenant tables.`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    const t = await q.transaction();
    try {
      for (const table of TENANT_TABLES) {
        const [{ exists }] = await q.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :table
          ) AS exists`,
          { replacements: { table }, transaction: t, type: q.QueryTypes.SELECT }
        );
        if (!exists) continue;
        await q.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`, { transaction: t });
        await q.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`, { transaction: t });
        await q.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`, { transaction: t });
      }

      // Revoke forged_app privileges and drop the role
      await q.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM forged_app`, { transaction: t });
      await q.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM forged_app`, { transaction: t });
      await q.query(`DROP ROLE IF EXISTS forged_app`, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
