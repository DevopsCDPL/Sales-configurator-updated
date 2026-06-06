require('dotenv').config();
const bcrypt = require('bcryptjs');

(async () => {
  const { sequelize } = require('../src/models');
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'cdpl@2026';
  const admins = [
    { name: 'Vikraman', email: 'vikraman@cholandynamics.com' },
    { name: 'Priyanka', email: 'priyanka@cholandynamics.com' },
  ];
  const hash = await bcrypt.hash(password, 10);
  for (const a of admins) {
    const [rows] = await sequelize.query(
      `SELECT id FROM users WHERE LOWER(email)=LOWER(:email) LIMIT 1`,
      { replacements: { email: a.email }, type: sequelize.QueryTypes.SELECT }
    );
    if (rows) {
      await sequelize.query(
        `UPDATE users SET password_hash=:hash, role='platform_admin', company_id=NULL, is_active=true, failed_login_attempts=0, locked_until=NULL WHERE LOWER(email)=LOWER(:email)`,
        { replacements: { hash, email: a.email } }
      );
      console.log(`Updated platform admin: ${a.email}`);
    } else {
      await sequelize.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active, company_id, failed_login_attempts, created_at, updated_at)
         VALUES (gen_random_uuid(), :name, :email, :hash, 'platform_admin', true, NULL, 0, NOW(), NOW())`,
        { replacements: { name: a.name, email: a.email, hash } }
      );
      console.log(`Created platform admin: ${a.email}`);
    }
  }
  await sequelize.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
