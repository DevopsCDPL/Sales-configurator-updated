const { AuditLog, User } = require('../models');
const { Op } = require('sequelize');

class AuditLogService {
  /**
   * Create an audit log entry.
   */
  async log({ action, entity_type = 'user', entity_id, entity_name, performed_by, performer_name, performer_role, details, ip_address, company_id }) {
    try {
      return await AuditLog.create({
        action,
        entity_type,
        entity_id,
        entity_name,
        performed_by,
        performer_name,
        performer_role,
        details,
        ip_address,
        company_id
      });
    } catch (err) {
      console.error('Audit log failed:', err.message);
      // Don't throw --- audit logging should not break operations
    }
  }

  /**
   * Get audit logs with filtering and pagination.
   * main_admin: sees all logs
   * admin: sees logs performed by self or affecting their created users
   */
  async getAll(query, requestingUser) {
    const { page = 1, limit = 25, action, entity_type, search, from, to } = query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Tenant-level scoping: non-platform_admin users only see their company's logs
    if (requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
      where.company_id = requestingUser.company_id;
    }

    // Role-based filtering (within the company scope)
    if (requestingUser.role === 'admin') {
      where[Op.or] = [
        { performed_by: requestingUser.id },
        { entity_id: requestingUser.id }
      ];
    } else if (requestingUser.role === 'user') {
      where[Op.or] = [
        { performed_by: requestingUser.id },
        { entity_id: requestingUser.id }
      ];
    }

    // Optional filters
    if (action) where.action = action;
    if (entity_type) where.entity_type = entity_type;
    if (search) {
      where[Op.or] = [
        ...(where[Op.or] || []),
        { entity_name: { [Op.iLike]: `%${search}%` } },
        { performer_name: { [Op.iLike]: `%${search}%` } }
      ];
      // If we had role-based OR already, wrap with AND
      if (requestingUser.role !== 'main_admin') {
        const roleFilter = requestingUser.role === 'admin'
          ? { [Op.or]: [{ performed_by: requestingUser.id }, { entity_id: requestingUser.id }] }
          : { [Op.or]: [{ performed_by: requestingUser.id }, { entity_id: requestingUser.id }] };
        const searchFilter = {
          [Op.or]: [
            { entity_name: { [Op.iLike]: `%${search}%` } },
            { performer_name: { [Op.iLike]: `%${search}%` } }
          ]
        };
        delete where[Op.or];
        where[Op.and] = [roleFilter, searchFilter];
      }
    }

    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    return {
      logs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / parseInt(limit))
      }
    };
  }
}

module.exports = new AuditLogService();
