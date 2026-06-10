const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const REPO = '/sessions/relaxed-wizardly-bohr/mnt/Sales-configurator-updated';
const sequelize = new Sequelize('swgplay_staging', 'postgres', 'postgres', {
  host: '127.0.0.1', port: 5433, dialect: 'postgres', logging: false,
});

(async () => {
  // ── precursor tables (normally created by the app's sync()) ──
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS companies (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
    CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT);
    CREATE TABLE IF NOT EXISTS configurator_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID, company_id UUID, config_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS configurator_components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      part_number VARCHAR(120), name VARCHAR(255), category VARCHAR(120),
      price DECIMAL(14,4), mat_cost DECIMAL(14,4), company_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS configurator_quotations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      configuration_id UUID, status VARCHAR(40), grand_total DECIMAL(14,4),
      currency VARCHAR(8) DEFAULT 'USD', company_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS configurator_system_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      configuration_id UUID, section_index INTEGER, name VARCHAR(120),
      payload JSONB, company_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
  `);
  console.log('precursor tables ready');

  // ── run the actual v2-spine migration file ──
  const mig = require(path.join(REPO, 'backend/src/migrations-configurator/20260611000001-create-configurator-v2-spine.js'));
  // module.paths fix: seeds file is required relatively from the migration
  await mig.up(sequelize.getQueryInterface(), Sequelize);
  console.log('MIGRATION UP: completed without error');

  // re-run to prove idempotency (IF NOT EXISTS everywhere)
  await mig.up(sequelize.getQueryInterface(), Sequelize);
  console.log('MIGRATION RE-RUN: idempotent ✓');

  // ── verify ──
  const [tables] = await sequelize.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`);
  const names = tables.map(t => t.tablename);
  const expect = ['configurator_switchboards','configurator_component_lines','configurator_price_rfqs',
    'configurator_completeness_rules','configurator_engineering_standards','configurator_copper_reconciliations',
    'configurator_solidworks_jobs','configurator_solidworks_agents','configurator_handoff_events',
    'configurator_component_material_map','configurator_change_orders'];
  const missing = expect.filter(t => !names.includes(t));
  console.log('new tables:', missing.length ? 'MISSING ' + missing : 'all 11 present ✓');

  const [[cr]] = await sequelize.query(`SELECT count(*)::int AS n FROM configurator_completeness_rules`);
  const [es] = await sequelize.query(`SELECT table_key, jsonb_array_length(rows) AS n FROM configurator_engineering_standards ORDER BY 1`);
  console.log('completeness seed rows:', cr.n, cr.n === 6 ? '✓' : '✗ (re-run must not duplicate)');
  console.log('standards seeds:', es.map(r => `${r.table_key}=${r.n}`).join(', '));

  const [cols] = await sequelize.query(`SELECT column_name FROM information_schema.columns WHERE table_name='configurator_components' AND column_name IN ('price_status','standards_regime','dims_h_in','pct_rated','voltage_rating_type')`);
  console.log('components extended cols:', cols.length === 5 ? 'all 5 ✓' : 'MISSING some: ' + cols.map(c=>c.column_name));
  const [qcols] = await sequelize.query(`SELECT column_name FROM information_schema.columns WHERE table_name='configurator_quotations' AND column_name IN ('revision','parent_quotation_id','bom_snapshot','comex_snapshot_id')`);
  console.log('quotations revision cols:', qcols.length === 4 ? 'all 4 ✓' : 'MISSING some');

  await sequelize.close();
})().catch(e => { console.error('MIGRATION FAILED:', e.message); process.exit(1); });
