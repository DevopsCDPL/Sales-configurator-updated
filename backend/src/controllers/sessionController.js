const sessionService = require('../services/sessionService');

const sessionController = {
  // GET /sessions/me --- current user's sessions
  async getMySessions(req, res) {
    try {
      const sessions = await sessionService.getUserSessions(req.user.id);
      res.json({ success: true, data: sessions });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /sessions --- all active sessions (admin)
  async getAllSessions(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const companyId = req.user.role === 'admin' ? req.user.company_id : req.query.company_id;
      const result = await sessionService.getAllActiveSessions({
        companyId: companyId || null,
        page: parseInt(page),
        limit: parseInt(limit),
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // POST /sessions/:id/revoke --- revoke a specific session
  async revokeSession(req, res) {
    try {
      const session = await sessionService.revokeSession(req.params.id, req.user.id);
      res.json({ success: true, data: session, message: 'Session revoked' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  // POST /sessions/revoke-all/:userId --- revoke all sessions for a user
  async revokeAllUserSessions(req, res) {
    try {
      const result = await sessionService.revokeAllUserSessions(req.params.userId, req.user.id);
      res.json({ success: true, data: result, message: 'All sessions revoked' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  // POST /sessions/cleanup --- cleanup expired sessions
  async cleanup(req, res) {
    try {
      const result = await sessionService.cleanupExpiredSessions();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // GET /sessions/suspicious/:userId --- check for suspicious activity
  async checkSuspicious(req, res) {
    try {
      const result = await sessionService.detectSuspiciousActivity(req.params.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

module.exports = sessionController;
