const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, User, Company, LoginHistory, Session,
  AuditLog, ApprovalWorkflow, CustomRole, RiskScore, ActivityTimeline,
} = require('../models');

class AnalyticsService {
  /**
   * Platform analytics for Super Admin
   */
  async getPlatformAnalytics() {
    const now = new Date();
    const day30Ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const day7Ago = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const day1Ago = new Date(now - 24 * 60 * 60 * 1000);

    // ------ Totals ------
    const [totalCompanies, activeCompanies, totalUsers, activeUsers] = await Promise.all([
      Company.count(),
      Company.count({ where: { is_active: true } }),
      User.count(),
      User.count({ where: { is_active: true } }),
    ]);

    // ------ Login trends (last 30 days, daily) ------
    const loginTrends = await LoginHistory.findAll({
      where: { created_at: { [Op.gte]: day30Ago } },
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', '*'), 'total'],
        [fn('SUM', literal("CASE WHEN status = 'success' THEN 1 ELSE 0 END")), 'success'],
        [fn('SUM', literal("CASE WHEN status = 'failed' THEN 1 ELSE 0 END")), 'failed'],
      ],
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });

    // ------ Active users trend (7 days) ------
    const activeUsersTrend = await LoginHistory.findAll({
      where: { status: 'success', created_at: { [Op.gte]: day7Ago } },
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users'],
      ],
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });

    // ------ Company growth (monthly for last 12 months) ------
    const companyGrowth = await Company.findAll({
      attributes: [
        [fn('DATE_TRUNC', 'month', col('created_at')), 'month'],
        [fn('COUNT', '*'), 'count'],
      ],
      group: [fn('DATE_TRUNC', 'month', col('created_at'))],
      order: [[fn('DATE_TRUNC', 'month', col('created_at')), 'ASC']],
      raw: true,
      limit: 12,
    });

    // ------ Role distribution ------
    const roleDistribution = await User.findAll({
      attributes: ['role', [fn('COUNT', '*'), 'count']],
      group: ['role'],
      raw: true,
    });

    // ------ Plan distribution ------
    const planDistribution = await Company.findAll({
      attributes: ['plan', [fn('COUNT', '*'), 'count']],
      group: ['plan'],
      raw: true,
    });

    // ------ Active sessions now ------
    const activeSessions = await Session.count({
      where: { is_active: true, expires_at: { [Op.gt]: now } },
    });

    // ------ Recent logins 24h ------
    const recentLogins = await LoginHistory.count({
      where: { status: 'success', created_at: { [Op.gte]: day1Ago } },
    });

    // ------ Failed logins 24h ------
    const failedLogins24h = await LoginHistory.count({
      where: { status: 'failed', created_at: { [Op.gte]: day1Ago } },
    });

    // ------ Pending approvals ------
    const pendingApprovals = await ApprovalWorkflow.count({ where: { status: 'pending' } });

    // ------ High risk entities ------
    const highRiskCount = await RiskScore.count({
      where: { level: { [Op.in]: ['high', 'critical'] } },
    });

    // ------ User churn (users deactivated in last 30 days / total) ------
    const churned = await User.count({
      where: { is_active: false, updated_at: { [Op.gte]: day30Ago } },
    });
    const churnRate = totalUsers > 0 ? ((churned / totalUsers) * 100).toFixed(1) : 0;

    return {
      summary: {
        totalCompanies, activeCompanies,
        totalUsers, activeUsers,
        activeSessions, recentLogins, failedLogins24h,
        pendingApprovals, highRiskCount,
        churnRate: parseFloat(churnRate),
      },
      loginTrends,
      activeUsersTrend,
      companyGrowth,
      roleDistribution: roleDistribution.reduce((acc, r) => { acc[r.role] = parseInt(r.count); return acc; }, {}),
      planDistribution: planDistribution.reduce((acc, r) => { acc[r.plan || 'none'] = parseInt(r.count); return acc; }, {}),
    };
  }

  /**
   * Company-level analytics (for Company Admin)
   */
  async getCompanyAnalytics(companyId) {
    const now = new Date();
    const day30Ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const day7Ago = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const companyUsers = await User.findAll({
      where: { company_id: companyId },
      attributes: ['id'],
      raw: true,
    });
    const userIds = companyUsers.map(u => u.id);

    const [totalUsers, activeUsers, company] = await Promise.all([
      User.count({ where: { company_id: companyId } }),
      User.count({ where: { company_id: companyId, is_active: true } }),
      Company.findByPk(companyId),
    ]);

    // Login activity for company users
    const loginTrends = userIds.length ? await LoginHistory.findAll({
      where: { user_id: { [Op.in]: userIds }, created_at: { [Op.gte]: day30Ago } },
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', '*'), 'total'],
        [fn('SUM', literal("CASE WHEN status = 'success' THEN 1 ELSE 0 END")), 'success'],
        [fn('SUM', literal("CASE WHEN status = 'failed' THEN 1 ELSE 0 END")), 'failed'],
      ],
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    }) : [];

    // Role distribution
    const roleDistribution = await User.findAll({
      where: { company_id: companyId },
      attributes: ['role', [fn('COUNT', '*'), 'count']],
      group: ['role'],
      raw: true,
    });

    // Department distribution
    const deptDistribution = await User.findAll({
      where: { company_id: companyId, department: { [Op.not]: null } },
      attributes: ['department', [fn('COUNT', '*'), 'count']],
      group: ['department'],
      raw: true,
    });

    return {
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        userLimit: company?.user_limit || 0,
        plan: company?.plan || 'free',
        storageUsed: company?.storage_used_mb || 0,
      },
      loginTrends,
      roleDistribution: roleDistribution.reduce((acc, r) => { acc[r.role] = parseInt(r.count); return acc; }, {}),
      deptDistribution: deptDistribution.reduce((acc, r) => { acc[r.department] = parseInt(r.count); return acc; }, {}),
    };
  }

  /**
   * Activity timeline for a company
   */
  async getActivityTimeline(companyId, { page = 1, limit = 30 } = {}) {
    const where = {};
    if (companyId) where.company_id = companyId;

    const { count, rows } = await ActivityTimeline.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return { entries: rows, total: count, page, pages: Math.ceil(count / limit) };
  }

  /**
   * Global activity timeline (Super Admin)
   */
  async getGlobalActivityTimeline({ page = 1, limit = 50, action } = {}) {
    const where = {};
    if (action) where.action = action;

    const { count, rows } = await ActivityTimeline.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
        { model: Company, as: 'company', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return { entries: rows, total: count, page, pages: Math.ceil(count / limit) };
  }
}

module.exports = new AnalyticsService();
