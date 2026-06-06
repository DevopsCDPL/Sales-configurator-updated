/**
 * Setup & diagnostic routes.
 * All endpoints require a SETUP_SECRET header to prevent unauthorized access.
 * GET  /api/setup/create-admin   --- creates/resets admin user using raw SQL
 * GET  /api/setup/diag           --- diagnostic: lists users (emails + roles only)
 * POST /api/setup/reset-password --- resets any user's password
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// --------- Guard: require SETUP_ENABLED=true AND SETUP_SECRET for all setup endpoints ----------------------------------------
// Phase 1D: SETUP_ENABLED must be explicitly set to 'true' in env to activate these routes.
// Default (not set, or set to anything other than 'true') = routes return 404.
// Workflow: set SETUP_ENABLED=true in Railway → use routes → set SETUP_ENABLED=false immediately after.
router.use((req, res, next) => {
  // Gate 1: SETUP_ENABLED must be explicitly 'true'
  if (process.env.SETUP_ENABLED !== 'true') {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  // Gate 2: SETUP_SECRET must be configured and provided
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    return res.status(403).json({ success: false, message: 'Setup routes are disabled. Set SETUP_SECRET env var to enable.' });
  }
  const provided = req.headers['x-setup-secret'] || req.query.secret;
  if (provided !== secret) {
    return res.status(401).json({ success: false, message: 'Invalid or missing setup secret.' });
  }
  next();
});

// --------- Diagnostic: list users (email + role only) ---------------------------------------------------------------------------------------
router.get('/diag', async (req, res) => {
  try {
    const { sequelize } = require('../models');
    const [users] = await sequelize.query(
      `SELECT id, email, role, is_active FROM users ORDER BY created_at`
    );
    return res.json({ success: true, count: users.length, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --------- Create / reset admin ------------------------------------------------------------------------------------------------------------------------------------------------------------
router.get('/create-admin', async (req, res) => {
  try {
    const { sequelize } = require('../models');

    const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@forgedas.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
    const adminName     = process.env.ADMIN_NAME     || 'Admin';

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(adminPassword, salt);

    // Raw SQL --- will never fail due to missing association columns
    const [existing] = await sequelize.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email: adminEmail }, type: sequelize.QueryTypes.SELECT }
    );

    if (existing) {
      await sequelize.query(
        `UPDATE users SET password_hash = :hash, role = 'main_admin', is_active = true WHERE email = :email`,
        { replacements: { hash: password_hash, email: adminEmail } }
      );
      return res.json({ success: true, message: `Admin ${adminEmail} password reset. Login with: ${adminEmail} / ${adminPassword}` });
    }

    await sequelize.query(
      `INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, :email, :hash, 'main_admin', true, NOW(), NOW())`,
      { replacements: { name: adminName, email: adminEmail, hash: password_hash } }
    );

    return res.json({
      success: true,
      message: `Admin created! Login with: ${adminEmail} / ${adminPassword}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// --------- Reset password for any user ---------------------------------------------------------------------------------------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'email and newPassword (min 6 chars) required.' });
    }

    const { sequelize } = require('../models');
    const [user] = await sequelize.query(
      `SELECT id FROM users WHERE email = :email LIMIT 1`,
      { replacements: { email }, type: sequelize.QueryTypes.SELECT }
    );
    if (!user) {
      return res.status(404).json({ success: false, message: `No user: ${email}` });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await sequelize.query(
      `UPDATE users SET password_hash = :hash, is_active = true, locked_until = NULL, failed_login_attempts = 0 WHERE email = :email`,
      { replacements: { hash, email } }
    );

    return res.json({ success: true, message: `Password reset & account unlocked for ${email}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
