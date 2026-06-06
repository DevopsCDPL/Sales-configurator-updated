const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const s = new Sequelize(db.development);
(async () => {
  const tables = [
    'users', 'projects', 'clients', 'vendors', 'documents',
    'estimates', 'estimate_items', 'sales_orders', 'work_orders',
    'quality_records', 'audit_logs', 'login_history', 'sessions',
    'invoices', 'project_analytics', 'conversations',
    'parts', 'stocks', 'materials', 'raw_materials',
    'file_manager_folders'
  ];

  console.log('=== MULTI-TENANT VERIFICATION ===\n');
  
  for (const table of tables) {
    try {
      const [colCheck] = await s.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='${table}' AND column_name='company_id'`
      );
      if (colCheck.length === 0) {
        console.log(`${table}: NO company_id column`);
        continue;
      }
      const [total] = await s.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      const [nulls] = await s.query(`SELECT COUNT(*) as cnt FROM ${table} WHERE company_id IS NULL`);
      const t = parseInt(total[0].cnt);
      const n = parseInt(nulls[0].cnt);
      const status = n === 0 ? 'OK' : (table === 'users' ? 'OK (platform_admin)' : 'WARN');
      console.log(`${table}: ${t} total, ${n} NULL company_id → ${status}`);
    } catch(e) {
      console.log(`${table}: ${e.message}`);
    }
  }

  // Check indexes
  console.log('\n=== INDEXES ===');
  const [indexes] = await s.query(
    `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%_company_id'`
  );
  for (const idx of indexes) {
    console.log(`  ${idx.indexname}`);
  }

  await s.close();
})();
