const { Op } = require('sequelize');
const {
  Project, Client, Vendor, Material, Stock, WorkOrder, Document,
  Message, Conversation, ConversationParticipant,
  VendorPurchaseOrder, Invoice, sequelize,
} = require('../models');

class SearchController {
  async globalSearch(req, res, next) {
    try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) {
        return res.json({ success: true, data: [] });
      }

      const searchTerm = q.trim();
      const like = { [Op.iLike]: `%${searchTerm}%` };
      const user = req.user;
      const limit = 8; // per-module cap

      // Build company scope for multi-tenant models
      const companyWhere = user.company_id ? { company_id: user.company_id } : {};

      const results = await Promise.allSettled([
        // 1. Projects (via Client company scope)
        (async () => {
          const include = [{
            model: Client,
            as: 'client',
            attributes: ['client_name'],
            required: false,
          }];
          const rows = await Project.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { project_name: like },
                { quotation_number: like },
                { po_number: like },
                { part_number: like },
              ],
            },
            include,
            attributes: ['id', 'project_name', 'status', 'quotation_number', 'po_number', 'part_number'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.project_name,
            subtitle: [r.quotation_number, r.po_number, r.client?.client_name].filter(Boolean).join(' -- '),
            module: 'Project',
            path: `/projects/${r.id}`,
          }));
        })(),

        // 2. Clients
        (async () => {
          const rows = await Client.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { client_name: like },
                { poc_name: like },
                { poc_email: like },
              ],
            },
            attributes: ['id', 'client_name', 'poc_name'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.client_name,
            subtitle: r.poc_name || '',
            module: 'Client',
            path: `/clients`,
          }));
        })(),

        // 3. Vendors
        (async () => {
          const rows = await Vendor.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { vendor_name: like },
                { contact_person: like },
                { contact_email: like },
              ],
            },
            attributes: ['id', 'vendor_name', 'contact_person'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.vendor_name,
            subtitle: r.contact_person || '',
            module: 'Vendor',
            path: `/vendors`,
          }));
        })(),

        // 4. Materials
        (async () => {
          const rows = await Material.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { material_name: like },
                { description: like },
                { category: like },
              ],
            },
            attributes: ['id', 'material_name', 'category'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.material_name,
            subtitle: r.category || '',
            module: 'Material',
            path: `/materials`,
          }));
        })(),

        // 5. Stock / Inventory
        (async () => {
          const rows = await Stock.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { part_description: like },
                { material_grade: like },
                { dimension: like },
              ],
            },
            attributes: ['id', 'part_description', 'material_grade', 'quantity'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.part_description || r.material_grade || 'Stock Item',
            subtitle: r.material_grade ? `${r.material_grade} -- Qty: ${r.quantity}` : `Qty: ${r.quantity}`,
            module: 'Inventory',
            path: `/stocks`,
          }));
        })(),

        // 6. Work Orders (via Project --- Client company scope)
        (async () => {
          const include = [{
            model: Project,
            as: 'project',
            attributes: ['project_name'],
          }];
          const rows = await WorkOrder.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { work_order_number: like },
              ],
            },
            include,
            attributes: ['id', 'work_order_number', 'status', 'project_id'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.work_order_number || 'Work Order',
            subtitle: r.project?.project_name || '',
            module: 'Work Order',
            path: `/projects/${r.project_id}`,
          }));
        })(),

        // 7. Documents
        (async () => {
          const rows = await Document.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { file_name: like },
                { document_type: like },
              ],
            },
            include: [{
              model: Project,
              as: 'project',
              attributes: ['project_name'],
            }],
            attributes: ['id', 'file_name', 'document_type', 'project_id'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.file_name,
            subtitle: `${r.document_type || 'Document'} -- ${r.project?.project_name || ''}`,
            module: 'Document',
            path: `/projects/${r.project_id}`,
          }));
        })(),

        // 8. Messages
        (async () => {
          // Find conversations the user participates in
          const participantConvIds = await ConversationParticipant.findAll({
            where: { user_id: user.id },
            attributes: ['conversation_id'],
            raw: true,
          });
          const convIds = participantConvIds.map(p => p.conversation_id);
          if (convIds.length === 0) return [];

          const rows = await Message.findAll({
            where: {
              conversation_id: { [Op.in]: convIds },
              content: like,
            },
            include: [{
              model: Conversation,
              as: 'conversation',
              attributes: ['id', 'name', 'type'],
            }],
            attributes: ['id', 'content', 'conversation_id', 'createdAt'],
            limit,
            order: [['createdAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.conversation_id,
            name: r.content.length > 60 ? r.content.substring(0, 60) + '---' : r.content,
            subtitle: r.conversation?.name || 'Direct Message',
            module: 'Message',
            path: `/messages`,
          }));
        })(),

        // 9. Purchase Orders (Vendor POs)
        (async () => {
          const rows = await VendorPurchaseOrder.findAll({
            where: {
              ...(user.company_id ? { company_id: user.company_id } : {}),
              [Op.or]: [
                { po_number: like },
              ],
            },
            include: [{
              model: Vendor,
              as: 'vendor',
              attributes: ['vendor_name'],
            }, {
              model: Project,
              as: 'project',
              attributes: ['project_name'],
            }],
            attributes: ['id', 'po_number', 'status', 'project_id'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.po_number || 'Purchase Order',
            subtitle: [r.vendor?.vendor_name, r.project?.project_name].filter(Boolean).join(' -- '),
            module: 'Purchase Order',
            path: `/projects/${r.project_id}`,
          }));
        })(),

        // 10. Invoices
        (async () => {
          const rows = await Invoice.findAll({
            where: {
              ...companyWhere,
              [Op.or]: [
                { invoice_number: like },
                { customer_name: like },
              ],
            },
            include: [{
              model: Project,
              as: 'project',
              attributes: ['project_name'],
            }],
            attributes: ['id', 'invoice_number', 'customer_name', 'status', 'project_id'],
            limit,
            order: [['updatedAt', 'DESC']],
          });
          return rows.map(r => ({
            id: r.id,
            name: r.invoice_number || 'Invoice',
            subtitle: [r.customer_name, r.project?.project_name].filter(Boolean).join(' -- '),
            module: 'Invoice',
            path: `/projects/${r.project_id}`,
          }));
        })(),
      ]);

      // Collect successful results, flatten
      const data = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
