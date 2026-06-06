const { Op, fn, col, literal } = require('sequelize');
const { RiskScore, User, Company, LoginHistory, Session, AuditLog, sequelize } = require('../models');

class RiskService {
  /**
   * Calculate risk score for a company
   */
  async calculateCompanyRisk(companyId) {
    const factors = [];
    let totalScore = 0;

    // 1. Failed logins in last 24h
    const failedLogins = await LoginHistory.count({
      where: {
        status: 'failed',
        created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: [{ model: User, as: 'user', where: { company_id: companyId }, attributes: [] }],
    });
    if (failedLogins > 10) {
      const weight = Math.min(30, failedLogins * 2);
      factors.push({ factor: 'failed_logins', weight, detail: `${failedLogins} failed logins in 24h` });
      totalScore += weight;
    }

    // 2. Inactive users ratio
    const totalUsers = await User.count({ where: { company_id: companyId } });
    const inactiveUsers = await User.count({ where: { company_id: companyId, is_active: false } });
    if (totalUsers > 0) {
      const ratio = inactiveUsers / totalUsers;
      if (ratio > 0.5) {
        const weight = Math.round(ratio * 20);
        factors.push({ factor: 'high_inactive_ratio', weight, detail: `${inactiveUsers}/${totalUsers} users inactive` });
        totalScore += weight;
      }
    }

    // 3. Locked accounts
    const lockedUsers = await User.count({
      where: { company_id: companyId, locked_until: { [Op.gt]: new Date() } },
    });
    if (lockedUsers > 0) {
      const weight = lockedUsers * 10;
      factors.push({ factor: 'locked_accounts', weight: Math.min(weight, 25), detail: `${lockedUsers} accounts currently locked` });
      totalScore += Math.min(weight, 25);
    }

    // 4. No admin activity in 30 days
    const company = await Company.findByPk(companyId);
    if (company?.last_activity_at) {
      const daysSince = (Date.now() - new Date(company.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 30) {
        factors.push({ factor: 'admin_inactivity', weight: 15, detail: `No admin activity for ${Math.round(daysSince)} days` });
        totalScore += 15;
      }
    }

    // 5. Mass data operations (many audit logs for exports/deletes in 24h)
    const massOpsWhere = {
      action: { [Op.iLike]: '%export%' },
      created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    };
    if (companyId) massOpsWhere.company_id = companyId;
    const massOps = await AuditLog.count({ where: massOpsWhere });
    if (massOps > 20) {
      factors.push({ factor: 'mass_data_operations', weight: 20, detail: `${massOps} export operations in 24h` });
      totalScore += 20;
    }

    // Clamp to 100
    totalScore = Math.min(totalScore, 100);
    const level = totalScore >= 75 ? 'critical' : totalScore >= 50 ? 'high' : totalScore >= 25 ? 'medium' : 'low';

    // Upsert risk score
    const [riskScore] = await RiskScore.findOrCreate({
      where: { entity_type: 'company', entity_id: companyId },
      defaults: { score: totalScore, level, factors, last_calculated_at: new Date(), company_id: companyId },
    });

    if (riskScore) {
      await riskScore.update({ score: totalScore, level, factors, last_calculated_at: new Date(), company_id: companyId });
    }

    return { score: totalScore, level, factors };
  }

  /**
   * Calculate risk for a user
   */
  async calculateUserRisk(userId) {
    const factors = [];
    let totalScore = 0;

    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    // 1. Failed login attempts
    if (user.failed_login_attempts > 3) {
      const weight = Math.min(30, user.failed_login_attempts * 5);
      factors.push({ factor: 'failed_logins', weight, detail: `${user.failed_login_attempts} failed attempts` });
      totalScore += weight;
    }

    // 2. Account locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      factors.push({ factor: 'account_locked', weight: 20, detail: 'Account is currently locked' });
      totalScore += 20;
    }

    // 3. Multiple active sessions
    const activeSessions = await Session.count({
      where: { user_id: userId, is_active: true, expires_at: { [Op.gt]: new Date() } },
    });
    if (activeSessions > 5) {
      factors.push({ factor: 'many_sessions', weight: 15, detail: `${activeSessions} active sessions` });
      totalScore += 15;
    }

    // 4. No 2FA enabled (for admins)
    if (['main_admin', 'admin'].includes(user.role) && !user.two_factor_enabled) {
      factors.push({ factor: 'no_2fa', weight: 10, detail: 'Admin without 2FA' });
      totalScore += 10;
    }

    // 5. No recent login (inactive >60 days)
    if (user.last_login) {
      const daysSince = (Date.now() - new Date(user.last_login).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 60) {
        factors.push({ factor: 'long_inactive', weight: 15, detail: `No login for ${Math.round(daysSince)} days` });
        totalScore += 15;
      }
    }

    totalScore = Math.min(totalScore, 100);
    const level = totalScore >= 75 ? 'critical' : totalScore >= 50 ? 'high' : totalScore >= 25 ? 'medium' : 'low';

    const [riskScore] = await RiskScore.findOrCreate({
      where: { entity_type: 'user', entity_id: userId },
      defaults: { score: totalScore, level, factors, last_calculated_at: new Date(), company_id: user.company_id },
    });

    if (riskScore) {
      await riskScore.update({ score: totalScore, level, factors, last_calculated_at: new Date(), company_id: user.company_id });
    }

    return { score: totalScore, level, factors };
  }

  /**
   * Get all risk scores (for dashboard)
   */
  async getAllRiskScores({ entityType, minScore = 0, page = 1, limit = 20, companyId } = {}) {
    const where = {};
    if (entityType) where.entity_type = entityType;
    if (minScore > 0) where.score = { [Op.gte]: minScore };
    if (companyId) where.company_id = companyId;

    const { count, rows } = await RiskScore.findAndCountAll({
      where,
      order: [['score', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return { scores: rows, total: count, page, pages: Math.ceil(count / limit) };
  }

  /**
   * Recalculate all company risks
   */
  async recalculateAll() {
    const companies = await Company.findAll({ where: { is_active: true }, attributes: ['id'] });
    const results = [];
    for (const company of companies) {
      try {
        const risk = await this.calculateCompanyRisk(company.id);
        results.push({ company_id: company.id, ...risk });
      } catch (e) {
        results.push({ company_id: company.id, error: e.message });
      }
    }
    return results;
  }

  /**
   * Get risk alerts (high/critical scores)
   */
  async getAlerts(companyId) {
    const where = { level: { [Op.in]: ['high', 'critical'] } };
    if (companyId) where.company_id = companyId;
    const alerts = await RiskScore.findAll({
      where,
      order: [['score', 'DESC']],
      limit: 50,
    });
    return alerts;
  }
}

module.exports = new RiskService();
