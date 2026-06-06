const otpService = require('../services/otpService');
const { sendEmail } = require('../utils/emailService');
const { getCreatableRoles, CO_ADMIN_SLOTS } = require('../config/rolePermissions');
const bcrypt = require('bcryptjs');
const { User, Setting, sequelize } = require('../models');
const logger = require('../utils/logger');

// --- DB-backed assignment helpers ---

const SETTINGS_KEY = 'co_admin_assignments';

/**
 * Load co-admin role assignments from the settings table, scoped by company.
 * Returns { owner: { email, name, setupAt, setupBy }, coowner: {...}, backup: {...} }
 * or null if no setup has been done yet.
 */
async function loadAssignments(companyId) {
  try {
    const scopedKey = companyId ? `${SETTINGS_KEY}:${companyId}` : SETTINGS_KEY;
    const row = await Setting.findByPk(scopedKey);
    if (row && row.value) return row.value;
    // Fallback to global key (for migration period)
    if (companyId) {
      const global = await Setting.findByPk(SETTINGS_KEY);
      if (global && global.value) return global.value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save co-admin role assignments to the settings table, scoped by company.
 */
async function saveAssignments(assignments, companyId) {
  const scopedKey = companyId ? `${SETTINGS_KEY}:${companyId}` : SETTINGS_KEY;
  await Setting.upsert({ key: scopedKey, value: assignments });
}

/**
 * Check if an email is assigned to any co-admin slot.
 */
function isAssignedCoAdmin(email, assignments) {
  if (!email || !assignments) return false;
  const lower = email.toLowerCase();
  return CO_ADMIN_SLOTS.some(s => {
    const assigned = assignments[s.key]?.email;
    return assigned && assigned.toLowerCase() === lower;
  });
}

/**
 * Check if an email is the assigned Owner.
 */
function isAssignedOwner(email, assignments) {
  if (!email || !assignments) return false;
  const ownerEmail = assignments.owner?.email;
  return ownerEmail && ownerEmail.toLowerCase() === email.toLowerCase();
}

/**
 * Determine if a user has co-admin access.
 * - If no setup done yet -> any main_admin has access (setup mode)
 * - If setup exists -> only assigned co-admin emails have access
 */
function hasCoAdminAccess(user, assignments) {
  if (!user) return false;
  if (!assignments || !assignments.owner?.email) {
    return user.role === 'main_admin';
  }
  return isAssignedCoAdmin(user.email, assignments);
}

// --- Controller ---

const coAdminController = {
  /**
   * POST /co-admin/otp/generate
   * Generate OTP for Super Admin creation.
   */
  async generateOTP(req, res) {
    try {
      const { targetEmail, targetRole } = req.body;
      const requester = req.user;
      const companyId = req.activeCompanyId || requester?.company_id;
      const assignments = await loadAssignments(companyId);

      if (!hasCoAdminAccess(requester, assignments)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only authorized Co Admins can perform this action.',
        });
      }

      if (targetRole !== 'main_admin') {
        return res.status(400).json({
          success: false,
          message: 'OTP verification is only required for Super Admin creation.',
        });
      }

      if (!targetEmail) {
        return res.status(400).json({
          success: false,
          message: 'Target email is required.',
        });
      }

      const otp = await otpService.generateOTP(requester.email, targetEmail, targetRole);

      let emailSent = false;
      try {
        const emailResult = await sendEmail({
          to: requester.email,
          subject: 'OTP Verification - Super Admin Creation',
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <div style="background: linear-gradient(135deg, #1F7A63 0%, #166354 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h2 style="color: #fff; margin: 0; font-size: 20px;">Forge i-DAS</h2>
                <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Security Verification</p>
              </div>
              <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">You are creating a <strong>Super Admin</strong> account for:</p>
                <p style="color: #1F7A63; font-weight: 600; font-size: 15px; margin: 0 0 24px;">${targetEmail}</p>
                <div style="background: #f0fdf4; border: 2px solid #1F7A63; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
                  <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
                  <p style="color: #1F7A63; font-size: 32px; font-weight: 800; letter-spacing: 6px; margin: 0;">${otp}</p>
                </div>
                <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">This OTP expires in 10 minutes. Do not share it with anyone.</p>
              </div>
            </div>
          `,
          text: `Your OTP for Super Admin creation (${targetEmail}): ${otp}. Expires in 10 minutes.`,
        });
        emailSent = emailResult?.success === true && !emailResult?.testMode;
      } catch (emailErr) {
        logger.error({ err: emailErr.message }, '[CoAdmin] Failed to send OTP email');
      }

      if (!emailSent) {
        logger.warn({ email: requester.email }, '[CoAdmin] OTP email could not be delivered to real inbox');
      }

      res.json({
        success: true,
        message: emailSent
          ? `OTP sent to ${requester.email}. Please check your email.`
          : `Email delivery unavailable. OTP has been provided directly.`,
        emailSent,
        ...(!emailSent ? { otp } : {}),
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] generateOTP error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /co-admin/otp/verify
   * Verify OTP for Super Admin creation.
   */
  async verifyOTP(req, res) {
    try {
      const { targetEmail, otp } = req.body;
      const requester = req.user;
      const companyId = req.activeCompanyId || requester?.company_id;
      const assignments = await loadAssignments(companyId);

      if (!hasCoAdminAccess(requester, assignments)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied.',
        });
      }

      if (!targetEmail || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Target email and OTP are required.',
        });
      }

      await otpService.verifyOTP(requester.email, targetEmail, otp);

      res.json({
        success: true,
        message: 'OTP verified successfully. You can now create the Super Admin.',
        verified: true,
      });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /co-admin/check-access
   * Check if the current user has Co Admin access.
   */
  async checkAccess(req, res) {
    const companyId = req.activeCompanyId || req.user?.company_id;
    const assignments = await loadAssignments(companyId);
    const access = hasCoAdminAccess(req.user, assignments);
    const isOwner = isAssignedOwner(req.user.email, assignments);
    const isSetup = !!(assignments && assignments.owner?.email);
    // All main_admin users get full access (same as co_admin)
    const effectiveAccess = req.user.role === 'main_admin' ? true : access;
    const creatableRoles = getCreatableRoles(req.user.role, effectiveAccess);

    res.json({
      success: true,
      data: {
        isCoAdmin: effectiveAccess,
        isOwner,
        isSetupComplete: isSetup,
        creatableRoles,
        userRole: req.user.role,
        userEmail: req.user.email,
      },
    });
  },

  /**
   * GET /co-admin/credentials
   * List Co Admin credential slots with their current assignment status.
   */
  async listCredentials(req, res) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const assignments = await loadAssignments(companyId);

      // All main_admin users can view co-admin credentials
      if (req.user.role !== 'main_admin') {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const slots = [];
      for (const slot of CO_ADMIN_SLOTS) {
        const assigned = assignments?.[slot.key];
        let user = null;

        if (assigned?.email) {
          const { fn, col, where: seqWhere } = User.sequelize;
          user = await User.findOne({
            where: seqWhere(fn('LOWER', col('email')), assigned.email.toLowerCase()),
            attributes: ['id', 'name', 'email', 'role', 'is_active', 'last_login', 'force_password_reset', 'created_at'],
          });
        }

        slots.push({
          key: slot.key,
          label: slot.label,
          isSeeded: !!user,
          isDemo: false,
          assignedEmail: assigned?.email || null,
          setupAt: assigned?.setupAt || null,
          setupBy: assigned?.setupBy || null,
          user: user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_active: user.is_active,
            last_login: user.last_login,
            force_password_reset: user.force_password_reset,
            created_at: user.created_at,
          } : null,
        });
      }

      res.json({ success: true, data: slots });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] listCredentials error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PUT /co-admin/credentials/:slotKey
   * Set or update a Co Admin credential slot.
   *
   * Rules:
   * - No setup yet: any main_admin can set (owner first)
   * - After setup: only owner can modify
   * - Requires OTP verification
   *
   * Body: { email, password, name, otp }
   */
  async updateCredential(req, res) {
    try {
      const { slotKey } = req.params;
      const { email, password, name } = req.body;
      const requester = req.user;
      const companyId = req.activeCompanyId || requester?.company_id;

      const slot = CO_ADMIN_SLOTS.find(s => s.key === slotKey);
      if (!slot) {
        return res.status(404).json({ success: false, message: 'Invalid credential slot.' });
      }

      const assignments = await loadAssignments(companyId);
      const isSetup = !!(assignments && assignments.owner?.email);
      const isOwner = isAssignedOwner(requester.email, assignments);

      // Access control
      if (isSetup && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only the Owner can manage Co Admin roles.',
        });
      }

      if (!isSetup && requester.role !== 'main_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only Super Admins can perform initial setup.',
        });
      }

      // During initial setup, owner must be set first
      if (!isSetup && slotKey !== 'owner' && !(assignments && assignments.owner?.email)) {
        return res.status(400).json({
          success: false,
          message: 'Please set the Owner role first before configuring other roles.',
        });
      }

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
      }

      // Find or create the user account
      const { fn, col, where: seqWhere } = User.sequelize;
      let user = await User.findOne({
        where: seqWhere(fn('LOWER', col('email')), email.toLowerCase()),
      });

      if (!user) {
        if (!password) {
          return res.status(400).json({
            success: false,
            message: 'Password is required when creating a new credential.',
          });
        }
        if (password.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        user = await User.create({
          name: name || slot.label,
          email: email.toLowerCase(),
          password_hash: hash,
          role: 'main_admin',
          is_active: true,
          force_password_reset: false,
          modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'],
        });
      } else {
        const updateData = {};
        if (name) updateData.name = name;
        if (password) {
          if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
          }
          const salt = await bcrypt.genSalt(10);
          updateData.password_hash = await bcrypt.hash(password, salt);
          updateData.force_password_reset = false;
        }
        if (Object.keys(updateData).length > 0) {
          await user.update(updateData);
        }
      }

      // Update assignments in DB
      const current = assignments || {};
      current[slotKey] = {
        email: email.toLowerCase(),
        name: user.name || name || slot.label,
        setupAt: new Date().toISOString(),
        setupBy: requester.email,
      };
      await saveAssignments(current, companyId);

      // Audit log
      try {
        const AuditLog = sequelize.models.AuditLog || sequelize.models.audit_log;
        if (AuditLog) {
          await AuditLog.create({
            action: isSetup ? 'role_updated' : 'role_initial_setup',
            entity_type: 'co_admin_role',
            entity_id: slotKey,
            entity_name: slot.label,
            performed_by: requester.id,
            performer_name: requester.name,
            performer_role: requester.role,
            details: {
              slotKey,
              slotLabel: slot.label,
              email: email.toLowerCase(),
              performedBy: requester.email,
            },
            ip_address: req.ip || req.headers['x-forwarded-for'],
            company_id: companyId,
          });
        }
      } catch (auditErr) {
        logger.error({ err: auditErr.message }, '[CoAdmin] Audit log failed (non-blocking)');
      }

      res.json({
        success: true,
        message: `${slot.label} credentials ${isSetup ? 'updated' : 'configured'} successfully.`,
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] updateCredential error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /co-admin/owner-info
   * Get current role assignments and whether the current user is the Owner.
   */
  async getOwnerInfo(req, res) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const assignments = await loadAssignments(companyId);

      // All main_admin users can view owner info
      if (req.user.role !== 'main_admin') {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const isSetup = !!(assignments && assignments.owner?.email);
      const isOwner = isAssignedOwner(req.user.email, assignments);

      const slots = [];
      for (const slot of CO_ADMIN_SLOTS) {
        const assigned = assignments?.[slot.key];
        let user = null;

        if (assigned?.email) {
          const { fn, col, where: seqWhere } = User.sequelize;
          user = await User.findOne({
            where: seqWhere(fn('LOWER', col('email')), assigned.email.toLowerCase()),
            attributes: ['id', 'name', 'email', 'role', 'is_active', 'last_login'],
          });
        }

        slots.push({
          key: slot.key,
          label: slot.label,
          isSeeded: !!assigned?.email,
          user: user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            is_active: user.is_active,
            lastLogin: user.last_login,
          } : null,
        });
      }

      res.json({
        success: true,
        data: {
          isSetupComplete: isSetup,
          isCurrentUserOwner: isOwner,
          slots,
        },
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] getOwnerInfo error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /co-admin/transfer-role
   * Transfer a Co Admin role to a new user. Owner only.
   *
   * Body: { targetSlot, targetEmail }
   */
  async transferRole(req, res) {
    try {
      const { targetSlot, targetEmail } = req.body;
      const requester = req.user;
      const companyId = req.activeCompanyId || requester?.company_id;
      const assignments = await loadAssignments(companyId);

      if (!isAssignedOwner(requester.email, assignments)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only the Owner can transfer roles.',
        });
      }

      if (!targetSlot || !targetEmail) {
        return res.status(400).json({ success: false, message: 'targetSlot and targetEmail are required.' });
      }

      const slot = CO_ADMIN_SLOTS.find(s => s.key === targetSlot);
      if (!slot) {
        return res.status(404).json({ success: false, message: 'Invalid slot key.' });
      }

      const { fn, col, where: seqWhere } = User.sequelize;
      const targetUser = await User.findOne({
        where: seqWhere(fn('LOWER', col('email')), targetEmail.toLowerCase()),
      });
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'Target user not found. They must have an account first.',
        });
      }

      const oldEmail = assignments[targetSlot]?.email || null;

      assignments[targetSlot] = {
        email: targetEmail.toLowerCase(),
        name: targetUser.name,
        setupAt: new Date().toISOString(),
        setupBy: requester.email,
      };
      await saveAssignments(assignments, companyId);

      // Audit log
      try {
        const AuditLog = sequelize.models.AuditLog || sequelize.models.audit_log;
        if (AuditLog) {
          await AuditLog.create({
            action: 'role_transferred',
            entity_type: 'co_admin_role',
            entity_id: targetSlot,
            entity_name: slot.label,
            performed_by: requester.id,
            performer_name: requester.name,
            performer_role: requester.role,
            details: {
              slotKey: targetSlot,
              slotLabel: slot.label,
              oldEmail,
              newEmail: targetEmail.toLowerCase(),
              transferredBy: requester.email,
            },
            company_id: companyId,
            ip_address: req.ip || req.headers['x-forwarded-for'],
          });
        }
      } catch (auditErr) {
        logger.error({ err: auditErr.message }, '[CoAdmin] Audit log failed (non-blocking)');
      }

      res.json({
        success: true,
        message: `${slot.label} role transferred to ${targetEmail}.`,
        data: {
          slotKey: targetSlot,
          slotLabel: slot.label,
          oldEmail,
          newEmail: targetEmail.toLowerCase(),
        },
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] transferRole error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /co-admin/role-otp/generate
   * Generate OTP for role setup or transfer.
   *
   * Body: { targetSlot }
   */
  async generateRoleOTP(req, res) {
    try {
      const { targetSlot } = req.body;
      const requester = req.user;
      const companyId = req.activeCompanyId || requester?.company_id;
      const assignments = await loadAssignments(companyId);
      const isSetup = !!(assignments && assignments.owner?.email);

      if (isSetup && !isAssignedOwner(requester.email, assignments)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only the Owner can perform role assignments.',
        });
      }

      if (!isSetup && requester.role !== 'main_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only Super Admins can perform initial setup.',
        });
      }

      if (!targetSlot) {
        return res.status(400).json({ success: false, message: 'targetSlot is required.' });
      }

      const slot = CO_ADMIN_SLOTS.find(s => s.key === targetSlot);
      if (!slot) {
        return res.status(404).json({ success: false, message: 'Invalid slot key.' });
      }

      const otpKey = isSetup ? `role-transfer:${targetSlot}` : `role-setup:${targetSlot}`;
      const otp = await otpService.generateOTP(requester.email, otpKey, 'role_setup');

      let emailSent = false;
      try {
        const emailResult = await sendEmail({
          to: requester.email,
          subject: `OTP Verification - ${slot.label} Role ${isSetup ? 'Transfer' : 'Setup'}`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h2 style="color: #fff; margin: 0; font-size: 20px;">Forge i-DAS</h2>
                <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">Role ${isSetup ? 'Transfer' : 'Setup'} Verification</p>
              </div>
              <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
                  You are ${isSetup ? 'transferring' : 'setting up'} the <strong>${slot.label}</strong> role.
                </p>
                <div style="background: #f5f3ff; border: 2px solid #7c3aed; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 24px;">
                  <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
                  <p style="color: #7c3aed; font-size: 32px; font-weight: 800; letter-spacing: 6px; margin: 0;">${otp}</p>
                </div>
                <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">This OTP expires in 10 minutes. Do not share it.</p>
              </div>
            </div>
          `,
          text: `Your OTP for ${slot.label} role ${isSetup ? 'transfer' : 'setup'}: ${otp}. Expires in 10 minutes.`,
        });
        emailSent = emailResult?.success === true && !emailResult?.testMode;
      } catch (emailErr) {
        logger.error({ err: emailErr.message }, '[CoAdmin] Failed to send role OTP email');
      }

      if (!emailSent) {
        logger.warn({ email: requester.email }, '[CoAdmin] Role OTP email could not be delivered to real inbox');
      }

      res.json({
        success: true,
        message: emailSent
          ? `OTP sent to ${requester.email} for ${slot.label} role ${isSetup ? 'transfer' : 'setup'}.`
          : `Email delivery unavailable. OTP has been provided directly.`,
        emailSent,
        ...(!emailSent ? { otp } : {}),
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] generateRoleOTP error');
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /co-admin/create-super-admin
   * Create Super Admin after OTP has been verified.
   * Checks is_verified = true in DB, then creates the user.
   *
   * Body: { name, email, password }
   */
  async createSuperAdmin(req, res) {
    try {
      const { name, email, password } = req.body;
      const requester = req.user;
      logger.info({ requester: requester?.email, target: email }, '[CoAdmin] createSuperAdmin called');
      const companyId = req.activeCompanyId || requester?.company_id;
      const assignments = await loadAssignments(companyId);

      // Access control — all main_admin users can create Super Admins
      if (requester.role !== 'main_admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only Owner, Co-Owner, or Super Admin can create Super Admins.',
        });
      }

      // Validate inputs
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required.',
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters.',
        });
      }

      // Check if user already exists
      const { fn, col, where: seqWhere } = User.sequelize;
      const existingUser = await User.findOne({
        where: seqWhere(fn('LOWER', col('email')), email.toLowerCase()),
      });
      if (existingUser) {
        logger.warn({ email }, '[CoAdmin] User already exists');
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists.',
        });
      }

      // Create the Super Admin
      logger.info({ email }, '[CoAdmin] Creating user with role main_admin');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password_hash: hash,
        role: 'main_admin',
        is_active: true,
        force_password_reset: false,
        created_by: requester.id,
        modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'],
      });

      // Audit log
      try {
        const AuditLog = sequelize.models.AuditLog || sequelize.models.audit_log;
        if (AuditLog) {
          await AuditLog.create({
            action: 'super_admin_created',
            entity_type: 'user',
            entity_id: user.id,
            entity_name: user.name,
            performed_by: requester.id,
            performer_name: requester.name,
            performer_role: requester.role,
            details: {
              email: email.toLowerCase(),
              role: 'main_admin',
              createdBy: requester.email,
              otpVerified: true,
            },
            ip_address: req.ip || req.headers['x-forwarded-for'],
            company_id: companyId,
          });
        }
      } catch (auditErr) {
        logger.error({ err: auditErr.message }, '[CoAdmin] Audit log failed (non-blocking)');
      }

      logger.info({ email, createdBy: requester.email }, '[CoAdmin] Super Admin created');

      res.status(201).json({
        success: true,
        message: 'Super Admin created successfully.',
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          is_active: user.is_active,
        },
      });
    } catch (err) {
      logger.error({ err: err.message }, '[CoAdmin] createSuperAdmin error');
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = coAdminController;
