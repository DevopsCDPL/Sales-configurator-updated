require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');

(async () => {
  try {
    const { sequelize } = require('../src/models');
    await sequelize.authenticate();
    console.log('DB connected');

    const [rows] = await sequelize.query(
      `SELECT email, password_hash, is_active, failed_login_attempts, locked_until FROM users WHERE email = 'admin@forgedas.com'`
    );

    if (!rows || rows.length === 0) {
      console.log('ERROR: No user found with email admin@forgedas.com');
      await sequelize.close();
      process.exit(1);
    }

    const user = rows[0];
    console.log('User found:');
    console.log('  email:', user.email);
    console.log('  is_active:', user.is_active);
    console.log('  failed_login_attempts:', user.failed_login_attempts);
    console.log('  locked_until:', user.locked_until);
    console.log('  hash length:', user.password_hash ? user.password_hash.length : 'NULL');
    console.log('  hash prefix:', user.password_hash ? user.password_hash.substring(0, 10) : 'NULL');

    const match = await bcrypt.compare('admin@1234', user.password_hash);
    console.log('  Password "admin@1234" matches:', match);

    if (!match) {
      // Try resetting right here
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash('admin@1234', salt);
      console.log('\nResetting password directly via SQL...');
      await sequelize.query(
        `UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE email = 'admin@forgedas.com'`,
        { bind: [newHash] }
      );
      
      // Verify
      const [verify] = await sequelize.query(
        `SELECT password_hash FROM users WHERE email = 'admin@forgedas.com'`
      );
      const verifyMatch = await bcrypt.compare('admin@1234', verify[0].password_hash);
      console.log('After reset - Password matches:', verifyMatch);
    }

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
