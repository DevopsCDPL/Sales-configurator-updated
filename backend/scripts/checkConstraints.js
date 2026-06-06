const { Sequelize } = require('sequelize');
const seq = new Sequelize('forgedas', 'postgres', 'postgres123', {
  host: 'localhost', port: 5432, dialect: 'postgres', logging: false
});

(async () => {
  try {
    // Check indexes
    const [indexes] = await seq.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'estimates'"
    );
    console.log('=== Indexes on estimates ===');
    indexes.forEach(i => console.log(i.indexname, ':', i.indexdef));

    // Check constraints
    const [constraints] = await seq.query(
      "SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'estimates'::regclass"
    );
    console.log('\n=== Constraints on estimates ===');
    constraints.forEach(c => console.log(c.conname, `(${c.contype}):`, c.def));

    // Check what revisions exist for projects with issues
    const [revs] = await seq.query(
      "SELECT project_id, array_agg(revision ORDER BY revision) as revisions FROM estimates GROUP BY project_id"
    );
    console.log('\n=== Revisions per project ===');
    revs.forEach(r => console.log(r.project_id, ':', r.revisions));
  } catch (e) {
    console.error(e.message);
  } finally {
    await seq.close();
  }
})();
