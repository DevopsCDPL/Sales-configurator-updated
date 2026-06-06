require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sequelize } = require('../src/models');

async function fixMigrations() {
  try {
    await sequelize.query(`
      INSERT INTO "SequelizeMeta" (name) VALUES 
        ('20260302100000-add-revision-to-estimates.js'),
        ('20260304000000-add-selected-revision-to-projects.js'),
        ('20260305000000-fix-estimates-constraint.js')
      ON CONFLICT DO NOTHING
    `);
    console.log('Migration tracking fixed!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

fixMigrations();
