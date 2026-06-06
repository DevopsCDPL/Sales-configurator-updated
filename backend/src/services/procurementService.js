const { Op } = require('sequelize');
const {
  sequelize,
  ProcurementRFQ,
  ProcurementRFQItem,
  ProcurementRFQVendor,
  ProcurementVendorQuote,
  ProcurementPO,
  ProcurementPOItem,
  Material,
  Vendor,
  User,
  MaterialTransaction,
  MaterialStock,
} = require('../models');

const fileManagerService = require('./fileManagerService');

class ProcurementService {
  // ─── RFQ Operations ────────────────────────────────────────────────────────

  async generateRFQNumber(companyId) {
    const prefix = 'RFQ';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const where = { rfq_number: { [Op.like]: `${prefix}-${year}${month}-%` } };
    if (companyId) where.company_id = companyId;
    
    const lastRfq = await ProcurementRFQ.findOne({
      where,
      order: [['created_at', 'DESC']],
    });
    
    let seq = 1;
    if (lastRfq) {
      const parts = lastRfq.rfq_number.split('-');
      seq = parseInt(parts[2] || '0', 10) + 1;
    }
    
    return `${prefix}-${year}${month}-${String(seq).padStart(4, '0')}`;
  }

  async getAllRFQs(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.rfq_number = { [Op.iLike]: `%${query.search}%` };
    }

    const rfqs = await ProcurementRFQ.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { 
          model: ProcurementRFQItem, 
          as: 'items',
          include: [{ model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] }]
        },
        { 
          model: ProcurementRFQVendor, 
          as: 'vendors',
          include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] }]
        },
        { model: ProcurementVendorQuote, as: 'quotes' },
      ],
      order: [['created_at', 'DESC']],
    });

    return rfqs;
  }

  async getRFQById(id) {
    const rfq = await ProcurementRFQ.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { 
          model: ProcurementRFQItem, 
          as: 'items',
          include: [{ model: Material, as: 'material', attributes: ['id', 'material_name', 'unit', 'category'] }]
        },
        { 
          model: ProcurementRFQVendor, 
          as: 'vendors',
          include: [{ model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone'] }]
        },
        { 
          model: ProcurementVendorQuote, 
          as: 'quotes',
          include: [
            { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
            { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
          ]
        },
        { model: ProcurementPO, as: 'purchaseOrders' },
      ],
    });
    if (!rfq) throw new Error('RFQ not found');
    return rfq;
  }

  async createRFQ(data, user) {
    const t = await sequelize.transaction();
    try {
      const rfqNumber = await this.generateRFQNumber(user.company_id);
      
      // Create the RFQ
      const rfq = await ProcurementRFQ.create({
        rfq_number: rfqNumber,
        status: 'Draft',
        notes: data.notes || null,
        company_id: user.company_id,
        created_by: user.id,
      }, { transaction: t });

      // Add materials (items)
      if (data.items && data.items.length > 0) {
        const itemsData = data.items.map(item => ({
          rfq_id: rfq.id,
          material_id: item.material_id,
          quantity: item.quantity,
          unit: item.unit || 'Kg',
        }));
        await ProcurementRFQItem.bulkCreate(itemsData, { transaction: t });
      }

      // Add vendors
      if (data.vendor_ids && data.vendor_ids.length > 0) {
        const vendorsData = data.vendor_ids.map(vendorId => ({
          rfq_id: rfq.id,
          vendor_id: vendorId,
          status: 'Pending',
        }));
        await ProcurementRFQVendor.bulkCreate(vendorsData, { transaction: t });
      }

      await t.commit();

      // Create procurement folders in File Manager
      try {
        await fileManagerService.createProcurementFolders(rfq.id, rfqNumber, user.company_id);
      } catch (fmErr) {
        console.error('File Manager procurement folder creation failed (non-blocking):', fmErr.message);
      }

      return this.getRFQById(rfq.id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async updateRFQ(id, data, user) {
    const t = await sequelize.transaction();
    try {
      const rfq = await ProcurementRFQ.findByPk(id);
      if (!rfq) throw new Error('RFQ not found');
      if (rfq.status !== 'Draft') throw new Error('Only Draft RFQs can be edited');

      // Update RFQ basic info
      await rfq.update({
        notes: data.notes !== undefined ? data.notes : rfq.notes,
      }, { transaction: t });

      // Update items if provided
      if (data.items) {
        await ProcurementRFQItem.destroy({ where: { rfq_id: id }, transaction: t });
        if (data.items.length > 0) {
          const itemsData = data.items.map(item => ({
            rfq_id: id,
            material_id: item.material_id,
            quantity: item.quantity,
            unit: item.unit || 'Kg',
          }));
          await ProcurementRFQItem.bulkCreate(itemsData, { transaction: t });
        }
      }

      // Update vendors if provided
      if (data.vendor_ids) {
        await ProcurementRFQVendor.destroy({ where: { rfq_id: id }, transaction: t });
        if (data.vendor_ids.length > 0) {
          const vendorsData = data.vendor_ids.map(vendorId => ({
            rfq_id: id,
            vendor_id: vendorId,
            status: 'Pending',
          }));
          await ProcurementRFQVendor.bulkCreate(vendorsData, { transaction: t });
        }
      }

      await t.commit();
      return this.getRFQById(id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async sendRFQ(id) {
    const rfq = await ProcurementRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');
    if (rfq.status !== 'Draft') throw new Error('RFQ has already been sent');

    await rfq.update({ status: 'Sent' });
    return this.getRFQById(id);
  }

  async deleteRFQ(id) {
    const rfq = await ProcurementRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');
    if (rfq.status !== 'Draft') throw new Error('Only Draft RFQs can be deleted');

    await rfq.destroy();
    return { message: 'RFQ deleted' };
  }

  // ─── Vendor Quote Operations ───────────────────────────────────────────────

  async addVendorQuote(rfqId, vendorId, quotes) {
    const t = await sequelize.transaction();
    try {
      const rfq = await ProcurementRFQ.findByPk(rfqId);
      if (!rfq) throw new Error('RFQ not found');
      if (!['Sent', 'Quoted'].includes(rfq.status)) {
        throw new Error('Cannot add quotes to this RFQ');
      }

      // Add/update quotes for each material
      for (const quote of quotes) {
        const existing = await ProcurementVendorQuote.findOne({
          where: { rfq_id: rfqId, vendor_id: vendorId, material_id: quote.material_id },
          transaction: t,
        });

        if (existing) {
          await existing.update({
            price_per_unit: quote.price_per_unit,
            lead_time: quote.lead_time,
            remarks: quote.remarks,
          }, { transaction: t });
        } else {
          await ProcurementVendorQuote.create({
            rfq_id: rfqId,
            vendor_id: vendorId,
            material_id: quote.material_id,
            price_per_unit: quote.price_per_unit,
            lead_time: quote.lead_time,
            remarks: quote.remarks,
          }, { transaction: t });
        }
      }

      // Update vendor status to Responded
      await ProcurementRFQVendor.update(
        { status: 'Responded' },
        { where: { rfq_id: rfqId, vendor_id: vendorId }, transaction: t }
      );

      // Update RFQ status to Quoted
      await rfq.update({ status: 'Quoted' }, { transaction: t });

      await t.commit();
      return this.getRFQById(rfqId);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async getVendorComparison(rfqId) {
    const rfq = await this.getRFQById(rfqId);
    const comparison = [];

    // Group quotes by material
    for (const item of rfq.items) {
      const materialQuotes = rfq.quotes.filter(q => q.material_id === item.material_id);
      
      const vendorPrices = materialQuotes.map(q => ({
        vendor_id: q.vendor_id,
        vendor_name: q.vendor?.vendor_name,
        price_per_unit: parseFloat(q.price_per_unit),
        lead_time: q.lead_time,
        remarks: q.remarks,
        total_price: parseFloat(q.price_per_unit) * item.quantity,
      }));

      // Sort by price (lowest first)
      vendorPrices.sort((a, b) => a.price_per_unit - b.price_per_unit);

      comparison.push({
        material_id: item.material_id,
        material_name: item.material?.material_name,
        quantity: item.quantity,
        unit: item.unit,
        vendor_quotes: vendorPrices,
        lowest_price: vendorPrices[0]?.price_per_unit || null,
        lowest_vendor_id: vendorPrices[0]?.vendor_id || null,
      });
    }

    return comparison;
  }

  // ─── Purchase Order Operations ─────────────────────────────────────────────

  async generatePONumber(companyId) {
    const prefix = 'PO';
    const year = new Date().getFullYear().toString().slice(-2);
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    const where = { po_number: { [Op.like]: `${prefix}-${year}${month}-%` } };
    if (companyId) where.company_id = companyId;
    
    const lastPo = await ProcurementPO.findOne({
      where,
      order: [['created_at', 'DESC']],
    });
    
    let seq = 1;
    if (lastPo) {
      const parts = lastPo.po_number.split('-');
      seq = parseInt(parts[2] || '0', 10) + 1;
    }
    
    return `${prefix}-${year}${month}-${String(seq).padStart(4, '0')}`;
  }

  async getAllPOs(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.po_number = { [Op.iLike]: `%${query.search}%` };
    }

    const pos = await ProcurementPO.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] },
        { model: ProcurementRFQ, as: 'rfq', attributes: ['id', 'rfq_number'] },
        { 
          model: ProcurementPOItem, 
          as: 'items',
          include: [{ model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] }]
        },
      ],
      order: [['created_at', 'DESC']],
    });

    return pos;
  }

  async getPOById(id) {
    const po = await ProcurementPO.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone', 'address'] },
        { model: ProcurementRFQ, as: 'rfq', attributes: ['id', 'rfq_number'] },
        { 
          model: ProcurementPOItem, 
          as: 'items',
          include: [{ model: Material, as: 'material', attributes: ['id', 'material_name', 'unit', 'category'] }]
        },
      ],
    });
    if (!po) throw new Error('Purchase Order not found');
    return po;
  }

  async createPO(data, user) {
    const t = await sequelize.transaction();
    try {
      // Check if PO already exists for this RFQ + Vendor combination
      if (data.rfq_id && data.vendor_id) {
        const existing = await ProcurementPO.findOne({
          where: { rfq_id: data.rfq_id, vendor_id: data.vendor_id },
        });
        if (existing) {
          throw new Error('A Purchase Order already exists for this RFQ and Vendor');
        }
      }

      const poNumber = await this.generatePONumber(user.company_id);
      
      // Calculate total value
      let totalValue = 0;
      if (data.items) {
        for (const item of data.items) {
          totalValue += item.quantity * parseFloat(item.price_per_unit);
        }
      }

      // Create PO
      const po = await ProcurementPO.create({
        po_number: poNumber,
        rfq_id: data.rfq_id || null,
        vendor_id: data.vendor_id,
        status: 'Draft',
        total_value: totalValue,
        notes: data.notes || null,
        company_id: user.company_id,
        created_by: user.id,
      }, { transaction: t });

      // Add items
      if (data.items && data.items.length > 0) {
        const itemsData = data.items.map(item => ({
          po_id: po.id,
          material_id: item.material_id,
          quantity: item.quantity,
          price_per_unit: item.price_per_unit,
          unit: item.unit || 'Kg',
        }));
        await ProcurementPOItem.bulkCreate(itemsData, { transaction: t });
      }

      // Close the RFQ if it exists
      if (data.rfq_id) {
        await ProcurementRFQ.update(
          { status: 'Closed' },
          { where: { id: data.rfq_id }, transaction: t }
        );
      }

      await t.commit();

      // Create procurement folders in File Manager for PO
      try {
        await fileManagerService.createProcurementFolders(po.id, poNumber, user.company_id);
      } catch (fmErr) {
        console.error('File Manager PO folder creation failed (non-blocking):', fmErr.message);
      }

      return this.getPOById(po.id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async issuePO(id) {
    const po = await ProcurementPO.findByPk(id);
    if (!po) throw new Error('Purchase Order not found');
    if (po.status !== 'Draft') throw new Error('Only Draft POs can be issued');

    await po.update({ status: 'Issued' });
    return this.getPOById(id);
  }

  async receivePO(id, receiveData, user) {
    const t = await sequelize.transaction();
    try {
      const po = await ProcurementPO.findByPk(id, {
        include: [{ model: ProcurementPOItem, as: 'items' }],
      });
      if (!po) throw new Error('Purchase Order not found');
      if (po.status !== 'Issued') throw new Error('Only Issued POs can be received');

      // Validate heat numbers are provided for all items
      if (!receiveData.items || receiveData.items.length === 0) {
        throw new Error('Items with heat numbers are required');
      }

      for (const item of receiveData.items) {
        if (!item.heat_number || !item.heat_number.trim()) {
          throw new Error('Heat Number is required for all materials');
        }
      }

      // Update heat numbers on PO items and create inventory transactions
      for (const receiveItem of receiveData.items) {
        // Find the PO item
        const poItem = po.items.find(i => i.id === receiveItem.po_item_id);
        if (!poItem) continue;

        // Update heat number on PO item
        await ProcurementPOItem.update(
          { heat_number: receiveItem.heat_number.trim() },
          { where: { id: receiveItem.po_item_id }, transaction: t }
        );

        // Create IN transaction in material_transactions
        await MaterialTransaction.create({
          material_id: poItem.material_id,
          type: 'IN',
          direction: 'Procurement PO',
          quantity: poItem.quantity,
          unit: poItem.unit || 'Kg',
          heat_number: receiveItem.heat_number.trim(),
          vendor_id: po.vendor_id,
          project_id: null, // Procurement is project-independent
          reference_type: 'Procurement PO',
          reference_id: po.id,
          remarks: `Received from PO ${po.po_number}`,
          company_id: po.company_id,
          created_by: user?.id || null,
        }, { transaction: t });

        // Update or create MaterialStock record
        let stock = await MaterialStock.findOne({
          where: { material_id: poItem.material_id },
          transaction: t,
        });

        if (stock) {
          // Update existing stock
          const newQty = parseFloat(stock.quantity_in_stock) + parseFloat(poItem.quantity);
          await stock.update({ quantity_in_stock: newQty }, { transaction: t });
        } else {
          // Create new stock record
          await MaterialStock.create({
            material_id: poItem.material_id,
            quantity_in_stock: poItem.quantity,
            last_updated: new Date(),
            company_id: po.company_id || null,
          }, { transaction: t });
        }
      }

      // Update PO status
      await po.update({ status: 'Received' }, { transaction: t });

      await t.commit();
      return this.getPOById(id);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deletePO(id) {
    const po = await ProcurementPO.findByPk(id);
    if (!po) throw new Error('Purchase Order not found');
    if (po.status !== 'Draft') throw new Error('Only Draft POs can be deleted');

    await po.destroy();
    return { message: 'Purchase Order deleted' };
  }

  // ─── Stats Operations ──────────────────────────────────────────────────────

  async getStats(user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;

    const totalRfqs = await ProcurementRFQ.count({ where });
    
    const pendingQuotes = await ProcurementRFQ.count({
      where: { ...where, status: 'Sent' },
    });

    const poWhere = {};
    if (user.company_id) poWhere.company_id = user.company_id;

    const activePOs = await ProcurementPO.count({
      where: { ...poWhere, status: { [Op.in]: ['Draft', 'Issued'] } },
    });

    // Monthly spend (sum of received PO values this month)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthlySpend = await ProcurementPO.sum('total_value', {
      where: {
        ...poWhere,
        status: 'Received',
        updated_at: { [Op.gte]: monthStart },
      },
    }) || 0;

    return {
      totalRfqs,
      pendingQuotes,
      activePOs,
      monthlySpend: parseFloat(monthlySpend),
    };
  }
}

module.exports = new ProcurementService();
