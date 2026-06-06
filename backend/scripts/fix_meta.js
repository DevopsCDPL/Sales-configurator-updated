const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const s = new Sequelize(db.development);
(async () => {
  // Remove these two migrations from SequelizeMeta so they can actually run
  const toRemove = [
    '20260409100000-multi-tenant-platform-admin.js',
    '20260410000000-file-manager-enhancements.js'
  ];
  for (const m of toRemove) {
    await s.query('DELETE FROM "SequelizeMeta" WHERE name = :name', { replacements: { name: m } });
    console.log('Removed:', m);
  }
  await s.close();
  console.log('Done');
})();
