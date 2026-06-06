const { PermissionTemplate, User } = require('../models');
const auditLogService = require('./auditLogService');

class PermissionTemplateService {
  async getAll(requestingUser) {
    const where = {};
    if (requestingUser.role === 'admin') {
      // Admin sees global templates + their company's templates
      const { Op } = require('sequelize');
      where[Op.or] = [{ is_global: true }, { company_id: requestingUser.company_id }];
    } else if (requestingUser.role === 'user') {
      // Users see global + their company templates (read-only)
      const { Op } = require('sequelize');
      where[Op.or] = [{ is_global: true }, { company_id: requestingUser.company_id }];
    }
    // main_admin sees all

    return PermissionTemplate.findAll({
      where,
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']]
    });
  }

  async getById(id, requestingUser) {
    const template = await PermissionTemplate.findByPk(id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
    });
    if (!template) throw new Error('Permission template not found');
    // Authorization: must be global, belong to user's company, or user is platform_admin/main_admin
    if (requestingUser && requestingUser.role !== 'platform_admin' && requestingUser.role !== 'main_admin') {
      if (!template.is_global && template.company_id && template.company_id !== requestingUser.company_id) {
        throw new Error('Access denied: cannot view templates from another company');
      }
    }
    return template;
  }

  async create(data, requestingUser) {
    if (!['main_admin', 'admin'].includes(requestingUser.role)) {
      throw new Error('Insufficient permissions');
    }

    const template = await PermissionTemplate.create({
      name: data.name,
      description: data.description || null,
      permissions: data.permissions || {},
      company_id: requestingUser.role === 'admin' ? requestingUser.company_id : data.company_id || null,
      created_by: requestingUser.id,
      is_global: requestingUser.role === 'main_admin' && data.is_global ? true : false,
    });

    auditLogService.log({
      action: 'permission_template_created', entity_type: 'permission_template',
      entity_id: template.id, entity_name: template.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { is_global: template.is_global },
      company_id: template.company_id
    });
    return template;
  }

  async update(id, data, requestingUser) {
    const template = await PermissionTemplate.findByPk(id);
    if (!template) throw new Error('Permission template not found');

    // Only main_admin can edit global templates
    if (template.is_global && requestingUser.role !== 'main_admin') {
      throw new Error('Only Main Admin can edit global templates');
    }
    // Admin can only edit their company's templates
    if (requestingUser.role === 'admin' && template.company_id !== requestingUser.company_id) {
      throw new Error('Cannot edit templates from other companies');
    }

    const allowed = ['name', 'description', 'permissions', 'is_global'];
    const updates = {};
    allowed.forEach(f => { if (data[f] !== undefined) updates[f] = data[f]; });
    if (requestingUser.role !== 'main_admin') delete updates.is_global;

    await template.update(updates);

    auditLogService.log({
      action: 'permission_template_updated', entity_type: 'permission_template',
      entity_id: template.id, entity_name: template.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { fields: Object.keys(updates) },
      company_id: template.company_id
    });
    return template;
  }

  async clone(id, newName, requestingUser) {
    const source = await PermissionTemplate.findByPk(id);
    if (!source) throw new Error('Source template not found');

    const clone = await PermissionTemplate.create({
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      permissions: source.permissions,
      company_id: requestingUser.role === 'admin' ? requestingUser.company_id : source.company_id,
      created_by: requestingUser.id,
      is_global: false,
    });

    auditLogService.log({
      action: 'permission_template_created', entity_type: 'permission_template',
      entity_id: clone.id, entity_name: clone.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: { cloned_from: source.id },
      company_id: clone.company_id
    });
    return clone;
  }

  async applyToUser(templateId, userId, requestingUser) {
    const template = await PermissionTemplate.findByPk(templateId);
    if (!template) throw new Error('Template not found');
    const user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    await user.update({ module_permissions: template.permissions });

    auditLogService.log({
      action: 'permission_updated', entity_type: 'user',
      entity_id: user.id, entity_name: user.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role,
      details: { template_id: template.id, template_name: template.name },
      company_id: user.company_id
    });
    return user;
  }

  async delete(id, requestingUser) {
    const template = await PermissionTemplate.findByPk(id);
    if (!template) throw new Error('Permission template not found');
    if (template.is_global && requestingUser.role !== 'main_admin') {
      throw new Error('Only Main Admin can delete global templates');
    }
    if (requestingUser.role === 'admin' && template.company_id !== requestingUser.company_id) {
      throw new Error('Cannot delete templates from other companies');
    }

    await template.destroy();

    auditLogService.log({
      action: 'permission_template_deleted', entity_type: 'permission_template',
      entity_id: id, entity_name: template.name,
      performed_by: requestingUser.id, performer_name: requestingUser.name,
      performer_role: requestingUser.role, details: {},
      company_id: template.company_id
    });
    return { message: 'Template deleted successfully' };
  }
}

module.exports = new PermissionTemplateService();
