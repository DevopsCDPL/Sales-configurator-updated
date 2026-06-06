const bcrypt = require('bcryptjs');
const { User, Company, LoginHistory, Setting, TeamMember, Team } = require('../models');
const { Op } = require('sequelize');
const auditLogService = require('./auditLogService');
const { getCreatableRoles } = require('../config/rolePermissions');

const USER_ATTRIBUTES = [
  'id', 'name', 'email', 'phone', 'position', 'role', 'is_active', 'modules', 'module_permissions',
  'company_name', 'company_id', 'created_by', 'created_at', 'last_login',
  'department', 'tags', 'last_login_ip', 'last_login_device',
  'failed_login_attempts', 'locked_until', 'two_factor_enabled',
  'force_password_reset', 'invited_at', 'invite_status', 'avatar', 'gender'
];

class UserService {
  /**
   * Verify the target user belongs to the same company as the requesting user.
   * platform_admin bypasses this check.
   */
  _verifyUserTenant(targetUser, requestingUser) {
    if (!requestingUser) return;
    if (requestingUser.role === 'platform_admin') return;
    if (requestingUser.company_id && targetUser.company_id && targetUser.company_id !== requestingUser.company_id) {
      throw new Error('User not found');
    }
  }

  /**
   * Get users based on the requesting user's role:
   * - main_admin: sees ALL users
   * - admin: sees main_admin (read-only) + self + users they personally created
   * - user: sees only themselves (+ their creator info via association)
   */
  async getAllUsers(filters = {}, requestingUser = null) {
    const where = { deleted_at: null };

    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active;
    }

    // Role-based filtering
    if (requestingUser) {
      // Tenant isolation: scope by company_id for non-platform_admin users
      if (requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
        where.company_id = requestingUser.company_id;
      }

      if (requestingUser.role === 'user' || requestingUser.role === 'sales_engineer') {
        // User / Sales Engineer role: sees only themselves
        where.id = requestingUser.id;
      } else if (requestingUser.role === 'admin') {
        // Admin sees: main_admin (view-only) + self + users they created
        where[Op.or] = [
          { role: 'main_admin' },
          { id: requestingUser.id },
          { created_by: requestingUser.id }
        ];
      }
      // main_admin: no additional filtering beyond tenant scope
      if (filters.role && (requestingUser.role === 'main_admin' || requestingUser.role === 'platform_admin')) {
        where.role = filters.role;
      }
    }

    // Apply search filter
    if (filters.search) {
      const searchCondition = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${filters.search}%` } },
          { email: { [Op.iLike]: `%${filters.search}%` } }
        ]
      };
      if (where[Op.or]) {
        // Combine search with role-based filter using AND
        where[Op.and] = [
          { [Op.or]: where[Op.or] },
          searchCondition
        ];
        delete where[Op.or];
      } else {
        Object.assign(where, searchCondition);
      }
    }

    const users = await User.findAll({
      where,
      attributes: USER_ATTRIBUTES,
      include: [
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'role'],
          required: false
        },
        {
          model: TeamMember,
          as: 'teamMemberships',
          attributes: ['team_id', 'role'],
          required: false,
          include: [{
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
            required: false
          }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return users;
  }

  async getUserById(id, requestingUser = null) {
    const user = await User.findByPk(id, {
      attributes: USER_ATTRIBUTES,
      include: [
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'role'],
          required: false
        },
        {
          model: TeamMember,
          as: 'teamMemberships',
          attributes: ['team_id', 'role'],
          required: false,
          include: [{
            model: Team,
            as: 'team',
            attributes: ['id', 'name'],
            required: false
          }]
        }
      ]
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Tenant isolation check
    if (requestingUser) {
      this._verifyUserTenant(user, requestingUser);
    }

    // Access control for viewing
    if (requestingUser) {
      if (requestingUser.role === 'user' || requestingUser.role === 'sales_engineer') {
        // Users can only view themselves
        if (user.id !== requestingUser.id) {
          throw new Error('You do not have permission to view this user');
        }
      } else if (requestingUser.role === 'admin') {
        // Admin can view: main_admin (read-only), self, users they created
        const canView = user.role === 'main_admin' ||
                        user.id === requestingUser.id ||
                        user.created_by === requestingUser.id;
        if (!canView) {
          throw new Error('You do not have permission to view this user');
        }
      }
    }

    return user;
  }

  async updateProfile(id, profileData) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }

    const allowedFields = ['name', 'email', 'phone', 'position', 'role', 'gender'];
    const updates = {};

    for (const field of allowedFields) {
      if (!Object.prototype.hasOwnProperty.call(profileData, field)) {
        continue;
      }

      const incoming = profileData[field];
      if (incoming === undefined || incoming === null) {
        continue;
      }

      if (typeof incoming === 'string') {
        const normalized = incoming.trim();

        if ((field === 'name' || field === 'email') && normalized.length === 0) {
          throw new Error(`${field === 'name' ? 'Name' : 'Email'} is required`);
        }

        if (user[field] !== normalized) {
          updates[field] = normalized;
        }
        continue;
      }

      if (user[field] !== incoming) {
        updates[field] = incoming;
      }
    }

    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ where: { email: updates.email } });
      if (existingUser && existingUser.id !== user.id) {
        throw new Error('Email is already in use');
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        position: user.position,
        role: user.role,
        is_active: user.is_active,
        company_id: user.company_id,
        company_name: user.company_name
      };
    }

    await user.update(updates);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      position: user.position,
      role: user.role,
      is_active: user.is_active,
      company_id: user.company_id,
      company_name: user.company_name
    };
  }

  async changePassword(id, currentPassword, newPassword) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    await user.update({ password_hash });

    return { message: 'Password changed successfully' };
  }

  async createUser(userData, requestingUser = null) {
    const { name, email, password, role, company_name, company_id } = userData;

    // Access control for user creation using role-based creation map
    if (requestingUser) {
      // All main_admin users get full creation permissions (same as co_admin)
      let userIsCoAdmin = requestingUser.role === 'main_admin';

      const creatableRoles = getCreatableRoles(requestingUser.role, userIsCoAdmin);

      if (creatableRoles.length === 0) {
        throw new Error('Permission denied');
      }

      if (role && !creatableRoles.includes(role)) {
        throw new Error('Permission denied');
      }
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const defaultModules = ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'];

    // Determine company_id and company_name
    let userCompanyId = company_id || null;
    let userCompanyName = company_name || null;
    if (requestingUser && requestingUser.role !== 'platform_admin') {
      // Non-platform_admin users' created users always inherit their company
      userCompanyId = requestingUser.company_id || null;
      userCompanyName = requestingUser.company_name || null;
    }

    // If company_id is provided, resolve company_name from it
    if (userCompanyId && !userCompanyName) {
      const comp = await Company.findByPk(userCompanyId);
      if (comp) userCompanyName = comp.name;
    }

    const user = await User.create({
      name,
      email,
      password_hash,
      role: role || 'user',
      company_id: userCompanyId,
      company_name: userCompanyName,
      created_by: requestingUser ? requestingUser.id : null,
      modules: defaultModules
    });

    // Audit log
    auditLogService.log({
      action: 'user_created',
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.name,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { role: user.role, email: user.email, company_name: userCompanyName },
      company_id: user.company_id
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      modules: user.modules,
      company_id: user.company_id,
      company_name: user.company_name,
      created_by: user.created_by,
      created_at: user.created_at
    };
  }

  async updateUser(id, updateData, requestingUser = null) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Tenant isolation check
    if (requestingUser) {
      this._verifyUserTenant(user, requestingUser);
    }

    // Access control for updates
    if (requestingUser) {
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to update users');
      }
      if (requestingUser.role === 'admin') {
        // Admin cannot edit main_admin
        if (user.role === 'main_admin') {
          throw new Error('You do not have permission to edit the Main Admin');
        }
        // Admins within the same tenant can edit other admins and users
      }
      // Platform admins can edit anyone including main_admin
      if (requestingUser.role === 'platform_admin') {
        // No restrictions for platform admin
      }
    }

    const allowedFields = ['name', 'email', 'role', 'is_active', 'modules', 'module_permissions', 'department', 'tags', 'position'];
    const updates = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    // When activating a user, also clear soft-deletion status
    if (updates.is_active === true) {
      updates.deleted_at = null;
      updates.deleted_by = null;
    }

    // Enforce role-change permissions using the same creation map
    if (requestingUser && updates.role) {
      let userIsCoAdmin = false;
      try {
        const setting = await Setting.findByPk('co_admin_assignments');
        if (setting?.value) {
          const a = setting.value;
          const e = requestingUser.email.toLowerCase();
          userIsCoAdmin = (a.owner?.email?.toLowerCase() === e) ||
                          (a.coowner?.email?.toLowerCase() === e) ||
                          (a.backup?.email?.toLowerCase() === e);
        }
      } catch { /* ignore */ }

      const creatableRoles = getCreatableRoles(requestingUser.role, userIsCoAdmin);
      if (!creatableRoles.includes(updates.role)) {
        throw new Error('Permission denied');
      }
    }

    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ where: { email: updates.email } });
      if (existingUser) {
        throw new Error('Email is already in use');
      }
    }

    // Hash and update password if provided
    if (updateData.password && updateData.password.trim().length > 0) {
      if (updateData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }
      const salt = await bcrypt.genSalt(10);
      updates.password_hash = await bcrypt.hash(updateData.password, salt);
    }

    // Track changes for audit
    const oldRole = user.role;
    const oldActive = user.is_active;
    const oldModules = JSON.stringify(user.modules || []);

    await user.update(updates);

    // Audit logging for specific changes
    const auditBase = {
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.name,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      company_id: user.company_id,
    };

    if (updates.role && updates.role !== oldRole) {
      auditLogService.log({ ...auditBase, action: 'role_changed', details: { from: oldRole, to: updates.role } });
    }
    if (updates.is_active !== undefined && updates.is_active !== oldActive) {
      auditLogService.log({ ...auditBase, action: updates.is_active ? 'user_activated' : 'user_deactivated', details: { from: oldActive, to: updates.is_active } });
    }
    if (updates.modules && JSON.stringify(updates.modules) !== oldModules) {
      auditLogService.log({ ...auditBase, action: 'permissions_updated', details: { from: JSON.parse(oldModules), to: updates.modules } });
    }
    if (!updates.role && updates.is_active === undefined && !updates.modules) {
      auditLogService.log({ ...auditBase, action: 'user_updated', details: { fields: Object.keys(updates).filter(k => k !== 'password_hash') } });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      modules: user.modules,
      company_id: user.company_id,
      company_name: user.company_name,
      created_by: user.created_by
    };
  }

  async resetPassword(id, newPassword, requestingUser = null) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Access control for password reset
    if (requestingUser) {
      this._verifyUserTenant(user, requestingUser);
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to reset passwords');
      }
      if (requestingUser.role === 'admin') {
        if (user.role === 'main_admin') {
          throw new Error('You cannot reset the Main Admin password');
        }
        // Admins within the same tenant can reset passwords for other admins and users
      }
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    await user.update({ password_hash });

    // Audit log
    auditLogService.log({
      action: 'password_reset',
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.name,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { target_email: user.email },
      company_id: user.company_id
    });

    return { message: 'Password reset successfully' };
  }

  async deleteUser(id, requestingUser = null) {
    const user = await User.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Tenant isolation + access control
    if (requestingUser) {
      this._verifyUserTenant(user, requestingUser);
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to delete users');
      }
      // Platform admins can delete anyone including main_admin
      if (user.role === 'main_admin' && requestingUser.role !== 'platform_admin') {
        throw new Error('Cannot delete the Main Admin');
      }
      if (requestingUser.role === 'admin') {
        // Admins within same tenant can delete other admins and users (tenant check already done above)
      }
    }

    // Soft delete - move to recycle bin
    await user.update({
      is_active: false,
      deleted_at: new Date(),
      deleted_by: requestingUser ? requestingUser.id : null,
    });

    // Audit log
    auditLogService.log({
      action: 'user_deactivated',
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.name,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { role: user.role, email: user.email },
      company_id: user.company_id
    });

    return { message: 'User moved to recycle bin' };
  }

  /**
   * Get distinct company names for main_admin's dropdown.
   * Tries the Companies table first, falls back to distinct company_name on users.
   */
  async getCompanies(requestingUser = null) {
    // Non-platform_admin users should only see their own company
    if (requestingUser && requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
      try {
        const company = await Company.findByPk(requestingUser.company_id, {
          attributes: ['id', 'name'],
          raw: true
        });
        return company ? [company] : [];
      } catch (e) {
        return [{ id: requestingUser.company_id, name: requestingUser.company_name }];
      }
    }

    try {
      const companies = await Company.findAll({
        attributes: ['id', 'name'],
        where: { is_active: true },
        order: [['name', 'ASC']],
        raw: true
      });
      if (companies.length > 0) {
        return companies;
      }
    } catch (e) {
      // Companies table may not exist yet during migration
    }

    // Fallback: distinct company_name from users table
    const users = await User.findAll({
      attributes: ['company_name'],
      where: {
        company_name: { [Op.not]: null, [Op.ne]: '' }
      },
      group: ['company_name'],
      raw: true
    });
    return users.map(u => ({ id: null, name: u.company_name }));
  }

  /**
   * Get user stats for the dashboard summary cards.
   */
  async getStats(requestingUser) {
    const baseWhere = {};
    if (requestingUser.role === 'platform_admin') {
      // Platform admin sees all
    } else if (requestingUser.company_id) {
      baseWhere.company_id = requestingUser.company_id;
    }
    if (requestingUser.role === 'admin') {
      baseWhere[Op.or] = [
        { id: requestingUser.id },
        { created_by: requestingUser.id }
      ];
    } else if (requestingUser.role === 'user') {
      baseWhere.id = requestingUser.id;
    }

    const totalUsers = await User.count({ where: { ...baseWhere } });
    const totalAdmins = await User.count({ where: { ...baseWhere, role: 'admin' } });
    const totalMainAdmins = await User.count({ where: { ...baseWhere, role: 'main_admin' } });
    const activeUsers = await User.count({ where: { ...baseWhere, is_active: true } });
    const inactiveUsers = await User.count({ where: { ...baseWhere, is_active: false } });
    const totalMembers = await User.count({ where: { ...baseWhere, role: 'user' } });

    // Recent activity: created in last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentlyAdded = await User.count({
      where: { ...baseWhere, created_at: { [Op.gte]: weekAgo } }
    });

    return {
      totalUsers,
      totalAdmins,
      totalMainAdmins,
      activeUsers,
      inactiveUsers,
      totalMembers,
      recentlyAdded
    };
  }

  // --------- Security Controls ---------------------------------------------------------------------------------------------------------------------------------------------------------

  async forcePasswordReset(userId, requestingUser) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    this._verifyUserTenant(user, requestingUser);
    await user.update({ force_password_reset: true });
    auditLogService.log({
      action: 'force_password_reset', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: user.company_id
    });
    return { message: 'Password reset flag set' };
  }

  async toggle2FA(userId, enabled, requestingUser) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    this._verifyUserTenant(user, requestingUser);
    await user.update({ two_factor_enabled: enabled });
    auditLogService.log({
      action: enabled ? '2fa_enabled' : '2fa_disabled', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: user.company_id
    });
    return { message: `2FA ${enabled ? 'enabled' : 'disabled'}` };
  }

  async lockAccount(userId, requestingUser) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    this._verifyUserTenant(user, requestingUser);
    const lockUntil = new Date(); lockUntil.setFullYear(lockUntil.getFullYear() + 100);
    await user.update({ locked_until: lockUntil, is_active: false });
    auditLogService.log({
      action: 'account_locked', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: user.company_id
    });
    return { message: 'Account locked' };
  }

  async unlockAccount(userId, requestingUser) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    this._verifyUserTenant(user, requestingUser);
    await user.update({ locked_until: null, is_active: true, failed_login_attempts: 0 });
    auditLogService.log({
      action: 'account_unlocked', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: user.company_id
    });
    return { message: 'Account unlocked' };
  }

  async updateModulePermissions(userId, modulePermissions, requestingUser) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    this._verifyUserTenant(user, requestingUser);
    const old = user.module_permissions || {};
    await user.update({ module_permissions: modulePermissions });
    auditLogService.log({
      action: 'permission_updated', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { from: old, to: modulePermissions },
      company_id: user.company_id
    });
    return user;
  }

  // --------- Bulk Operations ---------------------------------------------------------------------------------------------------------------------------------------------------------------

  async bulkDeactivate(userIds, requestingUser) {
    const bulkWhere = { id: { [Op.in]: userIds } };
    // Tenant isolation: non-platform_admin can only deactivate users in their own company
    if (requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
      bulkWhere.company_id = requestingUser.company_id;
    }
    const users = await User.findAll({ where: bulkWhere });
    const deactivated = [];
    for (const user of users) {
      if (user.role === 'main_admin') continue;
      if (requestingUser.role === 'admin' && user.created_by !== requestingUser.id) continue;
      await user.update({ is_active: false });
      deactivated.push(user.id);
    }
    auditLogService.log({
      action: 'bulk_deactivate', entity_type: 'user',
      entity_id: null, entity_name: `${deactivated.length} users`,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { user_ids: deactivated, count: deactivated.length },
      company_id: requestingUser.company_id
    });
    return { deactivated: deactivated.length, total: userIds.length };
  }

  async bulkImport(usersData, requestingUser) {
    const results = { created: 0, errors: [] };
    const defaultModules = ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'];

    for (const row of usersData) {
      try {
        const exists = await User.findOne({ where: { email: row.email } });
        if (exists) { results.errors.push({ email: row.email, error: 'Already exists' }); continue; }

        const salt = await bcrypt.genSalt(10);
        const pw = row.password || 'Temp@1234';
        const password_hash = await bcrypt.hash(pw, salt);

        let companyId = requestingUser.company_id;
        let companyName = requestingUser.company_name;

        await User.create({
          name: row.name, email: row.email, password_hash,
          role: row.role || 'user',
          company_id: companyId, company_name: companyName,
          created_by: requestingUser.id,
          modules: defaultModules,
          department: row.department || null,
          tags: row.tags ? (Array.isArray(row.tags) ? row.tags : row.tags.split(',').map(t => t.trim())) : [],
          force_password_reset: true,
        });
        results.created++;
      } catch (e) {
        results.errors.push({ email: row.email, error: e.message });
      }
    }

    auditLogService.log({
      action: 'bulk_import', entity_type: 'user',
      entity_id: null, entity_name: `${results.created} users imported`,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role,
      details: { created: results.created, errors: results.errors.length },
      company_id: requestingUser.company_id
    });
    return results;
  }

  async inviteUser(email, role, requestingUser) {
    const existing = await User.findOne({ where: { email } });
    if (existing) throw new Error('User with this email already exists');

    const salt = await bcrypt.genSalt(10);
    const tempPw = await bcrypt.hash('invite_' + Date.now(), salt);

    let companyId = requestingUser.company_id;
    let companyName = requestingUser.company_name;

    const user = await User.create({
      name: email.split('@')[0],
      email, password_hash: tempPw,
      role: role || 'user',
      company_id: companyId, company_name: companyName,
      created_by: requestingUser.id,
      modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'],
      invited_at: new Date(), invite_status: 'pending',
      force_password_reset: true,
    });

    auditLogService.log({
      action: 'user_invited', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { email, role },
      company_id: requestingUser.company_id
    });
    return user;
  }

  async getLoginHistory(userId, limit = 20, requestingUser = null) {
    // Tenant isolation: verify the target user belongs to same company
    if (requestingUser && requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
      const targetUser = await User.findByPk(userId, { attributes: ['id', 'company_id'] });
      if (!targetUser || targetUser.company_id !== requestingUser.company_id) {
        throw new Error('User not found');
      }
    }
    return LoginHistory.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit, raw: true
    }).catch(() => []);
  }
}

module.exports = new UserService();
