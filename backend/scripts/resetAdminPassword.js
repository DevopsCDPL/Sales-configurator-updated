// backend/scripts/resetAdminPassword.js
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../src/models');

async function resetAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@forgedas.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@03';
    const hash = await bcrypt.hash(adminPassword, 10);

    const [admin] = await sequelize.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: adminEmail }, type: sequelize.QueryTypes.SELECT }
    );

    if (admin) {
      await sequelize.query(
        `UPDATE users SET password_hash = :hash, is_active = true, failed_login_attempts = 0, locked_until = NULL, deleted_at = NULL, deleted_by = NULL WHERE email = :email`,
        { replacements: { hash, email: adminEmail } }
      );
      console.log(`Admin account updated: ${adminEmail}`);
    } else {
      await sequelize.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Admin', :email, :hash, 'main_admin', true, 0, NULL, NOW(), NOW())`,
        { replacements: { email: adminEmail, hash } }
      );
      console.log(`Admin account created: ${adminEmail}`);
    }
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetAdmin();
