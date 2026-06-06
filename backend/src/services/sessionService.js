const crypto = require('crypto');
const { Op } = require('sequelize');
const { Session, User, AuditLog, ActivityTimeline } = require('../models');

class SessionService {
  /**
   * Create a session record when a user logs in
   */
  async createSession(userId, accessToken, refreshToken, reqInfo = {}) {
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days (refresh token lifetime)

    const session = await Session.create({
      user_id: userId,
      token_hash: tokenHash,
      refresh_token_hash: refreshTokenHash,
      ip_address: reqInfo.ip || null,
      user_agent: reqInfo.userAgent || null,
      device: reqInfo.device || 'desktop',
      location: reqInfo.location || null,
      is_active: true,
      expires_at: expiresAt,
      last_activity_at: new Date(),
    });

    return session;
  }

  /**
   * Touch session (update last_activity_at)
   */
  async touchSession(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await Session.update(
      { last_activity_at: new Date() },
      { where: { token_hash: tokenHash, is_active: true } }
    );
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId) {
    const sessions = await Session.findAll({
      where: {
        user_id: userId,
        is_active: true,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['last_activity_at', 'DESC']],
      attributes: ['id', 'ip_address', 'user_agent', 'device', 'location', 'last_activity_at', 'created_at', 'expires_at'],
    });
    return sessions;
  }

  /**
   * Get all active sessions (admin view)
   */
  async getAllActiveSessions({ companyId, page = 1, limit = 20 } = {}) {
    const where = { is_active: true, expires_at: { [Op.gt]: new Date() } };
    const include = [{
      model: User, as: 'user',
      attributes: ['id', 'name', 'email', 'role', 'company_id', 'company_name'],
      ...(companyId ? { where: { company_id: companyId } } : {}),
    }];

    const { count, rows } = await Session.findAndCountAll({
      where, include,
      order: [['last_activity_at', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return { sessions: rows, total: count, page, pages: Math.ceil(count / limit) };
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId, revokedById) {
    const session = await Session.findByPk(sessionId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    });
    if (!session) throw new Error('Session not found');

    await session.update({ is_active: false, revoked_at: new Date(), revoked_by: revokedById });

    // Log activity
    await ActivityTimeline.create({
      company_id: session.user?.company_id,
      user_id: revokedById,
      action: 'session_revoked',
      description: `Session revoked for ${session.user?.name || 'unknown'} (IP: ${session.ip_address})`,
      severity: 'warning',
      metadata: { session_id: sessionId, target_user: session.user_id },
    });

    return session;
  }

  /**
   * Revoke ALL sessions for a user (force logout)
   */
  async revokeAllUserSessions(userId, revokedById) {
    const count = await Session.update(
      { is_active: false, revoked_at: new Date(), revoked_by: revokedById },
      { where: { user_id: userId, is_active: true } }
    );

    await ActivityTimeline.create({
      user_id: revokedById,
      action: 'all_sessions_revoked',
      description: `All active sessions revoked for user ${userId}`,
      severity: 'warning',
      metadata: { target_user: userId, count: count[0] },
    });

    return { revoked: count[0] };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const count = await Session.update(
      { is_active: false },
      { where: { is_active: true, expires_at: { [Op.lt]: new Date() } } }
    );
    return { cleaned: count[0] };
  }

  /**
   * Detect suspicious activity (multiple active sessions from different IPs)
   */
  async detectSuspiciousActivity(userId) {
    const activeSessions = await Session.findAll({
      where: { user_id: userId, is_active: true, expires_at: { [Op.gt]: new Date() } },
      attributes: ['ip_address', 'device', 'location'],
    });

    const uniqueIPs = new Set(activeSessions.map(s => s.ip_address).filter(Boolean));
    const flags = [];

    if (uniqueIPs.size > 3) {
      flags.push({ type: 'multiple_ips', detail: `${uniqueIPs.size} different IPs active simultaneously` });
    }

    return { suspicious: flags.length > 0, flags, activeCount: activeSessions.length, uniqueIPs: uniqueIPs.size };
  }
}

module.exports = new SessionService();
