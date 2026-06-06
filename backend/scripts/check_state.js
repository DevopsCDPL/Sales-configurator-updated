const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const s = new Sequelize(db.development);
(async () => {
  // Check SequelizeMeta
  const [meta] = await s.query('SELECT name FROM "SequelizeMeta" ORDER BY name');
  console.log('SequelizeMeta entries:', meta.length);
  const tenant = meta.filter(m => m.name.includes('tenant') || m.name.includes('multi'));
  console.log('Tenant-related:', JSON.stringify(tenant));

  // Check if default company exists
  const [co] = await s.query("SELECT id, name, company_code FROM companies LIMIT 5");
  console.log('Companies:', JSON.stringify(co));

  // Check if company_id is populated on users
  const [users] = await s.query("SELECT id, name, email, role, company_id FROM users LIMIT 5");
  console.log('Users:', JSON.stringify(users));
  
  await s.close();
})();
