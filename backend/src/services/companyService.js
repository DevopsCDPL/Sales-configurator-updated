const { Company, User, AuditLog, LoginHistory } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const auditLogService = require('./auditLogService');

class CompanyService {
  // --------- CRUD ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getAll(requestingUser) {
    const where = { deleted_at: null };
    if (requestingUser.role === 'admin') where.id = requestingUser.company_id;
    else if (requestingUser.role === 'user') where.id = requestingUser.company_id;

    const companies = await Company.findAll({
      where,
      attributes: {
        include: [
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id)'), 'user_count'],
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id AND users.role = \'admin\')'), 'admin_count'],
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id AND users.is_active = true)'), 'active_user_count'],
        ]
      },
      order: [['created_at', 'DESC']]
    });
    return companies;
  }

  async getById(id, requestingUser) {
    const company = await Company.findByPk(id, {
      include: [{
        model: User, as: 'users',
        attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'last_login', 'department', 'tags']
      }]
    });
    if (!company) throw new Error('Company not found');
    // Authorization: only platform_admin or users belonging to this company
    if (requestingUser && requestingUser.role !== 'platform_admin' && requestingUser.company_id !== id) {
      throw new Error('Access denied: you can only view your own company');
    }
    return company;
  }

  async create(data, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can create companies');
    const existing = await Company.findOne({ where: { name: data.name } });
    if (existing) throw new Error('A company with this name already exists');

    const company = await Company.create({
      name: data.name,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      tax_id: data.tax_id || null,
      logo_url: data.logo_url || null,
      logo_data: data.logo_data || null,
      user_limit: data.user_limit || 50,
      plan: data.plan || 'starter',
      created_by: requestingUser.id
    });

    auditLogService.log({
      action: 'company_created', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role,
      details: { plan: company.plan, user_limit: company.user_limit },
      company_id: company.id
    });
    return company;
  }

  async update(id, data, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can update companies');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');
    if (data.name && data.name !== company.name) {
      const dup = await Company.findOne({ where: { name: data.name } });
      if (dup) throw new Error('A company with this name already exists');
    }

    const allowedFields = ['name', 'address', 'phone', 'email', 'website', 'tax_id', 'is_active', 'user_limit', 'plan', 'settings', 'ip_whitelist', 'logo_url', 'logo_data'];
    const updates = {};
    allowedFields.forEach(f => { if (data[f] !== undefined) updates[f] = data[f]; });
    await company.update(updates);

    auditLogService.log({
      action: 'company_updated', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { fields: Object.keys(updates) },
      company_id: company.id
    });
    return company;
  }

  async delete(id, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can delete companies');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');
    // Soft delete - move to recycle bin
    await company.update({ deleted_at: new Date(), deleted_by: requestingUser.id });

    auditLogService.log({
      action: 'company_deleted', entity_type: 'company',
      entity_id: id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: id
    });
    return { message: 'Company moved to recycle bin' };
  }

  // --------- Enterprise Actions ------------------------------------------------------------------------------------------------------------------------------------------------------------

  async suspend(id, reason, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can suspend companies');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');
    if (company.suspended_at) throw new Error('Company is already suspended');

    await company.update({ suspended_at: new Date(), suspension_reason: reason || 'Suspended by administrator', is_active: false });
    await User.update({ is_active: false }, { where: { company_id: id } });

    auditLogService.log({
      action: 'company_suspended', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { reason },
      company_id: company.id
    });
    return company;
  }

  async reactivate(id, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can reactivate companies');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');

    await company.update({ suspended_at: null, suspension_reason: null, is_active: true });
    await User.update({ is_active: true }, { where: { company_id: id, role: 'admin' } });

    auditLogService.log({
      action: 'company_reactivated', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: company.id
    });
    return company;
  }

  async changePlan(id, newPlan, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can change company plans');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');

    const oldPlan = company.plan;
    const planLimits = { free: 5, starter: 50, professional: 200, enterprise: 10000 };
    const newLimit = planLimits[newPlan] || 50;
    await company.update({ plan: newPlan, user_limit: newLimit });

    auditLogService.log({
      action: 'company_plan_changed', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { from: oldPlan, to: newPlan, new_limit: newLimit },
      company_id: company.id
    });
    return company;
  }

  async resetUserLimit(id, newLimit, requestingUser) {
    if (requestingUser.role !== 'main_admin') throw new Error('Only Main Admin can reset user limits');
    const company = await Company.findByPk(id);
    if (!company) throw new Error('Company not found');
    const oldLimit = company.user_limit;
    await company.update({ user_limit: newLimit });

    auditLogService.log({
      action: 'company_updated', entity_type: 'company',
      entity_id: company.id, entity_name: company.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { field: 'user_limit', from: oldLimit, to: newLimit },
      company_id: company.id
    });
    return company;
  }

  // --------- Stats (role-aware) ------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getStats(requestingUser) {
    if (requestingUser.role === 'main_admin') {
      return this._mainAdminStats();
    } else if (requestingUser.role === 'admin') {
      return this._adminStats(requestingUser);
    } else {
      return this._userStats(requestingUser);
    }
  }

  async _mainAdminStats() {
    const totalCompanies = await Company.count();
    const activeCompanies = await Company.count({ where: { is_active: true, suspended_at: null } });
    const suspendedCompanies = await Company.count({ where: { suspended_at: { [Op.not]: null } } });
    const totalAdmins = await User.count({ where: { role: 'admin' } });
    const totalActiveUsers = await User.count({ where: { is_active: true } });
    const totalUsers = await User.count();
    const totalInactiveUsers = await User.count({ where: { is_active: false } });
    const pendingInvitations = await User.count({ where: { invite_status: 'pending' } }).catch(() => 0);
    const suspendedAccounts = await User.count({ where: { is_active: false, locked_until: { [Op.not]: null } } }).catch(() => 0);

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const recentLogins = await LoginHistory.count({ where: { status: 'success', created_at: { [Op.gte]: weekAgo } } }).catch(() => 0);
    const failedLogins = await LoginHistory.count({ where: { status: 'failed', created_at: { [Op.gte]: weekAgo } } }).catch(() => 0);

    const capacityRes = await Company.findAll({ attributes: [[fn('SUM', col('user_limit')), 'total_capacity']] });
    const totalCapacity = parseInt(capacityRes[0]?.dataValues?.total_capacity) || 0;

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const inactiveCompanyCount = await Company.count({
      where: { is_active: true, [Op.or]: [{ last_activity_at: { [Op.lt]: thirtyDaysAgo } }, { last_activity_at: null }] }
    });

    // Per-company data
    const companiesData = await Company.findAll({
      attributes: {
        include: [
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id)'), 'user_count'],
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id AND users.role = \'admin\')'), 'admin_count'],
          [literal('(SELECT COUNT(*) FROM users WHERE users.company_id = "Company".id AND users.is_active = true)'), 'active_user_count'],
        ]
      },
      order: [['created_at', 'DESC']]
    });

    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id', 'name', 'email', 'company_id', 'is_active'] });
    const adminMap = {};
    admins.forEach(a => { if (!adminMap[a.company_id]) adminMap[a.company_id] = a; });

    const companiesMapped = companiesData.map(c => {
      const uc = parseInt(c.dataValues.user_count) || 0;
      const flags = [...(c.risk_flags || [])];
      if (uc >= c.user_limit) flags.push('user_limit_reached');
      if (c.is_active && (!c.last_activity_at || new Date(c.last_activity_at) < thirtyDaysAgo)) flags.push('inactive_30_days');
      if (c.suspended_at) flags.push('suspended');
      return {
        id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address,
        is_active: c.is_active, user_limit: c.user_limit, plan: c.plan || 'starter',
        logo_url: c.logo_url || null, logo_data: c.logo_data || null,
        suspended_at: c.suspended_at, suspension_reason: c.suspension_reason,
        storage_used_mb: c.storage_used_mb || 0, last_activity_at: c.last_activity_at,
        user_count: uc, admin_count: parseInt(c.dataValues.admin_count) || 0,
        active_user_count: parseInt(c.dataValues.active_user_count) || 0,
        admin: adminMap[c.id] ? { id: adminMap[c.id].id, name: adminMap[c.id].name } : null,
        risk_flags: [...new Set(flags)], created_at: c.created_at,
      };
    });

    return {
      role: 'main_admin',
      summary: {
        totalCompanies, activeCompanies, suspendedCompanies, totalAdmins,
        totalActiveUsers, totalInactiveUsers, totalUsers, totalCapacity,
        pendingInvitations, suspendedAccounts, recentLogins, failedLogins,
        inactiveCompanies: inactiveCompanyCount,
      },
      companies: companiesMapped,
    };
  }

  async _adminStats(requestingUser) {
    const companyId = requestingUser.company_id;
    const company = companyId ? await Company.findByPk(companyId) : null;
    const where = companyId ? { company_id: companyId } : { created_by: requestingUser.id };

    const totalUsers = await User.count({ where });
    const activeUsers = await User.count({ where: { ...where, is_active: true } });
    const inactiveUsers = totalUsers - activeUsers;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const createdToday = await User.count({ where: { ...where, created_at: { [Op.gte]: todayStart } } });
    const pendingInvites = await User.count({ where: { ...where, invite_status: 'pending' } }).catch(() => 0);

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const userIds = (await User.findAll({ where, attributes: ['id'], raw: true })).map(u => u.id);
    const weeklyLogins = userIds.length ? await LoginHistory.count({
      where: { user_id: { [Op.in]: userIds }, status: 'success', created_at: { [Op.gte]: weekAgo } }
    }).catch(() => 0) : 0;
    const dailyActive = userIds.length ? await LoginHistory.count({
      distinct: true, col: 'user_id',
      where: { user_id: { [Op.in]: userIds }, status: 'success', created_at: { [Op.gte]: todayStart } }
    }).catch(() => 0) : 0;

    const roleDistribution = await User.findAll({
      where, attributes: ['role', [fn('COUNT', col('id')), 'count']], group: ['role'], raw: true
    });

    // Department distribution
    const deptDistribution = await User.findAll({
      where: { ...where, department: { [Op.not]: null } },
      attributes: ['department', [fn('COUNT', col('id')), 'count']],
      group: ['department'], raw: true
    }).catch(() => []);

    const users = await User.findAll({
      where: { [Op.or]: [{ id: requestingUser.id }, { created_by: requestingUser.id }] },
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'created_by', 'last_login', 'department', 'tags'],
      order: [['created_at', 'DESC']]
    });

    return {
      role: 'admin',
      company: company ? { id: company.id, name: company.name, user_limit: company.user_limit, plan: company.plan } : null,
      summary: {
        totalUsers, activeUsers, inactiveUsers,
        userLimit: company?.user_limit || 50,
        remainingSlots: (company?.user_limit || 50) - totalUsers,
        createdToday, pendingInvites, weeklyLogins, dailyActive,
        roleDistribution: roleDistribution.reduce((a, r) => { a[r.role] = parseInt(r.count); return a; }, {}),
        deptDistribution: deptDistribution.reduce((a, d) => { a[d.department] = parseInt(d.count); return a; }, {}),
      },
      users: users.map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        is_active: u.is_active, created_at: u.created_at, last_login: u.last_login,
        department: u.department, tags: u.tags,
      }))
    };
  }

  async _userStats(requestingUser) {
    const me = await User.findByPk(requestingUser.id, {
      attributes: ['id', 'name', 'email', 'role', 'is_active', 'company_name', 'company_id',
        'created_at', 'modules', 'module_permissions', 'two_factor_enabled', 'last_login',
        'department', 'tags', 'failed_login_attempts'],
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name', 'role'], required: false }
      ]
    });

    const loginHistory = await LoginHistory.findAll({
      where: { user_id: requestingUser.id },
      order: [['created_at', 'DESC']],
      limit: 10, raw: true
    }).catch(() => []);

    return { role: 'user', user: me, loginHistory };
  }
}

module.exports = new CompanyService();
