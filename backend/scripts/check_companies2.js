const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const s = new Sequelize(db.development);
(async () => {
  const [r] = await s.query("SELECT id, name, is_active, plan FROM companies LIMIT 10");
  console.log('Existing companies:', JSON.stringify(r, null, 2));
  const [cnt] = await s.query("SELECT COUNT(*) as cnt FROM companies");
  console.log('Total companies:', cnt[0].cnt);
  await s.close();
})();
