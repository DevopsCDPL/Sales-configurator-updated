const { Op } = require('sequelize');
const { CustomRole, User, Company, AuditLog, ActivityTimeline } = require('../models');

const DEFAULT_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'];
const DEFAULT_MODULES = ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'];

class CustomRoleService {
  /**
   * Get all custom roles (scoped by company)
   */
  async getAll(requestingUser) {
    const where = {};
    if (requestingUser.role === 'admin') {
      where[Op.or] = [{ company_id: requestingUser.company_id }, { is_system: true }];
    } else if (requestingUser.role === 'user') {
      where[Op.or] = [{ company_id: requestingUser.company_id }, { is_system: true }];
    }
    // main_admin sees all

    const roles = await CustomRole.findAll({
      where,
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['priority', 'DESC'], ['name', 'ASC']],
    });

    return roles;
  }

  /**
   * Get a single custom role
   */
  async getById(id) {
    const role = await CustomRole.findByPk(id, {
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    if (!role) throw new Error('Custom role not found');
    return role;
  }

  /**
   * Create a custom role
   */
  async create(data, requestingUser) {
    // Ensure permissions structure
    const permissions = data.permissions || {};
    DEFAULT_MODULES.forEach(mod => {
      if (!permissions[mod]) {
        permissions[mod] = {};
        DEFAULT_ACTIONS.forEach(act => { permissions[mod][act] = false; });
      }
    });

    const role = await CustomRole.create({
      name: data.name,
      description: data.description,
      company_id: data.company_id || requestingUser.company_id,
      is_system: requestingUser.role === 'main_admin' ? (data.is_system || false) : false,
      base_role: data.base_role || 'user',
      permissions,
      conditions: data.conditions || [],
      color: data.color || '#6b7280',
      icon: data.icon,
      priority: data.priority || 0,
      created_by: requestingUser.id,
    });

    await AuditLog.create({
      action: 'custom_role_created',
      entity_type: 'custom_role',
      entity_id: role.id,
      entity_name: role.name,
      performed_by: requestingUser.id,
      details: { permissions: Object.keys(permissions) },
      company_id: role.company_id,
    });

    await ActivityTimeline.create({
      company_id: role.company_id,
      user_id: requestingUser.id,
      action: 'role_created',
      description: `Custom role "${role.name}" created`,
      severity: 'info',
      metadata: { role_id: role.id },
    });

    return role;
  }

  /**
   * Update a custom role
   */
  async update(id, data, requestingUser) {
    const role = await CustomRole.findByPk(id);
    if (!role) throw new Error('Custom role not found');
    if (role.is_system && requestingUser.role !== 'main_admin') {
      throw new Error('Only Super Admin can modify system roles');
    }

    const updateFields = {};
    ['name', 'description', 'permissions', 'conditions', 'color', 'icon', 'priority', 'base_role'].forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f];
    });
    if (requestingUser.role === 'main_admin' && data.is_system !== undefined) {
      updateFields.is_system = data.is_system;
    }

    await role.update(updateFields);

    await AuditLog.create({
      action: 'custom_role_updated',
      entity_type: 'custom_role',
      entity_id: role.id,
      entity_name: role.name,
      performed_by: requestingUser.id,
      details: { updated_fields: Object.keys(updateFields) },
      company_id: role.company_id,
    });

    return role;
  }

  /**
   * Delete a custom role
   */
  async delete(id, requestingUser) {
    const role = await CustomRole.findByPk(id);
    if (!role) throw new Error('Custom role not found');
    if (role.is_system) throw new Error('Cannot delete system roles');

    // Unassign users from this role
    await User.update({ custom_role_id: null }, { where: { custom_role_id: id } });

    const roleName = role.name;
    await role.destroy();

    await AuditLog.create({
      action: 'custom_role_deleted',
      entity_type: 'custom_role',
      entity_id: id,
      entity_name: roleName,
      performed_by: requestingUser.id,
      company_id: requestingUser.company_id,
    });

    return { deleted: true };
  }

  /**
   * Clone a custom role
   */
  async clone(id, newName, requestingUser) {
    const source = await CustomRole.findByPk(id);
    if (!source) throw new Error('Source role not found');

    const cloned = await CustomRole.create({
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      company_id: requestingUser.role === 'main_admin' ? source.company_id : requestingUser.company_id,
      is_system: false,
      base_role: source.base_role,
      permissions: source.permissions,
      conditions: source.conditions,
      color: source.color,
      icon: source.icon,
      priority: source.priority,
      created_by: requestingUser.id,
    });

    return cloned;
  }

  /**
   * Assign a custom role to a user
   */
  async assignToUser(roleId, userId, requestingUser) {
    const role = await CustomRole.findByPk(roleId);
    if (!role) throw new Error('Custom role not found');

    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    await user.update({ custom_role_id: roleId, module_permissions: role.permissions });

    await ActivityTimeline.create({
      company_id: user.company_id,
      user_id: requestingUser.id,
      action: 'role_assigned',
      description: `Role "${role.name}" assigned to ${user.name}`,
      severity: 'info',
      metadata: { role_id: roleId, user_id: userId },
    });

    return user;
  }

  /**
   * Get available permission actions and modules
   */
  getPermissionSchema() {
    return { modules: DEFAULT_MODULES, actions: DEFAULT_ACTIONS };
  }
}

module.exports = new CustomRoleService();
