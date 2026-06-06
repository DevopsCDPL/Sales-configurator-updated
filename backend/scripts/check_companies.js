const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const s = new Sequelize(db.development);
(async () => {
  const [r] = await s.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='companies' ORDER BY ordinal_position");
  console.log(JSON.stringify(r, null, 2));
  await s.close();
})();
