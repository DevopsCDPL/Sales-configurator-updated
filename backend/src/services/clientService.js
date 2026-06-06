const { Client, Company, User, Project, Estimate, EstimateItem, SalesOrder, WorkOrder, QualityRecord, Document, RFQBundle, RFQBundleItem, VendorPurchaseOrder, VendorPOItem, VendorRFQ, VendorPO, ProjectAnalytics, Invoice, sequelize } = require('../models');
const { Op } = require('sequelize');
const auditLogService = require('./auditLogService');

class ClientService {
  /**
   * Get clients filtered by role:
   * - main_admin: all clients
   * - admin: clients in their company only
   * - sales: clients in their company only (read-only access)
   */
  async getAllClients(filters = {}, requestingUser = null) {
    const where = { deleted_at: null };
    
    if (filters.search) {
      where[Op.or] = [
        { client_name: { [Op.iLike]: `%${filters.search}%` } },
        { poc_name: { [Op.iLike]: `%${filters.search}%` } },
        { poc_email: { [Op.iLike]: `%${filters.search}%` } }
      ];
    }

    // Tenant isolation: scope by company_id for non-platform_admin
    if (requestingUser) {
      if (requestingUser.role !== 'platform_admin' && requestingUser.company_id) {
        where.company_id = requestingUser.company_id;
      } else if (requestingUser.role !== 'platform_admin' && !requestingUser.company_id) {
        // Non-platform user with no company_id: show records with null company_id only
        where.company_id = null;
      }
      // platform_admin: no company filter, sees all
    }

    const clients = await Client.findAll({
      where,
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false }
      ],
      order: [['client_name', 'ASC']]
    });

    if (clients.length === 0) return [];

    const clientIds = clients.map(c => c.id);

    // Aggregate project counts and last order date per client
    const projectStats = await sequelize.query(
      `SELECT client_id,
              COUNT(*) AS total_orders,
              MAX(created_at) AS last_order_date
         FROM projects
        WHERE client_id IN (:clientIds)
          AND deleted_at IS NULL
        GROUP BY client_id`,
      { replacements: { clientIds }, type: sequelize.QueryTypes.SELECT }
    );

    // Aggregate revenue from invoices linked through projects
    const revenueStats = await sequelize.query(
      `SELECT p.client_id,
              COALESCE(SUM(i.final_total), 0) AS total_revenue
         FROM projects p
         JOIN invoices i ON i.project_id = p.id
        WHERE p.client_id IN (:clientIds)
          AND p.deleted_at IS NULL
          AND i.status NOT IN ('Draft', 'Void')
        GROUP BY p.client_id`,
      { replacements: { clientIds }, type: sequelize.QueryTypes.SELECT }
    );

    const projectMap = {};
    projectStats.forEach(s => {
      projectMap[s.client_id] = {
        total_orders: parseInt(s.total_orders, 10) || 0,
        last_order_date: s.last_order_date || null
      };
    });

    const revenueMap = {};
    revenueStats.forEach(s => {
      revenueMap[s.client_id] = parseFloat(s.total_revenue) || 0;
    });

    return clients.map(c => {
      const plain = c.toJSON();
      const stats = projectMap[c.id] || {};
      plain.total_orders = stats.total_orders || 0;
      plain.last_order_date = stats.last_order_date || null;
      plain.total_revenue = revenueMap[c.id] || 0;
      plain.credit_limit = 0;
      return plain;
    });
  }

  async getClientById(id, requestingUser = null) {
    const client = await Client.findByPk(id, {
      include: [
        { model: Company, as: 'company', attributes: ['id', 'name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false }
      ]
    });
    if (!client) {
      throw new Error('Client not found');
    }

    // Enforce company-level access
    if (requestingUser && requestingUser.role !== 'platform_admin') {
      if (requestingUser.company_id && client.company_id && client.company_id !== requestingUser.company_id) {
        throw new Error('You do not have access to this client');
      }
    }

    // Compute aggregated stats for this client
    const [projectStats] = await sequelize.query(
      `SELECT COUNT(*) AS total_orders, MAX(created_at) AS last_order_date
         FROM projects
        WHERE client_id = :clientId AND deleted_at IS NULL`,
      { replacements: { clientId: id }, type: sequelize.QueryTypes.SELECT }
    );

    const [revenueStats] = await sequelize.query(
      `SELECT COALESCE(SUM(i.final_total), 0) AS total_revenue
         FROM projects p
         JOIN invoices i ON i.project_id = p.id
        WHERE p.client_id = :clientId
          AND p.deleted_at IS NULL
          AND i.status NOT IN ('Draft', 'Void')`,
      { replacements: { clientId: id }, type: sequelize.QueryTypes.SELECT }
    );

    const plain = client.toJSON();
    plain.total_orders = parseInt(projectStats?.total_orders, 10) || 0;
    plain.last_order_date = projectStats?.last_order_date || null;
    plain.total_revenue = parseFloat(revenueStats?.total_revenue) || 0;
    plain.credit_limit = 0;

    return plain;
  }

  async createClient(clientData, requestingUser = null) {
    // User role cannot create clients
    if (requestingUser && requestingUser.role === 'user') {
      throw new Error('You do not have permission to create clients');
    }

    const { client_name, address, poc_name, poc_email, poc_phone, tax_id, payment_terms, notes, position, cc_list } = clientData;

    // Determine company_id
    let companyId = clientData.company_id || null;
    if (requestingUser) {
      if (requestingUser.role === 'platform_admin') {
        // platform_admin can assign to any company via request body
        companyId = clientData.company_id || null;
      } else if (requestingUser.company_id) {
        // All other roles: always scope to their own company
        companyId = requestingUser.company_id;
      }
    }

    const client = await Client.create({
      client_name,
      address,
      poc_name,
      poc_email: poc_email || null,
      poc_phone,
      tax_id: tax_id || null,
      payment_terms: payment_terms || null,
      position: position || null,
      notes: notes || null,
      cc_list: Array.isArray(cc_list) ? cc_list : [],
      company_id: companyId,
      created_by: requestingUser ? requestingUser.id : null
    });

    // Audit log
    auditLogService.log({
      action: 'client_created',
      entity_type: 'client',
      entity_id: client.id,
      entity_name: client_name,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { client_name },
      company_id: companyId
    });

    return client;
  }

  async updateClient(id, updateData, requestingUser = null) {
    const client = await Client.findByPk(id);
    if (!client) {
      throw new Error('Client not found');
    }

    // Access control
    if (requestingUser) {
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to update clients');
      }
      if (requestingUser.role === 'admin') {
        if (client.company_id && client.company_id !== requestingUser.company_id) {
          throw new Error('You can only edit clients in your own company');
        }
      }
    }

    const allowedFields = ['client_name', 'address', 'poc_name', 'poc_email', 'poc_phone', 'tax_id', 'payment_terms', 'position', 'notes', 'cc_list'];
    const updates = {};
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'poc_email') {
          updates[field] = updateData[field] || null;
        } else {
          updates[field] = updateData[field];
        }
      }
    });

    // main_admin can reassign company
    if (requestingUser && requestingUser.role === 'main_admin' && updateData.company_id !== undefined) {
      updates.company_id = updateData.company_id;
    }

    await client.update(updates);
    return client;
  }

  async deleteClient(id, requestingUser = null) {
    const client = await Client.findByPk(id);
    if (!client) {
      throw new Error('Client not found');
    }

    // Access control
    if (requestingUser) {
      if (requestingUser.role === 'user') {
        throw new Error('You do not have permission to delete clients');
      }
      if (requestingUser.role === 'admin') {
        if (client.company_id && client.company_id !== requestingUser.company_id) {
          throw new Error('You can only delete clients in your own company');
        }
      }
    }

    // Soft delete - move to recycle bin
    const deletedBy = requestingUser ? requestingUser.id : null;
    await client.update({ deleted_at: new Date(), deleted_by: deletedBy });
    return { message: 'Client moved to recycle bin' };
  }
}

module.exports = new ClientService();
