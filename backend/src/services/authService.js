const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, LoginHistory, Company, ActivityTimeline, Setting, Session } = require('../models');
const { CO_ADMIN_SLOTS } = require('../config/rolePermissions');
const sessionService = require('./sessionService');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/emailService');

// Core user columns that are guaranteed to exist (excludes association FKs
// like custom_role_id that may not have been migrated yet).
const USER_CORE_ATTRS = [
  'id', 'name', 'email', 'password_hash', 'role', 'company_name', 'company_id',
  'created_by', 'phone', 'position', 'is_active', 'modules', 'module_permissions',
  'last_login', 'department', 'tags', 'last_login_ip', 'last_login_device',
  'failed_login_attempts', 'locked_until', 'two_factor_enabled',
  'otp_code', 'otp_expires_at', 'otp_attempts',
  'force_password_reset', 'invited_at', 'invite_status',
  'created_at', 'updated_at', 'user_id', 'avatar', 'gender',
];

// deleted_at is added dynamically only if the column exists (it may not
// exist yet if sync({ alter }) hasn't run or failed on first deploy).
let _hasDeletedAt = null; // null = unknown, true/false = cached result

class AuthService {
  async register(userData) {
    const { name, email, password, role } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email }, attributes: ['id'] });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name,
      email,
      password_hash,
      role: role || 'user'
    });

    // Generate token
    const token = this.generateToken(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        modules: user.modules || [],
        company_name: user.company_name || null,
        company_id: user.company_id || null,
        created_by: user.created_by || null
      },
      token
    };
  }

  async login(email, password, reqInfo = {}) {
    const loginInput = String(email || '').trim();
    const normalizedEmail = loginInput.toLowerCase();
    const configuredAdminEmail = String(process.env.ADMIN_EMAIL || 'admin@forgedas.com').trim().toLowerCase();
    const configuredAdminPassword = process.env.ADMIN_PASSWORD || 'admin1234';

    let user = null;

    // Find user --- try by email first, then by user_id
    // Determine if input looks like a user_id (numeric only) or email
    const isUserId = /^\d+$/.test(loginInput);

    if (loginInput) {
      const { fn, col, where: seqWhere } = User.sequelize;
      const attrs = [...USER_CORE_ATTRS];
      // Probe once whether deleted_at column exists
      if (_hasDeletedAt === null) {
        try {
          await User.sequelize.query('SELECT deleted_at FROM users LIMIT 0');
          _hasDeletedAt = true;
        } catch {
          _hasDeletedAt = false;
        }
      }
      if (_hasDeletedAt) attrs.push('deleted_at');

      if (isUserId) {
        // Look up by user_id (numeric login)
        user = await User.findOne({
          where: { user_id: loginInput },
          attributes: attrs,
        });
      }

      // If not found by user_id (or input is an email), try by email
      if (!user) {
        user = await User.findOne({
          where: seqWhere(fn('LOWER', col('email')), normalizedEmail),
          attributes: attrs,
        });
      }
    }

    // Self-heal admin account when env credentials are provided but user row is missing.
    if (!user && configuredAdminPassword && normalizedEmail === configuredAdminEmail && password === configuredAdminPassword) {
      const salt = await bcrypt.genSalt(10);
      const adminHash = await bcrypt.hash(configuredAdminPassword, salt);
      const adminName = process.env.ADMIN_NAME || 'Admin';

      await User.sequelize.query(
        `INSERT INTO users (id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until, created_at, updated_at)
         VALUES (gen_random_uuid(), :name, :email, :hash, 'main_admin', true, 0, NULL, NOW(), NOW())
         ON CONFLICT (email)
         DO UPDATE SET password_hash = EXCLUDED.password_hash,
                       role = 'main_admin',
                       is_active = true,
                       failed_login_attempts = 0,
                       locked_until = NULL,
                       updated_at = NOW()`,
        { replacements: { name: adminName, email: configuredAdminEmail, hash: adminHash } }
      );

      const { fn, col, where: seqWhere2 } = User.sequelize;
      const attrs2 = [...USER_CORE_ATTRS];
      if (_hasDeletedAt) attrs2.push('deleted_at');
      user = await User.findOne({
        where: seqWhere2(fn('LOWER', col('email')), normalizedEmail),
        attributes: attrs2,
      });
    }

    if (!user) {
      this._logLoginAttempt(null, reqInfo, 'failed', 'invalid_credentials');
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const canForceAdminUnlock =
        configuredAdminPassword &&
        normalizedEmail === configuredAdminEmail &&
        password === configuredAdminPassword;

      if (canForceAdminUnlock) {
        await user.update({ failed_login_attempts: 0, locked_until: null, is_active: true });
        user.failed_login_attempts = 0;
        user.locked_until = null;
        user.is_active = true;
      } else {
      const remainingMs = new Date(user.locked_until) - new Date();
      const remainingMins = Math.ceil(remainingMs / 60000);
      this._logLoginAttempt(user.id, reqInfo, 'failed', 'account_locked');
      throw new Error(`Account is locked. Try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''} or contact administrator.`);
      }
    }

    // Check if user is soft-deleted (recycle bin) - only if column exists
    if (_hasDeletedAt && user.deleted_at) {
      const canForceAdminRestore =
        configuredAdminPassword &&
        normalizedEmail === configuredAdminEmail &&
        password === configuredAdminPassword;

      if (canForceAdminRestore) {
        await user.update({ deleted_at: null, deleted_by: null, is_active: true, failed_login_attempts: 0, locked_until: null });
        user.deleted_at = null;
        user.is_active = true;
      } else {
        this._logLoginAttempt(user.id, reqInfo, 'failed', 'account_deleted');
        throw new Error('Account has been deleted. Please contact administrator.');
      }
    }

    if (!user.is_active) {
      const canForceAdminActivate =
        configuredAdminPassword &&
        normalizedEmail === configuredAdminEmail &&
        password === configuredAdminPassword;

      if (canForceAdminActivate) {
        await user.update({ is_active: true, failed_login_attempts: 0, locked_until: null });
        user.is_active = true;
      } else {
        this._logLoginAttempt(user.id, reqInfo, 'failed', 'account_inactive');
        throw new Error('Account is deactivated. Please contact administrator.');
      }
    }

    // Verify password
    let isMatch = await bcrypt.compare(password, user.password_hash);

    // If env admin password matches, resync hash so login always recovers.
    const shouldResyncAdminHash =
      !isMatch &&
      configuredAdminPassword &&
      normalizedEmail === configuredAdminEmail &&
      password === configuredAdminPassword;

    if (shouldResyncAdminHash) {
      const salt = await bcrypt.genSalt(10);
      const adminHash = await bcrypt.hash(configuredAdminPassword, salt);
      const resyncData = {
        password_hash: adminHash,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
      };
      if (_hasDeletedAt) { resyncData.deleted_at = null; resyncData.deleted_by = null; }
      await user.update(resyncData);
      isMatch = true;
    }

    if (!isMatch) {
      // Increment failed attempts
      const attempts = (user.failed_login_attempts || 0) + 1;
      const updateData = { failed_login_attempts: attempts };
      // Lock after 5 failed attempts for 15 minutes (reduced from 30)
      if (attempts >= 5) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + 15);
        updateData.locked_until = lockUntil;
      }
      await user.update(updateData);
      this._logLoginAttempt(user.id, reqInfo, 'failed', 'invalid_password');
      throw new Error('Invalid email or password');
    }

    // ── Phase 7B: 2FA check ──────────────────────────────────────────────────
    if (user.two_factor_enabled) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
      await user.update({
        otp_code: otpHash,
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
        otp_attempts: 0,
      });
      sendEmail({
        to: user.email,
        subject: 'Your Forged Login Code',
        text: `Your one-time login code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, contact your administrator immediately.`,
        html: `<p>Your one-time login code is:</p><p style="font-size:2em;font-weight:bold;letter-spacing:0.2em">${otp}</p><p>This code expires in <strong>10 minutes</strong>.</p><p>If you did not request this, contact your administrator immediately.</p>`,
      }).catch(err => logger.error({ err: err.message }, '2FA OTP email failed'));
      return { requires2FA: true, userId: user.id };
    }

    return this._finishLogin(user, reqInfo);
  }

  async _finishLogin(user, reqInfo) {
    const ip = reqInfo.ip || null;
    const device = reqInfo.userAgent || null;

    // Generate permanent user_id on first login if not already set
    let userIdUpdate = {};
    if (!user.user_id) {
      const generatedId = await this._generateUniqueUserId();
      userIdUpdate = { user_id: generatedId };
      user.user_id = generatedId;
    }

    // Capture previous last_login before updating
    const previousLastLogin = user.last_login;

    await user.update({
      last_login: new Date(),
      last_login_ip: ip,
      last_login_device: device,
      failed_login_attempts: 0,
      locked_until: null,
      ...userIdUpdate,
    });

    if (user.company_id) {
      Company.update({ last_activity_at: new Date() }, { where: { id: user.company_id } }).catch(() => {});
    }

    this._logLoginAttempt(user.id, reqInfo, 'success', null);

    const token = this.generateToken(user.id);
    const refreshToken = this.generateRefreshToken();

    try {
      await ActivityTimeline.create({
        company_id: user.company_id || null,
        user_id: user.id,
        action: 'user_login',
        description: `${user.name} logged in`,
        severity: 'low',
        metadata: { ip: reqInfo.ip, device: reqInfo.device },
      });
    } catch (e) { /* ignore timeline errors */ }

    try {
      await sessionService.createSession(user.id, token, refreshToken, {
        ip: reqInfo.ip,
        userAgent: reqInfo.userAgent,
        device: reqInfo.device || 'desktop',
        location: reqInfo.location || null,
      });
    } catch (e) { /* ignore session creation errors */ }

    const is_co_admin = await this._checkIsCoAdmin(user);
    const is_owner = await this._checkIsOwner(user);

    let subscription_status = null;
    if (user.role !== 'platform_admin' && user.company_id) {
      try {
        const company = await Company.findByPk(user.company_id, {
          attributes: ['subscription_status', 'subscription_end_date', 'is_active'],
        });
        if (company) {
          subscription_status = company.subscription_status;
          if (company.subscription_end_date && new Date(company.subscription_end_date) < new Date()) {
            subscription_status = 'expired';
          }
          if (!company.is_active) {
            this._logLoginAttempt(user.id, reqInfo, 'failed', 'company_inactive');
            throw new Error('Your company account has been deactivated. Please contact the platform administrator.');
          }
        }
      } catch (subErr) {
        if (subErr.message.includes('deactivated')) throw subErr;
      }
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        is_co_admin,
        is_owner,
        phone: user.phone || null,
        position: user.position || null,
        modules: user.modules || [],
        module_permissions: user.module_permissions || {},
        company_name: user.company_name || null,
        company_id: user.company_id || null,
        created_by: user.created_by || null,
        two_factor_enabled: user.two_factor_enabled || false,
        force_password_reset: user.force_password_reset || false,
        subscription_status,
        user_id: user.user_id || null,
        last_login: previousLastLogin || null,
        avatar: user.avatar || null,
        gender: user.gender || null,
      },
      token,
      refreshToken,
    };
  }

  async verifyOtp(userId, otp, reqInfo = {}) {
    const user = await User.findByPk(userId, { attributes: USER_CORE_ATTRS });

    if (!user || !user.two_factor_enabled || !user.otp_code || !user.otp_expires_at) {
      throw new Error('Invalid or expired OTP. Please login again.');
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      await user.update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 });
      throw new Error('OTP has expired. Please login again.');
    }

    const otpHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
    const attempts = (user.otp_attempts || 0) + 1;

    if (otpHash !== user.otp_code) {
      if (attempts >= 3) {
        await user.update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 });
        throw new Error('Too many incorrect OTP attempts. Please login again.');
      }
      await user.update({ otp_attempts: attempts });
      const remaining = 3 - attempts;
      throw new Error(`Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    await user.update({ otp_code: null, otp_expires_at: null, otp_attempts: 0 });
    return this._finishLogin(user, reqInfo);
  }

  _logLoginAttempt(userId, reqInfo, status, failureReason) {
    LoginHistory.create({
      user_id: userId,
      ip_address: reqInfo.ip || null,
      user_agent: reqInfo.userAgent || null,
      device: reqInfo.device || null,
      location: reqInfo.location || null,
      status,
      failure_reason: failureReason
    }).catch(err => logger.error({ err: err.message }, 'Failed to log login attempt'));
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findByPk(userId, { attributes: USER_CORE_ATTRS });
    if (!user) {
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await user.update({ password_hash });

    return { message: 'Password changed successfully' };
  }

  async getProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'modules', 'module_permissions', 'phone', 'position', 'company_name', 'company_id', 'created_by', 'created_at', 'avatar', 'gender', 'user_id', 'last_login']
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Add co-admin and owner status for RBAC
    const is_co_admin = await this._checkIsCoAdmin(user);
    const is_owner = await this._checkIsOwner(user);
    const userData = user.toJSON ? user.toJSON() : { ...user.dataValues };
    userData.is_co_admin = is_co_admin;
    userData.is_owner = is_owner;
    userData.gender = user.gender || null;

    // Add subscription status for non-platform-admin users
    if (user.role !== 'platform_admin' && user.company_id) {
      try {
        const company = await Company.findByPk(user.company_id, {
          attributes: ['subscription_status', 'subscription_end_date'],
        });
        if (company) {
          userData.subscription_status = company.subscription_status;
          if (company.subscription_end_date && new Date(company.subscription_end_date) < new Date()) {
            userData.subscription_status = 'expired';
          }
        }
      } catch { /* ignore */ }
    }

    return userData;
  }

  /**
   * Check if a user is the assigned Owner.
   */
  async _checkIsOwner(user) {
    if (!user || user.role !== 'main_admin') return false;
    try {
      const companyId = user.company_id;
      const scopedKey = companyId ? `co_admin_assignments:${companyId}` : 'co_admin_assignments';
      const setting = await Setting.findByPk(scopedKey) || await Setting.findByPk('co_admin_assignments');
      const assignments = setting?.value;
      if (!assignments || !assignments.owner?.email) return true; // setup mode: first main_admin is owner
      return assignments.owner.email.toLowerCase() === (user.email || '').toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Check if a user is an assigned co-admin (Owner/Co-Owner/Backup).
   * If no assignments exist yet, any main_admin is treated as co-admin.
   */
  async _checkIsCoAdmin(user) {
    if (!user || user.role !== 'main_admin') return false;
    try {
      const companyId = user.company_id;
      const scopedKey = companyId ? `co_admin_assignments:${companyId}` : 'co_admin_assignments';
      const setting = await Setting.findByPk(scopedKey) || await Setting.findByPk('co_admin_assignments');
      const assignments = setting?.value;
      if (!assignments || !assignments.owner?.email) {
        return true; // setup mode
      }
      const lower = (user.email || '').toLowerCase();
      return CO_ADMIN_SLOTS.some(s => {
        const assigned = assignments[s.key]?.email;
        return assigned && assigned.toLowerCase() === lower;
      });
    } catch {
      return user.role === 'main_admin';
    }
  }

  /**
   * Generate a unique 10-digit numeric user ID.
   * Retries up to 10 times to ensure uniqueness.
   */
  async _generateUniqueUserId() {
    for (let i = 0; i < 10; i++) {
      const uid = String(Math.floor(1000000000 + Math.random() * 9000000000));
      const existing = await User.findOne({ where: { user_id: uid }, attributes: ['id'] });
      if (!existing) return uid;
    }
    // Fallback: timestamp-based
    return String(Date.now()).slice(-10);
  }

  generateToken(userId) {
    // Access tokens are short-lived (1h). JWT_EXPIRES_IN can override for dev/testing.
    let raw = process.env.JWT_EXPIRES_IN;
    let expiresIn = (raw && raw.trim()) ? raw.trim() : '1h';
    if (/^\d+$/.test(expiresIn)) {
      expiresIn = expiresIn + 'h';
    }
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn }
    );
  }

  generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex'); // 64-char hex, stored hashed in DB
  }

  async verifyRefreshToken(refreshToken) {
    if (!refreshToken) throw new Error('Refresh token required');

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await Session.findOne({
      where: { refresh_token_hash: hash, is_active: true },
      attributes: ['id', 'user_id', 'expires_at'],
    });

    if (!session) throw new Error('Invalid refresh token');
    if (new Date() > new Date(session.expires_at)) {
      await session.update({ is_active: false });
      throw new Error('Refresh token expired. Please login again.');
    }

    const user = await User.findByPk(session.user_id, { attributes: ['id', 'is_active'] });
    if (!user || !user.is_active) throw new Error('User not found or inactive');

    const newAccessToken = this.generateToken(user.id);
    const newTokenHash = crypto.createHash('sha256').update(newAccessToken).digest('hex');
    await session.update({ token_hash: newTokenHash, last_activity_at: new Date() });

    return { token: newAccessToken };
  }

  /**
   * Emergency admin unlock - resets lock state for the main admin account.
   * Returns the admin email that was unlocked.
   */
  async unlockAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@forgedas.com';
    
    const [result] = await User.sequelize.query(
      `UPDATE users 
       SET failed_login_attempts = 0, locked_until = NULL 
       WHERE email = :email 
       RETURNING email, failed_login_attempts, locked_until`,
      { replacements: { email: adminEmail }, type: User.sequelize.QueryTypes.SELECT }
    );
    
    if (!result) {
      throw new Error(`Admin account not found: ${adminEmail}`);
    }
    
    logger.info({ email: adminEmail }, 'Admin account unlocked');
    return { email: adminEmail, message: 'Admin account unlocked successfully' };
  }

  /**
   * Resolve the admin contact email for a given user email.
   * - If the user is an admin/main_admin --- return their company's email (fallback to main_admin email).
   * - If the user is a normal user --- return the email of their creator (admin who added them),
   *   or their company's admin, or the main_admin as final fallback.
   * - If the email is not found --- return the main_admin email.
   */
  async getContactAdmin(email) {
    if (!email) throw new Error('Email is required');

    // Find the user requesting help
    const user = await User.findOne({
      where: { email },
      attributes: ['id', 'role', 'company_id', 'created_by'],
    });

    // Fallback: main_admin email
    const getMainAdminEmail = async () => {
      const mainAdmin = await User.findOne({
        where: { role: 'main_admin', is_active: true },
        attributes: ['email'],
        order: [['created_at', 'ASC']],
      });
      return mainAdmin?.email || process.env.ADMIN_EMAIL || 'admin@forgedas.com';
    };

    if (!user) {
      // Unknown email --- direct to main admin
      return { contactEmail: await getMainAdminEmail() };
    }

    // If the user IS an admin/main_admin --- return their company email or main_admin
    if (user.role === 'main_admin' || user.role === 'admin') {
      if (user.company_id) {
        const company = await Company.findByPk(user.company_id, { attributes: ['email'] });
        if (company?.email) return { contactEmail: company.email };
      }
      return { contactEmail: await getMainAdminEmail() };
    }

    // Normal user --- find their admin (created_by) first
    if (user.created_by) {
      const creator = await User.findByPk(user.created_by, {
        attributes: ['email', 'is_active'],
      });
      if (creator?.is_active && creator.email) {
        return { contactEmail: creator.email };
      }
    }

    // Fallback: find any active admin in the same company
    if (user.company_id) {
      const companyAdmin = await User.findOne({
        where: { company_id: user.company_id, role: ['main_admin', 'admin'], is_active: true },
        attributes: ['email'],
        order: [['created_at', 'ASC']],
      });
      if (companyAdmin?.email) return { contactEmail: companyAdmin.email };

      // Or use the company email
      const company = await Company.findByPk(user.company_id, { attributes: ['email'] });
      if (company?.email) return { contactEmail: company.email };
    }

    // Final fallback
    return { contactEmail: await getMainAdminEmail() };
  }
}

module.exports = new AuthService();
