/**
 * Platform Admin Service
 * 
 * Provides CRUD for tenants (companies) and platform-level user management.
 * Only accessible by platform_admin role users.
 */
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Company, User, LoginHistory, AuditLog, sequelize } = require('../models');

class PlatformAdminService {

  // ── Auto-generate sequential company code ───────────────────────────────
  async _generateCompanyCode() {
    const last = await Company.findOne({
      where: { company_code: { [Op.like]: 'CMP-%' } },
      order: [['company_code', 'DESC']],
    });
    const seq = last ? parseInt(last.company_code.replace('CMP-', ''), 10) + 1 : 1;
    return `CMP-${String(seq).padStart(4, '0')}`;
  }

  // ── Package → user limit mapping ────────────────────────────────────────
  static PLAN_LIMITS = { starter: 5, premium: 10, enterprise: null };

  _resolvePlanLimit(plan, customLimit) {
    if (plan === 'enterprise') return customLimit || 50;
    return PlatformAdminService.PLAN_LIMITS[plan] || 5;
  }

  // ── Dashboard Stats ─────────────────────────────────────────────────────
  async getDashboardStats() {
    const totalCompanies = await Company.count({ where: { deleted_at: null } });
    const activeCompanies = await Company.count({ where: { is_active: true, deleted_at: null } });
    const totalUsers = await User.count({ where: { role: { [Op.ne]: 'platform_admin' } } });
    const totalOwners = await User.count({ where: { role: 'main_admin', company_id: { [Op.ne]: null } } });
    const platformAdmins = await User.count({ where: { role: 'platform_admin' } });

    // Active subscriptions: companies with active subscription status
    const activeSubscriptions = await Company.count({
      where: { deleted_at: null, is_active: true, subscription_status: 'active' },
    });

    // Subscription stats
    const today = new Date().toISOString().split('T')[0];
    const expiringSoon = await Company.count({
      where: {
        deleted_at: null,
        is_active: true,
        subscription_end_date: {
          [Op.between]: [today, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]],
        },
      },
    });
    const expired = await Company.count({
      where: {
        deleted_at: null,
        subscription_end_date: { [Op.lt]: today },
        subscription_status: 'expired',
      },
    });

    return {
      totalCompanies,
      activeCompanies,
      inactiveCompanies: totalCompanies - activeCompanies,
      totalUsers,
      totalOwners,
      platformAdmins,
      activeSubscriptions,
      revenue: 0,
      expiringSoon,
      expired,
    };
  }

  // ── Company (Tenant) Management ─────────────────────────────────────────
  async getAllCompanies(filters = {}) {
    const where = { deleted_at: null };
    if (filters.status === 'active') where.is_active = true;
    if (filters.status === 'inactive') where.is_active = false;
    if (filters.search) {
      where.name = { [Op.iLike]: `%${filters.search}%` };
    }

    const companies = await Company.findAll({
      where,
      attributes: ['id', 'name', 'company_code', 'email', 'phone', 'address', 'is_active',
        'plan', 'subscription_start_date', 'subscription_end_date', 'subscription_status',
        'logo_url', 'logo_data', 'user_limit', 'storage_used_mb', 'last_activity_at', 'created_at'],
      order: [['created_at', 'DESC']],
    });

    const companyIds = companies.map((company) => company.id);
    if (companyIds.length === 0) return [];

    const owners = await User.findAll({
      where: { company_id: { [Op.in]: companyIds }, role: 'main_admin' },
      attributes: ['id', 'name', 'email', 'company_id', 'last_login', 'created_at'],
      order: [['company_id', 'ASC'], ['created_at', 'ASC']],
    });

    const userCounts = await User.findAll({
      where: { company_id: { [Op.in]: companyIds }, role: { [Op.ne]: 'platform_admin' } },
      attributes: [
        'company_id',
        [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'userCount'],
      ],
      group: ['company_id'],
      raw: true,
    });

    const activeUserCounts = await User.findAll({
      where: { company_id: { [Op.in]: companyIds }, role: { [Op.ne]: 'platform_admin' }, is_active: true },
      attributes: [
        'company_id',
        [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'activeUserCount'],
      ],
      group: ['company_id'],
      raw: true,
    });

    const ownerByCompanyId = new Map();
    owners.forEach((owner) => {
      if (!ownerByCompanyId.has(owner.company_id)) {
        ownerByCompanyId.set(owner.company_id, owner);
      }
    });

    const userCountByCompanyId = new Map(
      userCounts.map((row) => [row.company_id, Number(row.userCount || 0)])
    );
    const activeUserCountByCompanyId = new Map(
      activeUserCounts.map((row) => [row.company_id, Number(row.activeUserCount || 0)])
    );

    return companies.map((company) => {
      const owner = ownerByCompanyId.get(company.id) || null;
      return {
        ...company.toJSON(),
        userCount: userCountByCompanyId.get(company.id) || 0,
        activeUserCount: activeUserCountByCompanyId.get(company.id) || 0,
        owner: owner ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          last_login: owner.last_login,
        } : null,
      };
    });
  }

  async getCompanyById(companyId) {
    const company = await Company.findByPk(companyId, {
      include: [
        {
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'role', 'is_active', 'last_login', 'created_at'],
          where: { role: { [Op.ne]: 'platform_admin' } },
          required: false,
        },
      ],
    });
    if (!company) throw new Error('Company not found');
    return company;
  }

  async createCompany(data) {
    const {
      company_name, logo_url,
      admin_name, admin_email, admin_password,
      subscription_start_date, subscription_end_date,
      email, phone, address,
      plan, custom_user_limit,
      initial_users,
    } = data;

    // Validate required fields
    if (!company_name || !admin_email || !admin_password) {
      throw new Error('Company name, admin email, and admin password are required');
    }

    // Check duplicate company name
    const existingCompany = await Company.findOne({ where: { name: company_name, deleted_at: null } });
    if (existingCompany) throw new Error('A company with this name already exists');

    // Check duplicate admin email (allow soft-deleted or inactive users to be reused)
    const existingUser = await User.findOne({ where: { email: admin_email.toLowerCase().trim() } });
    if (existingUser && !existingUser.deleted_at && existingUser.is_active) {
      throw new Error('A user with this email already exists and is active. Please use a different email.');
    }

    // Auto-generate unique sequential company code
    const company_code = await this._generateCompanyCode();

    // Resolve plan & user limit
    const selectedPlan = plan || 'starter';
    const userLimit = this._resolvePlanLimit(selectedPlan, custom_user_limit);

    // Create company (tenant)
    const company = await Company.create({
      name: company_name,
      company_code,
      logo_url: logo_url || null,
      logo_data: data.logo_data || null,
      email: email || admin_email,
      phone: phone || null,
      address: address || null,
      subscription_start_date: subscription_start_date || new Date().toISOString().split('T')[0],
      subscription_end_date: subscription_end_date || null,
      subscription_status: 'active',
      is_active: true,
      plan: selectedPlan,
      user_limit: userLimit,
    });

    // Create company admin user (or restore deleted/inactive user with same email)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(admin_password, salt);

    let adminUser;
    if (existingUser) {
      // Restore existing user and reassign to new company
      await existingUser.update({
        name: admin_name || existingUser.name || 'Company Admin',
        password_hash,
        role: 'main_admin',
        company_id: company.id,
        company_name: company_name,
        is_active: true,
        deleted_at: null,
        deleted_by: null,
        failed_login_attempts: 0,
        locked_until: null,
        modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'],
      });
      adminUser = existingUser;
    } else {
      adminUser = await User.create({
        name: admin_name || 'Company Admin',
        email: admin_email.toLowerCase().trim(),
        password_hash,
        role: 'main_admin',
        company_id: company.id,
        company_name: company_name,
        is_active: true,
        modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'],
      });
    }

    // Create initial users if provided
    const createdUsers = [{ id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role }];
    if (Array.isArray(initial_users) && initial_users.length > 0) {
      for (const u of initial_users) {
        if (!u.email) continue;
        // Check user limit
        const currentCount = await User.count({ where: { company_id: company.id } });
        if (currentCount >= userLimit) break;

        const dup = await User.findOne({ where: { email: u.email.toLowerCase().trim() } });
        if (dup) continue;

        const userSalt = await bcrypt.genSalt(10);
        // Determine role-based modules
        const roleModules = u.role === 'sales_engineer'
          ? ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings']
          : ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'];

        if (u.send_invite) {
          // Create user with force_password_reset so they set their own password on first login
          const tempHash = await bcrypt.hash('temp_' + Date.now(), userSalt);
          const newUser = await User.create({
            name: u.name || 'New User',
            email: u.email.toLowerCase().trim(),
            password_hash: tempHash,
            role: u.role || 'user',
            company_id: company.id,
            company_name: company_name,
            is_active: true,
            force_password_reset: true,
            invited_at: new Date(),
            invite_status: 'pending',
            modules: roleModules,
          });
          createdUsers.push({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, invite_sent: true });
        } else {
          // Create user with specified password
          const pw = u.password || admin_password;
          const hash = await bcrypt.hash(pw, userSalt);
          const newUser = await User.create({
            name: u.name || 'New User',
            email: u.email.toLowerCase().trim(),
            password_hash: hash,
            role: u.role || 'user',
            company_id: company.id,
            company_name: company_name,
            is_active: true,
            modules: roleModules,
          });
          createdUsers.push({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
        }
      }
    }

    return { company, users: createdUsers };
  }

  async updateCompany(companyId, data) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    const updateFields = {};
    if (data.company_name !== undefined) updateFields.name = data.company_name;
    if (data.company_code !== undefined) updateFields.company_code = data.company_code;
    if (data.logo_url !== undefined) updateFields.logo_url = data.logo_url;
    if (data.logo_data !== undefined) updateFields.logo_data = data.logo_data;
    if (data.email !== undefined) updateFields.email = data.email;
    if (data.phone !== undefined) updateFields.phone = data.phone;
    if (data.address !== undefined) updateFields.address = data.address;
    if (data.subscription_start_date !== undefined) updateFields.subscription_start_date = data.subscription_start_date;
    if (data.subscription_end_date !== undefined) updateFields.subscription_end_date = data.subscription_end_date;
    if (data.subscription_status !== undefined) updateFields.subscription_status = data.subscription_status;
    if (data.is_active !== undefined) updateFields.is_active = data.is_active;
    if (data.user_limit !== undefined) updateFields.user_limit = data.user_limit;
    if (data.plan !== undefined) updateFields.plan = data.plan;

    await company.update(updateFields);
    return company;
  }

  async activateCompany(companyId) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');
    await company.update({ is_active: true, suspended_at: null, suspension_reason: null });
    return company;
  }

  async deactivateCompany(companyId) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');
    await company.update({ is_active: false, suspended_at: new Date() });
    return company;
  }

  async resetCompanyAdminPassword(companyId, newPassword) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    const admin = await User.findOne({
      where: { company_id: companyId, role: { [Op.in]: ['main_admin', 'admin'] } },
      order: [['created_at', 'ASC']],
    });
    if (!admin) throw new Error('No admin found for this company');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    await admin.update({ password_hash, failed_login_attempts: 0, locked_until: null });

    return { message: 'Admin password reset successfully', adminEmail: admin.email };
  }

  // ── Company User Management ─────────────────────────────────────────────
  async getCompanyUsers(companyId) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');
    const users = await User.findAll({
      where: { company_id: companyId, role: { [Op.ne]: 'platform_admin' } },
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'modules', 'last_login', 'created_at', 'invite_status', 'force_password_reset'],
      order: [['created_at', 'ASC']],
    });
    return { users, user_limit: company.user_limit, plan: company.plan };
  }

  async addCompanyUser(companyId, data) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    // Check user limit
    const currentCount = await User.count({ where: { company_id: companyId, role: { [Op.ne]: 'platform_admin' } } });
    if (currentCount >= company.user_limit) {
      throw new Error(`User limit reached (${company.user_limit}). Upgrade plan to add more users.`);
    }

    const { name, email, role, password, send_invite } = data;
    if (!email) throw new Error('Email is required');

    const existing = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) throw new Error('A user with this email already exists');

    const validRole = role || 'user';
    const roleModules = validRole === 'sales_engineer'
      ? ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings']
      : ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'];

    const salt = await bcrypt.genSalt(10);

    if (send_invite) {
      const tempHash = await bcrypt.hash('temp_' + Date.now(), salt);
      const user = await User.create({
        name: name || 'New User',
        email: email.toLowerCase().trim(),
        password_hash: tempHash,
        role: validRole,
        company_id: companyId,
        company_name: company.name,
        is_active: true,
        force_password_reset: true,
        invited_at: new Date(),
        invite_status: 'pending',
        modules: roleModules,
      });
      return { id: user.id, name: user.name, email: user.email, role: user.role, invite_sent: true };
    } else {
      if (!password) throw new Error('Password is required when not sending invite');
      const hash = await bcrypt.hash(password, salt);
      const user = await User.create({
        name: name || 'New User',
        email: email.toLowerCase().trim(),
        password_hash: hash,
        role: validRole,
        company_id: companyId,
        company_name: company.name,
        is_active: true,
        modules: roleModules,
      });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }
  }

  async updateCompanyUser(companyId, userId, data) {
    const user = await User.findOne({ where: { id: userId, company_id: companyId } });
    if (!user) throw new Error('User not found in this company');

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.role !== undefined) {
      updates.role = data.role;
      // Auto-set modules based on role
      updates.modules = data.role === 'sales_engineer'
        ? ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings']
        : ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'];
    }
    if (data.is_active !== undefined) {
      updates.is_active = data.is_active;
      // When activating a user, also clear soft-deletion status
      if (data.is_active === true) {
        updates.deleted_at = null;
        updates.deleted_by = null;
      }
    }
    if (data.modules !== undefined) updates.modules = data.modules;

    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password_hash = await bcrypt.hash(data.password, salt);
      updates.force_password_reset = false;
    }

    await user.update(updates);
    return user;
  }

  async deleteCompanyUser(companyId, userId) {
    const user = await User.findOne({ where: { id: userId, company_id: companyId } });
    if (!user) throw new Error('User not found in this company');

    // Mark inactive, then permanently delete
    await user.update({ is_active: false });
    await this._cleanupUserReferences([userId]);
    try {
      await user.destroy();
    } catch (e) {
      if (e.name === 'SequelizeForeignKeyConstraintError') {
        console.warn('[Delete Retry] FK error on first attempt, re-running cleanup:', e.message);
        await this._cleanupUserReferences([userId]);
        await user.destroy();
      } else {
        throw e;
      }
    }
    return { message: 'User deleted successfully' };
  }

  async bulkDeleteCompanyUsers(companyId, userIds) {
    const users = await User.findAll({ where: { id: { [Op.in]: userIds }, company_id: companyId } });
    if (users.length === 0) throw new Error('No users found in this company');

    // Step 1: Mark all as inactive
    await User.update({ is_active: false }, { where: { id: { [Op.in]: userIds }, company_id: companyId } });

    // Step 2: Clean up foreign key references
    await this._cleanupUserReferences(userIds);

    // Step 3: Permanently delete
    try {
      await User.destroy({ where: { id: { [Op.in]: userIds }, company_id: companyId } });
    } catch (e) {
      if (e.name === 'SequelizeForeignKeyConstraintError') {
        console.warn('[Delete Retry] FK error on first attempt, re-running cleanup:', e.message);
        await this._cleanupUserReferences(userIds);
        await User.destroy({ where: { id: { [Op.in]: userIds }, company_id: companyId } });
      } else {
        throw e;
      }
    }

    return { message: `${users.length} user(s) deleted successfully`, count: users.length };
  }

  // ── Direct Bulk Delete (any users, regardless of company) ───────────────
  async bulkDeleteUsers(userIds) {
    const users = await User.findAll({ where: { id: { [Op.in]: userIds } } });
    if (users.length === 0) throw new Error('No users found');

    // Don't allow deleting platform admins via this route
    const platformAdmins = users.filter(u => u.role === 'platform_admin');
    if (platformAdmins.length > 0) {
      throw new Error('Cannot delete platform admin users via bulk delete');
    }

    await User.update({ is_active: false }, { where: { id: { [Op.in]: userIds } } });

    // Clean up foreign key references before hard delete
    await this._cleanupUserReferences(userIds);

    try {
      await User.destroy({ where: { id: { [Op.in]: userIds } } });
    } catch (e) {
      if (e.name === 'SequelizeForeignKeyConstraintError') {
        console.warn('[Delete Retry] FK error on first attempt, re-running cleanup:', e.message);
        await this._cleanupUserReferences(userIds);
        await User.destroy({ where: { id: { [Op.in]: userIds } } });
      } else {
        throw e;
      }
    }

    return { message: `${users.length} user(s) deleted successfully`, count: users.length };
  }

  // ── Company Activity ────────────────────────────────────────────────────
  async getCompanyActivity(companyId) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    const userCount = await User.count({ where: { company_id: companyId, role: { [Op.ne]: 'platform_admin' } } });
    const activeUsers = await User.count({ where: { company_id: companyId, is_active: true, role: { [Op.ne]: 'platform_admin' } } });

    // Recent logins (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyActive = await User.count({
      where: { company_id: companyId, last_login: { [Op.gte]: thirtyDaysAgo }, role: { [Op.ne]: 'platform_admin' } },
    });

    return {
      company_name: company.name,
      company_code: company.company_code,
      plan: company.plan,
      user_limit: company.user_limit,
      total_users: userCount,
      active_users: activeUsers,
      inactive_users: userCount - activeUsers,
      recently_active: recentlyActive,
      storage_used_mb: company.storage_used_mb || 0,
      subscription_status: company.subscription_status,
      subscription_end_date: company.subscription_end_date,
      last_activity_at: company.last_activity_at,
    };
  }

  async deleteCompany(companyId) {
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error('Company not found');

    // Soft delete company and deactivate all users
    await company.update({ deleted_at: new Date(), is_active: false });
    await User.update({ is_active: false }, { where: { company_id: companyId } });

    return { message: 'Company deleted successfully' };
  }

  // ── Platform Admin User Management ──────────────────────────────────────
  async getPlatformAdmins() {
    return User.findAll({
      where: { role: 'platform_admin' },
      attributes: ['id', 'name', 'email', 'is_active', 'last_login', 'created_at'],
      order: [['created_at', 'ASC']],
    });
  }

  async createPlatformAdmin(data) {
    const { name, email, password } = data;
    if (!email || !password) throw new Error('Email and password are required');

    const existing = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) throw new Error('A user with this email already exists');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name || 'Platform Admin',
      email: email.toLowerCase().trim(),
      password_hash,
      role: 'platform_admin',
      company_id: null,
      is_active: true,
      modules: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics'],
      module_permissions: {
        Quotation:            { read: true, write: true, admin: true },
        'Work Order':         { read: true, write: true, admin: true },
        Production:           { read: true, write: true, admin: true },
        Quality:              { read: true, write: true, admin: true },
        Logistics:            { read: true, write: true, admin: true },
        Settings:             { read: true, write: true, admin: true },
        'Business Analytics': { read: true, write: true, admin: true },
      },
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async deletePlatformAdmin(userId) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    if (user.role !== 'platform_admin') throw new Error('User is not a platform admin');

    // Prevent deleting last platform admin
    const count = await User.count({ where: { role: 'platform_admin' } });
    if (count <= 1) throw new Error('Cannot delete the last platform admin');

    await user.destroy();
    return { message: 'Platform admin deleted' };
  }

  async updatePlatformAdmin(userId, data) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');
    if (user.role !== 'platform_admin') throw new Error('User is not a platform admin');

    const updates = {};
    if (data.name) updates.name = data.name;
    if (data.email) {
      const existing = await User.findOne({ where: { email: data.email.toLowerCase().trim(), id: { [require('sequelize').Op.ne]: userId } } });
      if (existing) throw new Error('A user with this email already exists');
      updates.email = data.email.toLowerCase().trim();
    }
    if (typeof data.is_active === 'boolean') updates.is_active = data.is_active;
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password_hash = await bcrypt.hash(data.password, salt);
    }

    await user.update(updates);
    return { id: user.id, name: user.name, email: user.email, is_active: user.is_active };
  }

  // ── Subscription Check ──────────────────────────────────────────────────
  async checkSubscriptions() {
    const today = new Date().toISOString().split('T')[0];
    
    // Mark expired subscriptions
    const [, expiredMeta] = await Company.sequelize.query(`
      UPDATE companies
      SET subscription_status = 'expired'
      WHERE subscription_end_date < :today
        AND subscription_status = 'active'
        AND deleted_at IS NULL
    `, { replacements: { today } });

    // Find companies expiring within 30 days (for notifications)
    const expiringSoon = await Company.findAll({
      where: {
        deleted_at: null,
        is_active: true,
        subscription_status: 'active',
        subscription_end_date: {
          [Op.between]: [today, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]],
        },
      },
      attributes: ['id', 'name', 'subscription_end_date'],
    });

    if (expiringSoon.length > 0) {
      console.log(`[Subscription] ${expiringSoon.length} companies expiring within 30 days:`);
      expiringSoon.forEach(c => console.log(`  - ${c.name}: expires ${c.subscription_end_date}`));
    }

    return {
      expiredCount: expiredMeta?.rowCount || 0,
      expiringSoon: expiringSoon.map(c => ({ id: c.id, name: c.name, expires: c.subscription_end_date })),
    };
  }

  // ── Roles & Permissions Overview ────────────────────────────────────────
  async getRolesOverview() {
    const companies = await Company.findAll({
      where: { deleted_at: null },
      attributes: ['id', 'name', 'is_active', 'plan', 'created_at'],
      order: [['name', 'ASC']],
    });

    const result = [];
    for (const company of companies) {
      const owner = await User.findOne({
        where: { company_id: company.id, role: 'main_admin' },
        attributes: ['id', 'name', 'email', 'is_active', 'last_login'],
        order: [['created_at', 'ASC']],
      });

      const usersByRole = await User.findAll({
        where: { company_id: company.id, role: { [Op.ne]: 'platform_admin' } },
        attributes: ['id', 'name', 'email', 'role', 'is_active', 'last_login'],
        order: [['role', 'ASC'], ['name', 'ASC']],
      });

      const roleCounts = {};
      for (const u of usersByRole) {
        roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
      }

      result.push({
        company: {
          id: company.id,
          name: company.name,
          is_active: company.is_active,
          plan: company.plan,
        },
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email, is_active: owner.is_active, last_login: owner.last_login } : null,
        role_counts: roleCounts,
        total_users: usersByRole.length,
        users: usersByRole.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active, last_login: u.last_login })),
      });
    }

    const totalCompanies = companies.length;
    const totalOwners = result.filter(r => r.owner).length;
    const totalUsers = result.reduce((sum, r) => sum + r.total_users, 0);

    return { totalCompanies, totalOwners, totalUsers, companies: result };
  }

  // ── Access Control: All Users Across Companies ──────────────────────────
  async getAccessControlUsers(filters = {}) {
    const where = { role: { [Op.ne]: 'platform_admin' } };

    if (filters.company_id) where.company_id = filters.company_id;
    if (filters.role) where.role = filters.role;
    if (filters.is_active !== undefined && filters.is_active !== '') {
      where.is_active = filters.is_active === 'true' || filters.is_active === true;
    }
    if (filters.search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${filters.search}%` } },
        { email: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'company_id', 'company_name', 'last_login', 'created_at', 'phone', 'position', 'department'],
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name', 'plan'], required: false },
      ],
      order: [['created_at', 'DESC']],
    });

    return users;
  }

  // ── Access Control: Company list with owner + user counts ───────────────
  async getAccessControlCompanies() {
    const companies = await Company.findAll({
      where: { deleted_at: null },
      attributes: ['id', 'name', 'company_code', 'email', 'phone', 'is_active', 'plan', 'logo_url', 'created_at'],
      order: [['name', 'ASC']],
    });

    const result = [];
    for (const c of companies) {
      const owner = await User.findOne({
        where: { company_id: c.id, role: 'main_admin' },
        attributes: ['id', 'name', 'email', 'last_login'],
        order: [['created_at', 'ASC']],
      });

      const totalUsers = await User.count({ where: { company_id: c.id, role: { [Op.ne]: 'platform_admin' } } });
      const activeUsers = await User.count({ where: { company_id: c.id, is_active: true, role: { [Op.ne]: 'platform_admin' } } });

      result.push({
        ...c.toJSON(),
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email, last_login: owner.last_login } : null,
        totalUsers,
        activeUsers,
      });
    }

    return result;
  }

  // ── Company Owners ──────────────────────────────────────────────────────
  async getCompanyOwners() {
    const owners = await User.findAll({
      where: { role: 'main_admin', company_id: { [Op.ne]: null } },
      attributes: ['id', 'name', 'email', 'last_login', 'is_active', 'company_id'],
      order: [['created_at', 'ASC']],
    });

    if (owners.length === 0) return [];

    const companyIds = [...new Set(owners.map((o) => o.company_id))];
    const companies = await Company.findAll({
      where: { id: { [Op.in]: companyIds }, deleted_at: null },
      attributes: ['id', 'name', 'company_code', 'plan', 'is_active'],
    });

    const companyById = new Map(companies.map((c) => [c.id, c]));

    return owners.map((o) => {
      const company = companyById.get(o.company_id) || null;
      return {
        id: o.id,
        name: o.name,
        email: o.email,
        last_login: o.last_login,
        is_active: o.is_active,
        company: company ? { id: company.id, name: company.name, company_code: company.company_code, plan: company.plan, is_active: company.is_active } : null,
      };
    });
  }

  // ── Enter Company workspace ─────────────────────────────────────────────
  async enterCompany(companyId) {
    const company = await Company.findByPk(companyId, {
      attributes: ['id', 'name', 'company_code', 'plan', 'is_active', 'subscription_status', 'logo_url'],
    });

    if (!company || company.deleted_at) {
      throw new Error('Company not found');
    }

    if (!company.is_active) {
      throw new Error('Company is inactive');
    }

    const owner = await User.findOne({
      where: { company_id: company.id, role: 'main_admin' },
      attributes: ['id', 'name', 'email', 'is_active'],
      order: [['created_at', 'ASC']],
    });

    if (!owner) {
      throw new Error('No owner found for this company');
    }

    if (!owner.is_active) {
      throw new Error('Company owner account is inactive');
    }

    // Generate an impersonation token for the owner
    const jwt = require('jsonwebtoken');
    let expiresIn = (process.env.JWT_EXPIRES_IN || '7d').trim();
    if (/^\d+$/.test(expiresIn)) expiresIn += 'd';
    const impersonationToken = jwt.sign(
      { userId: owner.id },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    return {
      ...company.toJSON(),
      owner: { id: owner.id, name: owner.name, email: owner.email },
      impersonation_token: impersonationToken,
    };
  }

  // ── Reset user password by platform admin ───────────────────────────────
  async resetUserPassword(userId, newPassword) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);
    await user.update({ password_hash, failed_login_attempts: 0, locked_until: null });

    return { message: 'Password reset successfully', email: user.email };
  }

  // ── Helper: clean up all FK references to users before hard delete ──────
  async _cleanupUserReferences(userIds) {
    if (!userIds || userIds.length === 0) return;

    // Tables that are purely user-owned data — safe to DELETE when user is removed
    const ownDataTables = new Set([
      'activity_timeline', 'login_history', 'sessions', 'api_tokens',
      'team_members', 'team_activities', 'conversation_participants',
    ]);

    // Use pg_constraint (PostgreSQL internal catalog) - most reliable way to find ALL FKs
    const [fkRows] = await sequelize.query(`
      SELECT
        cl.relname    AS table_name,
        att.attname   AS column_name,
        att.attnotnull AS is_not_null
      FROM pg_constraint con
      JOIN pg_class cl  ON con.conrelid  = cl.oid
      JOIN pg_class ref ON con.confrelid = ref.oid
      JOIN pg_namespace ns ON cl.relnamespace = ns.oid
      JOIN pg_attribute att ON att.attrelid = cl.oid
        AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND ref.relname = 'users'
        AND ns.nspname  = 'public'
    `);

    console.log(`[FK Cleanup] Found ${fkRows.length} FK references to users table:`,
      fkRows.map(r => `${r.table_name}.${r.column_name}(notnull=${r.is_not_null})`).join(', '));

    for (const { table_name, column_name, is_not_null } of fkRows) {
      // Skip self-referencing (users.created_by -> users.id)
      if (table_name === 'users') continue;

      try {
        if (ownDataTables.has(table_name)) {
          // User-owned data — delete the rows
          await sequelize.query(`DELETE FROM "${table_name}" WHERE "${column_name}" IN (:userIds)`, {
            replacements: { userIds },
          });
        } else if (is_not_null) {
          // NOT user-owned but column is NOT NULL — make nullable first, then set null
          // (Never delete business data like projects, documents, estimates, etc.)
          await sequelize.query(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" DROP NOT NULL`);
          await sequelize.query(`UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" IN (:userIds)`, {
            replacements: { userIds },
          });
        } else {
          // Nullable — set to NULL
          await sequelize.query(`UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" IN (:userIds)`, {
            replacements: { userIds },
          });
        }
      } catch (e) {
        console.warn(`[FK Cleanup] ${table_name}.${column_name}:`, e.message);
      }
    }
  }

  // ── User Activity Search ─────────────────────────────────────────────────────
  async getUserActivity(numericUserId) {
    // Find user by their generated user_id (the 10-digit numeric ID)
    const user = await User.findOne({
      where: { user_id: String(numericUserId) },
      attributes: ['id', 'name', 'email', 'role', 'user_id', 'company_id', 'last_login', 'created_at'],
    });
    if (!user) throw new Error('User not found with this User ID');

    // Fetch login history
    const loginHistory = await LoginHistory.findAll({
      where: { user_id: user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
      raw: true,
    }).catch(() => []);

    // Fetch audit logs (actions performed by this user)
    const auditLogs = await AuditLog.findAll({
      where: { performed_by: user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
      raw: true,
    }).catch(() => []);

    // Get company name
    let companyName = null;
    if (user.company_id) {
      const company = await Company.findByPk(user.company_id, { attributes: ['name'] });
      companyName = company?.name || null;
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        user_id: user.user_id,
        company: companyName,
        last_login: user.last_login,
        created_at: user.created_at,
      },
      loginHistory,
      auditLogs,
    };
  }
}

module.exports = new PlatformAdminService();
