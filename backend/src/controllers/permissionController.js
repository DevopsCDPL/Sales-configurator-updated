const permissionService = require('../services/permissionService');

class PermissionController {
  /**
   * GET /permissions/definitions - Get permission key definitions (metadata)
   */
  async getDefinitions(req, res, next) {
    try {
      const definitions = permissionService.getPermissionDefinitions();
      res.json({ success: true, data: definitions });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /permissions - Get all permissions for all roles
   */
  async getAll(req, res, next) {
    try {
      const permissions = await permissionService.getAll();
      res.json({ success: true, data: permissions });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /permissions/:role - Get permissions for a specific role
   */
  async getByRole(req, res, next) {
    try {
      const permissions = await permissionService.getByRole(req.params.role);
      res.json({ success: true, data: permissions });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /permissions/:role - Update a single permission for a role
   */
  async updatePermission(req, res, next) {
    try {
      const { permission_key, enabled } = req.body;
      const perm = await permissionService.updatePermission(
        req.params.role,
        permission_key,
        enabled,
        req.user
      );
      res.json({ success: true, data: perm });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /permissions/:role/bulk - Bulk update permissions for a role
   */
  async bulkUpdate(req, res, next) {
    try {
      const result = await permissionService.bulkUpdate(
        req.params.role,
        req.body.permissions,
        req.user
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /permissions/seed - Seed default permissions
   */
  async seed(req, res, next) {
    try {
      await permissionService.seedDefaults();
      res.json({ success: true, message: 'Default permissions seeded' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PermissionController();
