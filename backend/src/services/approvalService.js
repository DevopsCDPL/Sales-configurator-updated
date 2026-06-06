const { Op } = require('sequelize');
const { ApprovalWorkflow, User, Company, AuditLog, ActivityTimeline } = require('../models');

const WORKFLOW_TYPES = [
  'user_creation', 'role_change', 'company_suspension', 'data_export',
  'plan_change', 'user_deletion', 'bulk_operation', 'setting_change',
];

class ApprovalService {
  /**
   * Create an approval request
   */
  async createRequest(data, requestingUser) {
    const workflow = await ApprovalWorkflow.create({
      type: data.type,
      title: data.title,
      description: data.description,
      status: 'pending',
      priority: data.priority || 'normal',
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      company_id: data.company_id || requestingUser.company_id,
      requested_by: requestingUser.id,
      request_data: data.request_data || {},
      approval_chain: data.approval_chain || [],
      current_level: 1,
      expires_at: data.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await ActivityTimeline.create({
      company_id: workflow.company_id,
      user_id: requestingUser.id,
      action: 'approval_requested',
      description: `Approval requested: ${data.title}`,
      severity: 'info',
      metadata: { workflow_id: workflow.id, type: data.type },
    });

    return workflow;
  }

  /**
   * Get all workflows (scoped)
   */
  async getAll(requestingUser, { status, type, page = 1, limit = 20 } = {}) {
    const where = {};

    if (requestingUser.role === 'admin') {
      where.company_id = requestingUser.company_id;
    } else if (requestingUser.role === 'user') {
      where.requested_by = requestingUser.id;
    }
    // main_admin sees all

    if (status) where.status = status;
    if (type) where.type = type;

    const { count, rows } = await ApprovalWorkflow.findAndCountAll({
      where,
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'decider', attributes: ['id', 'name', 'email', 'role'] },
        { model: Company, as: 'company', attributes: ['id', 'name'] },
      ],
      order: [
        ['status', 'ASC'], // pending first
        ['priority', 'DESC'],
        ['created_at', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    return { workflows: rows, total: count, page, pages: Math.ceil(count / limit) };
  }

  /**
   * Get a single workflow
   */
  async getById(id) {
    const workflow = await ApprovalWorkflow.findByPk(id, {
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'role'] },
        { model: User, as: 'decider', attributes: ['id', 'name', 'email', 'role'] },
        { model: Company, as: 'company', attributes: ['id', 'name'] },
      ],
    });
    if (!workflow) throw new Error('Approval workflow not found');
    return workflow;
  }

  /**
   * Approve a workflow
   */
  async approve(id, requestingUser, comment) {
    const workflow = await ApprovalWorkflow.findByPk(id);
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'pending') throw new Error('Workflow is not pending');

    // Update approval chain
    const chain = [...(workflow.approval_chain || [])];
    chain.push({
      level: workflow.current_level,
      approver_id: requestingUser.id,
      approver_name: requestingUser.name,
      status: 'approved',
      decided_at: new Date().toISOString(),
      comment: comment || null,
    });

    await workflow.update({
      status: 'approved',
      approval_chain: chain,
      decided_by: requestingUser.id,
      decided_at: new Date(),
      decision_comment: comment,
    });

    await AuditLog.create({
      action: 'approval_granted',
      entity_type: 'approval_workflow',
      entity_id: workflow.id,
      entity_name: workflow.title,
      performed_by: requestingUser.id,
      details: { type: workflow.type, comment },
      company_id: workflow.company_id,
    });

    await ActivityTimeline.create({
      company_id: workflow.company_id,
      user_id: requestingUser.id,
      action: 'approval_granted',
      description: `Approved: ${workflow.title}`,
      severity: 'success',
      metadata: { workflow_id: workflow.id },
    });

    return workflow;
  }

  /**
   * Reject a workflow
   */
  async reject(id, requestingUser, comment) {
    const workflow = await ApprovalWorkflow.findByPk(id);
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.status !== 'pending') throw new Error('Workflow is not pending');

    const chain = [...(workflow.approval_chain || [])];
    chain.push({
      level: workflow.current_level,
      approver_id: requestingUser.id,
      approver_name: requestingUser.name,
      status: 'rejected',
      decided_at: new Date().toISOString(),
      comment: comment || null,
    });

    await workflow.update({
      status: 'rejected',
      approval_chain: chain,
      decided_by: requestingUser.id,
      decided_at: new Date(),
      decision_comment: comment,
    });

    await AuditLog.create({
      action: 'approval_rejected',
      entity_type: 'approval_workflow',
      entity_id: workflow.id,
      entity_name: workflow.title,
      performed_by: requestingUser.id,
      details: { type: workflow.type, comment },
      company_id: workflow.company_id,
    });

    await ActivityTimeline.create({
      company_id: workflow.company_id,
      user_id: requestingUser.id,
      action: 'approval_rejected',
      description: `Rejected: ${workflow.title}`,
      severity: 'warning',
      metadata: { workflow_id: workflow.id },
    });

    return workflow;
  }

  /**
   * Cancel a workflow (by requester)
   */
  async cancel(id, requestingUser) {
    const workflow = await ApprovalWorkflow.findByPk(id);
    if (!workflow) throw new Error('Workflow not found');
    if (workflow.requested_by !== requestingUser.id && requestingUser.role !== 'main_admin') {
      throw new Error('Only the requester or Super Admin can cancel');
    }
    if (workflow.status !== 'pending') throw new Error('Only pending workflows can be cancelled');

    await workflow.update({ status: 'cancelled' });
    return workflow;
  }

  /**
   * Get pending count for badge
   */
  async getPendingCount(requestingUser) {
    const where = { status: 'pending' };
    if (requestingUser.role === 'admin') where.company_id = requestingUser.company_id;
    else if (requestingUser.role === 'user') where.requested_by = requestingUser.id;
    const count = await ApprovalWorkflow.count({ where });
    return count;
  }

  /**
   * Get available workflow types
   */
  getWorkflowTypes() {
    return WORKFLOW_TYPES;
  }
}

module.exports = new ApprovalService();
