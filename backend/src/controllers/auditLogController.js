const auditLogService = require('../services/auditLogService');

class AuditLogController {
  async getAll(req, res, next) {
    try {
      const result = await auditLogService.getAll(req.query, req.user);
      res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditLogController();
