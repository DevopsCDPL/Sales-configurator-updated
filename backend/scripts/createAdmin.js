/**
 * Admin user creation script
 * Usage: ADMIN_EMAIL=x ADMIN_PASSWORD=y node scripts/createAdmin.js
 * 
 * Required env vars: ADMIN_EMAIL, ADMIN_PASSWORD
 * Optional:          ADMIN_NAME (defaults to 'Admin')
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');

const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Admin';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('--- ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
  console.error('   Usage: ADMIN_EMAIL=x ADMIN_PASSWORD=y node scripts/createAdmin.js');
  process.exit(1);
}

(async () => {
  try {
    const { sequelize, User } = require('../src/models');

    await sequelize.authenticate();
    console.log('Database connected.');

    const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });
    if (existing) {
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(ADMIN_PASSWORD, salt);
      existing.password_hash = newHash;
      existing.role = 'main_admin';
      existing.is_active = true;
      existing.failed_login_attempts = 0;
      existing.locked_until = null;
      await existing.save();
      console.log(`--- Admin ${ADMIN_EMAIL} updated --- password reset, account unlocked.`);
      await sequelize.close();
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, salt);

    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password_hash,
      role: 'main_admin',
      is_active: true
    });

    console.log('--- Main admin user created successfully!');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log('   Please change the password after first login.');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('--- Error creating admin:', err.message);
    process.exit(1);
  }
})();
