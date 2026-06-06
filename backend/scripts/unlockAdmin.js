#!/usr/bin/env node
/**
 * Emergency Admin Unlock Script
 * 
 * Usage (local):
 *   cd backend && node scripts/unlockAdmin.js
 * 
 * Usage (production via curl):
 *   curl -X POST https://your-api-url/api/auth/unlock-admin \
 *     -H "Content-Type: application/json" \
 *     -d '{"secret": "YOUR_JWT_SECRET"}'
 * 
 * Or via health check:
 *   curl "https://your-api-url/health?unlock=admin" \
 *     -H "x-unlock-secret: YOUR_JWT_SECRET"
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sequelize } = require('../src/models');

async function unlockAdmin() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@forgedas.com';
    
    // Check current state
    const [current] = await sequelize.query(
      `SELECT email, is_active, failed_login_attempts, locked_until FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: adminEmail }, type: sequelize.QueryTypes.SELECT }
    );

    if (!current) {
      console.error(`--- Admin account not found: ${adminEmail}`);
      process.exit(1);
    }

    console.log('Current state:');
    console.log(`  Email: ${current.email}`);
    console.log(`  Active: ${current.is_active}`);
    console.log(`  Failed attempts: ${current.failed_login_attempts}`);
    console.log(`  Locked until: ${current.locked_until || 'NOT LOCKED'}`);

    // Reset
    await sequelize.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, is_active = true WHERE email = :email`,
      { replacements: { email: adminEmail } }
    );

    console.log(`\n--- Admin account unlocked: ${adminEmail}`);
    console.log('You can now login with the configured password.');
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('--- Error:', error.message);
    process.exit(1);
  }
}

unlockAdmin();
