// Temporary debug script to check estimates table schema
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const models = require('../src/models');
const { sequelize } = models;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    // Check actual table columns
    const [cols] = await sequelize.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_name = 'estimates' 
       ORDER BY ordinal_position`
    );
    console.log('\n=== ESTIMATES COLUMNS ===');
    cols.forEach(c => console.log(c.column_name, '|', c.data_type, '|', c.is_nullable, '|', c.column_default));

    // Check constraints
    const [constraints] = await sequelize.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) as def 
       FROM pg_constraint 
       WHERE conrelid = 'estimates'::regclass`
    );
    console.log('\n=== CONSTRAINTS ===');
    constraints.forEach(c => console.log(c.conname, '|', c.contype, '|', c.def));

    // Check indexes
    const [indexes] = await sequelize.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'estimates'`
    );
    console.log('\n=== INDEXES ===');
    indexes.forEach(i => console.log(i.indexname, '|', i.indexdef));

    // Check estimate_items columns too
    const [itemCols] = await sequelize.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_name = 'estimate_items' 
       ORDER BY ordinal_position`
    );
    console.log('\n=== ESTIMATE_ITEMS COLUMNS ===');
    itemCols.forEach(c => console.log(c.column_name, '|', c.data_type, '|', c.is_nullable, '|', c.column_default));

    // Check estimate_items constraints
    const [itemConstraints] = await sequelize.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) as def 
       FROM pg_constraint 
       WHERE conrelid = 'estimate_items'::regclass`
    );
    console.log('\n=== ESTIMATE_ITEMS CONSTRAINTS ===');
    itemConstraints.forEach(c => console.log(c.conname, '|', c.contype, '|', c.def));

    // Show existing revisions for the project that's failing
    const [estimates] = await sequelize.query(
      `SELECT id, project_id, revision, created_at FROM estimates ORDER BY project_id, revision`
    );
    console.log('\n=== ALL ESTIMATES ===');
    estimates.forEach(e => console.log(e.project_id, '| R' + e.revision, '| id:', e.id));

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
