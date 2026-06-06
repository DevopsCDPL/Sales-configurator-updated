const { Sequelize } = require('sequelize');
const seq = new Sequelize('forgedas', 'postgres', 'postgres123', {
  host: 'localhost', port: 5432, dialect: 'postgres', logging: false
});

(async () => {
  try {
    // Get the Dolphin project
    const [projects] = await seq.query(
      "SELECT id, project_name FROM projects ORDER BY created_at DESC LIMIT 20"
    );
    console.log('Projects:', JSON.stringify(projects));

    // Get all estimate revisions  
    const [estimates] = await seq.query(
      "SELECT id, project_id, revision, is_locked, is_approved FROM estimates ORDER BY project_id, revision"
    );
    console.log('\nAll estimates:');
    estimates.forEach(e => console.log(`  project=${e.project_id} R${e.revision} locked=${e.is_locked} approved=${e.is_approved}`));

    // Try to simulate the copy: find max revision for Dolphin project
    if (projects.length > 0) {
      const pid = projects[0].id;
      const [revs] = await seq.query(
        `SELECT revision FROM estimates WHERE project_id = '${pid}' ORDER BY revision DESC`
      );
      console.log(`\nDolphin revisions: ${JSON.stringify(revs.map(r => r.revision))}`);
      const max = Math.max(...revs.map(r => parseInt(r.revision, 10) || 0));
      console.log(`Max: ${max}, Next would be: ${max + 1}`);
    }
  } catch (e) {
    console.error(e.message);
  } finally {
    await seq.close();
  }
})();
