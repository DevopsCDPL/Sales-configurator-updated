/**
 * setup-rls.js — Idempotent RLS migration for multi-tenant security.
 *
 * What it does (all operations are safe to re-run):
 *   1. Creates the 'forged_app' role (NOBYPASSRLS, NOLOGIN) if absent
 *   2. Grants DML on every tenant table to forged_app
 *   3. Enables RLS + FORCE ROW SECURITY on every tenant table
 *   4. Creates a 'tenant_isolation' policy on each table:
 *        - platform admin (app.company_id = '') → sees ALL rows
 *        - tenant user  (app.company_id = UUID)  → sees only own rows
 *
 * Usage:
 *   node scripts/setup-rls.js
 *
 * Safe to run multiple times — every statement is idempotent.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

const env = process.env.NODE_ENV || 'development';
const dbConfig = require('../src/config/database')[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  { ...dbConfig, logging: false }
);

// All tables that carry a company_id and must be tenant-isolated.
// Add new tables here as the schema grows.
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
  'users',
  'vendor_pos',
  'vendor_purchase_orders',
  'vendor_rfqs',
  'vendors',
  'webhooks',
  'work_orders',
];

// Policy expression:
//   app.company_id = ''  → platform admin pass-through (no filter)
//   app.company_id = UUID → tenant filter
const POLICY_QUAL = `(
  current_setting('app.company_id', TRUE) = ''
  OR (company_id)::text = current_setting('app.company_id', TRUE)
)`;

async function run() {
  try {
    await sequelize.authenticate();
    console.log(`Connected to ${dbConfig.database} as ${dbConfig.username}\n`);
  } catch (err) {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  }

  let ok = 0, skip = 0, fail = 0;

  // ── Step 1: create forged_app role ────────────────────────────────────────
  console.log('── Step 1: forged_app role ──────────────────────────────────');
  try {
    const [roles] = await sequelize.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'forged_app'`
    );
    if (roles.length === 0) {
      await sequelize.query(`
        CREATE ROLE forged_app
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOINHERIT NOLOGIN NOBYPASSRLS
      `);
      console.log('  CREATED role forged_app');
      ok++;
    } else {
      // Ensure bypass RLS is off even if role pre-exists
      await sequelize.query(`ALTER ROLE forged_app NOBYPASSRLS`);
      console.log('  EXISTS — NOBYPASSRLS confirmed');
      skip++;
    }
  } catch (err) {
    console.error('  FAILED:', err.message);
    fail++;
  }

  // ── Step 2: grant DML on all tenant tables to forged_app ──────────────────
  console.log('\n── Step 2: grant DML privileges ─────────────────────────────');
  try {
    await sequelize.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forged_app`
    );
    await sequelize.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forged_app`
    );
    await sequelize.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forged_app`
    );
    await sequelize.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public
         GRANT USAGE, SELECT ON SEQUENCES TO forged_app`
    );
    console.log('  Granted SELECT/INSERT/UPDATE/DELETE + sequences to forged_app');
    ok++;
  } catch (err) {
    console.error('  FAILED:', err.message);
    fail++;
  }

  // ── Step 3 & 4: per-table — enable RLS + create policy ────────────────────
  console.log('\n── Step 3 & 4: enable RLS + tenant policy per table ─────────');
  for (const table of TENANT_TABLES) {
    // Skip tables that don't exist yet (schema may differ across envs)
    try {
      const [exists] = await sequelize.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = '${table}'`
      );
      if (exists.length === 0) {
        console.log(`  SKIP  ${table} (table does not exist)`);
        skip++;
        continue;
      }

      // Skip tables that don't have company_id column
      const [hasCid] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = '${table}'
          AND column_name = 'company_id'`
      );
      if (hasCid.length === 0) {
        console.log(`  SKIP  ${table} (no company_id column)`);
        skip++;
        continue;
      }

      // Enable RLS (idempotent)
      await sequelize.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`
      );
      // Force RLS even for table owner (prevents privilege escalation)
      await sequelize.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`
      );

      // Drop and recreate policy so reruns are clean
      await sequelize.query(
        `DROP POLICY IF EXISTS tenant_isolation ON "${table}"`
      );
      await sequelize.query(`
        CREATE POLICY tenant_isolation ON "${table}"
          FOR ALL
          USING ${POLICY_QUAL}
          WITH CHECK ${POLICY_QUAL}
      `);

      console.log(`  OK    ${table}`);
      ok++;
    } catch (err) {
      console.error(`  FAIL  ${table}: ${err.message}`);
      fail++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n── Summary ───────────────────────────────────────────────────');
  console.log(`  OK:      ${ok}`);
  console.log(`  Skipped: ${skip}`);
  console.log(`  Failed:  ${fail}`);

  if (fail > 0) {
    console.error('\nRLS setup completed with errors. Review output above.');
    process.exit(1);
  } else {
    console.log('\nRLS setup complete. All tenant tables are isolated.');
  }

  await sequelize.close();
}

run();
