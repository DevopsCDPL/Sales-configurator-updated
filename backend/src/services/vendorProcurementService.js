const { Op } = require('sequelize');
const {
  VendorRFQ, VendorPO, Vendor, Material, Project, VendorMaterial, User,
  RFQBundle, RFQBundleItem, Estimate,
  VendorPurchaseOrder, VendorPOItem,
  RawMaterial,
} = require('../models');
const { sendEmail, isValidEmail } = require('../utils/emailService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const calc = require('../utils/calculations');
const { validateVendorPOForPdf } = require('../utils/pdfValidation');
const auditLogService = require('./auditLogService');

/**
 * Build a merged dimension string from RawMaterial structured dimensions.
 * Shared format used by both RFQ and PO PDFs.
 * @param {Object} dims - JSONB dimensions object from RawMaterial
 * @param {string} unitSys - 'imperial' or 'metric'
 * @returns {string} e.g. '14" x 15" x 1"' or '14 x 15 x 1 mm'
 */
function buildPODimString(dims, unitSys) {
  if (!dims || typeof dims !== 'object') return '';
  const isImperial = unitSys === 'imperial';
  const vals = [];
  if (dims.length) vals.push(dims.length);
  if (dims.width) vals.push(dims.width);
  if (dims.height) vals.push(dims.height);
  if (dims.thickness) vals.push(dims.thickness);
  if (dims.diameter) vals.push(dims.diameter);
  if (dims.outer_diameter) vals.push(dims.outer_diameter);
  if (dims.inner_diameter) vals.push(dims.inner_diameter);
  if (dims.across_flats) vals.push(dims.across_flats);
  if (dims.side) vals.push(dims.side);
  if (vals.length === 0) return '';
  if (isImperial) return vals.map(v => `${v}"`).join(' x ');
  return vals.join(' x ') + ' mm';
}

class VendorProcurementService {
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  Procurement Items --- materials needing vendor supply for a project
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async getProcurementItems(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;

    // Get all VendorRFQs grouped by project+material
    const rfqs = await VendorRFQ.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    // Also get VendorPOs
    const pos = await VendorPO.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    return { rfqs, purchaseOrders: pos };
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  Get suggested vendors for a material
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async getSuggestedVendors(materialId) {
    const material = await Material.findByPk(materialId, {
      include: [{ model: Vendor, as: 'vendors', attributes: ['id', 'vendor_name', 'contact_person', 'contact_email'] }],
    });
    if (!material) throw new Error('Material not found');
    return material.vendors || [];
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  RFQ CRUD
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async createRFQ(data, user) {
    const rfq = await VendorRFQ.create({
      ...data,
      company_id: user.company_id,
      created_by: user.id,
    });
    return this._loadRFQ(rfq.id);
  }

  async updateRFQ(id, data) {
    const rfq = await VendorRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');
    await rfq.update(data);
    return this._loadRFQ(id);
  }

  async deleteRFQ(id) {
    const rfq = await VendorRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');
    await rfq.destroy();
    return { message: 'RFQ deleted' };
  }

  async selectVendor(rfqId) {
    const rfq = await VendorRFQ.findByPk(rfqId);
    if (!rfq) throw new Error('RFQ not found');

    // Un-select other RFQs for same project+material
    await VendorRFQ.update(
      { is_selected: false },
      { where: { project_id: rfq.project_id, material_id: rfq.material_id } }
    );
    await rfq.update({ is_selected: true, status: 'accepted' });
    return this._loadRFQ(rfqId);
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  Vendor PO CRUD
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async generatePO(data, user) {
    // Generate PO number per-company: max existing WITHIN this tenant.
    const lastPO = await VendorPO.findOne({
      where: { company_id: user.company_id || null },
      order: [['po_number', 'DESC']],
    });
    const lastNum = lastPO?.po_number ? parseInt(lastPO.po_number.replace(/\D/g, ''), 10) || 0 : 0;
    const poNumber = `PO-${String(lastNum + 1).padStart(5, '0')}`;

    const po = await VendorPO.create({
      ...data,
      po_number: poNumber,
      company_id: user.company_id,
      created_by: user.id,
    });
    return this._loadPO(po.id);
  }

  async updatePO(id, data) {
    const po = await VendorPO.findByPk(id);
    if (!po) throw new Error('Vendor PO not found');
    await po.update(data);
    return this._loadPO(id);
  }

  async getPOById(id) {
    return this._loadPO(id);
  }

  async getAllPOs(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.status) where.status = query.status;

    return VendorPO.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] },
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  // --------- Helpers ---------------------------------------------------------------------------------------------------------------------------------------------------
  async _loadRFQ(id) {
    return VendorRFQ.findByPk(id, {
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
      ],
    });
  }

  async _loadPO(id) {
    return VendorPO.findByPk(id, {
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone', 'address'] },
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'unit'] },
        { model: VendorRFQ, as: 'rfq' },
      ],
    });
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  RFQ Bundle (Multi-Part RFQ System)
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getVendorSuppliedParts(projectId, user) {
    // Get the project's latest estimate
    const estimate = await Estimate.findOne({
      where: { project_id: projectId },
      order: [['revision', 'DESC']],
    });
    
    if (!estimate || !estimate.custom_parts) {
      return [];
    }

    // Return parts where material_source is 'Vendor Supplied'
    // OR raw_material_supplied_by has a truthy value (vendor material UUID selected)
    const allParts = estimate.custom_parts || [];
    const vendorParts = allParts.filter(part =>
      part.material_source === 'Vendor Supplied' ||
      (part.raw_material_supplied_by && part.raw_material_supplied_by.length > 0)
    );

    return vendorParts.map(part => {
      // Handle bulk pricing: use first tier's quantity if applicable
      let qty = part.quantity || 0;
      if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
        qty = part.pricing_tiers[0].quantity || qty;
      }
      return {
        id: part.id,
        job_description: part.job_description || '',
        material: part.material || '',
        material_grade: part.material_grade || '',
        quantity: qty,
        raw_material_dimension: part.raw_material_dimension || '',
        drawing_part_no: part.drawing_part_no || '',
        drawing_revision: part.drawing_revision || '',
        form: part.form || '',
        shape: part.shape || '',
        condition: part.condition || '',
      };
    });
  }

  async getRFQBundles(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.project_id) where.project_id = query.project_id;
    if (query.status) where.status = query.status;

    return RFQBundle.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone'] },
        { model: RFQBundleItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  async getRFQBundleById(id) {
    return RFQBundle.findByPk(id, {
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone'] },
        { model: RFQBundleItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
  }

  async createRFQBundle(data, user) {
    // Generate RFQ number
    const count = await RFQBundle.count();
    const rfqNumber = `RFQ-${String(count + 1).padStart(5, '0')}`;

    const bundle = await RFQBundle.create({
      rfq_number: rfqNumber,
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      total_quantity: data.total_quantity || null,
      date: data.date || new Date(),
      need_materials_before: data.need_materials_before || null,
      status: data.status || 'draft',
      notes: data.notes || null,
      instructions: data.instructions || null,
      company_id: user.company_id,
      created_by: user.id,
    });

    // Create items
    if (data.items && data.items.length > 0) {
      const items = data.items.map(item => ({
        rfq_bundle_id: bundle.id,
        part_id: item.part_id,
        part_description: item.part_description,
        material: item.material || null,
        material_grade: item.material_grade || null,
        quantity: item.quantity || 0,
        unit: item.unit || 'pcs',
        notes: item.notes || null,
      }));
      await RFQBundleItem.bulkCreate(items);
    }

    return this.getRFQBundleById(bundle.id);
  }

  async updateRFQBundle(id, data) {
    const bundle = await RFQBundle.findByPk(id);
    if (!bundle) throw new Error('RFQ Bundle not found');

    await bundle.update({
      vendor_id: data.vendor_id !== undefined ? data.vendor_id : bundle.vendor_id,
      total_quantity: data.total_quantity !== undefined ? data.total_quantity : bundle.total_quantity,
      date: data.date || bundle.date,
      need_materials_before: data.need_materials_before !== undefined ? data.need_materials_before : bundle.need_materials_before,
      status: data.status || bundle.status,
      notes: data.notes !== undefined ? data.notes : bundle.notes,
      instructions: data.instructions !== undefined ? data.instructions : bundle.instructions,
    });

    // Update items if provided
    if (data.items) {
      // Delete existing items
      await RFQBundleItem.destroy({ where: { rfq_bundle_id: id } });
      
      // Create new items
      if (data.items.length > 0) {
        const items = data.items.map(item => ({
          rfq_bundle_id: id,
          part_id: item.part_id,
          part_description: item.part_description,
          material: item.material || null,
          material_grade: item.material_grade || null,
          quantity: item.quantity || 0,
          unit: item.unit || 'pcs',
          quoted_price: item.quoted_price || null,
          notes: item.notes || null,
        }));
        await RFQBundleItem.bulkCreate(items);
      }
    }

    return this.getRFQBundleById(id);
  }

  async deleteRFQBundle(id) {
    const bundle = await RFQBundle.findByPk(id);
    if (!bundle) throw new Error('RFQ Bundle not found');
    
    // Items will be cascade deleted
    await bundle.destroy();
    return { message: 'RFQ deleted successfully' };
  }

  async duplicateRFQBundle(id, user) {
    const original = await this.getRFQBundleById(id);
    if (!original) throw new Error('RFQ Bundle not found');

    // Generate new RFQ number
    const count = await RFQBundle.count();
    const rfqNumber = `RFQ-${String(count + 1).padStart(5, '0')}`;

    const newBundle = await RFQBundle.create({
      rfq_number: rfqNumber,
      project_id: original.project_id,
      vendor_id: original.vendor_id,
      total_quantity: original.total_quantity,
      date: new Date(),
      need_materials_before: null,
      status: 'draft',
      notes: original.notes,
      instructions: original.instructions,
      company_id: user.company_id,
      created_by: user.id,
    });

    // Copy items
    if (original.items && original.items.length > 0) {
      const items = original.items.map(item => ({
        rfq_bundle_id: newBundle.id,
        part_id: item.part_id,
        part_description: item.part_description,
        material: item.material,
        material_grade: item.material_grade,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      }));
      await RFQBundleItem.bulkCreate(items);
    }

    return this.getRFQBundleById(newBundle.id);
  }

  async sendRFQToVendor(id, requestingUser = null) {
    const bundle = await RFQBundle.findByPk(id, {
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] },
        { model: RFQBundleItem, as: 'items' },
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
      ],
    });
    if (!bundle) throw new Error('RFQ Bundle not found');
    if (!bundle.vendor) throw new Error('No vendor associated with this RFQ');

    // Generate RFQ PDF for attachment
    const { buffer, filename } = await this.generateRFQBundlePdf(id);

    // Send email to vendor
    const vendorEmail = (bundle.vendor.contact_email || '').trim();
    const vendorName = bundle.vendor.vendor_name || 'Vendor';
    const projectName = bundle.project?.project_name || '';
    const rfqNumber = bundle.rfq_number || 'RFQ';

    if (!vendorEmail) {
      throw new Error('Email ID not available');
    }
    if (!isValidEmail(vendorEmail)) {
      throw new Error('Invalid email format');
    }

    const emailResult = await sendEmail({
      to: vendorEmail,
      subject: `Request for Quotation --- ${rfqNumber}${projectName ? ' | ' + projectName : ''}`,
      text: [
        `Dear ${vendorName},`,
        '',
        `Please find attached the Request for Quotation (${rfqNumber})${projectName ? ' for project ' + projectName : ''}.`,
        '',
        'Kindly review the attached document and provide your best quotation at the earliest.',
        '',
        'Regards,',
      ].join('\n'),
      attachments: [{ filename, content: buffer }],
    });

    if (!emailResult.success) {
      auditLogService.log({
        action: 'rfq_email_failed',
        entity_type: 'rfq_bundle',
        entity_id: bundle.id,
        entity_name: rfqNumber,
        performed_by: requestingUser?.id,
        performer_name: requestingUser?.name,
        performer_role: requestingUser?.role,
        details: { recipient: vendorEmail, reason: emailResult.error || 'UNKNOWN_ERROR', project_id: bundle.project_id },
        company_id: requestingUser?.company_id
      });

      if (emailResult.error === 'SMTP_NOT_CONFIGURED') {
        throw new Error('Email service is not configured');
      }
      throw new Error('Failed to send RFQ email');
    }

    await bundle.update({ status: 'sent' });

    auditLogService.log({
      action: 'rfq_email_sent',
      entity_type: 'rfq_bundle',
      entity_id: bundle.id,
      entity_name: rfqNumber,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { recipient: vendorEmail, project_id: bundle.project_id, messageId: emailResult.messageId || null },
      company_id: requestingUser?.company_id
    });

    const result = await this.getRFQBundleById(id);
    result._emailActuallySent = true;
    return result;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  Vendor Purchase Order (from approved RFQ bundle)
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  async getVendorPurchaseOrders(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.project_id) where.project_id = query.project_id;
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.status) where.status = query.status;

    return VendorPurchaseOrder.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone'] },
        { model: RFQBundle, as: 'rfqBundle', attributes: ['id', 'rfq_number', 'status'] },
        { model: VendorPOItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  async getVendorPurchaseOrderById(id) {
    return VendorPurchaseOrder.findByPk(id, {
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone', 'address'] },
        { model: RFQBundle, as: 'rfqBundle', include: [{ model: RFQBundleItem, as: 'items' }] },
        { model: VendorPOItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
  }

  async rateVendorPurchaseOrder(id, ratings) {
    const po = await VendorPurchaseOrder.findByPk(id);
    if (!po) throw new Error('Vendor Purchase Order not found');

    // Validate ratings
    const { price, delivery, quality } = ratings;
    for (const [key, val] of Object.entries({ price, delivery, quality })) {
      const num = Number(val);
      if (isNaN(num) || num < 0 || num > 5) {
        throw new Error(`Invalid rating for ${key}: must be 0-5`);
      }
    }

    await po.update({ ratings: { price: Number(price), delivery: Number(delivery), quality: Number(quality) } });

    // Recalculate consolidated vendor rating
    const allRatedPOs = await VendorPurchaseOrder.findAll({
      where: { vendor_id: po.vendor_id, ratings: { [require('sequelize').Op.ne]: null } },
    });

    if (allRatedPOs.length > 0) {
      let totalAvg = 0;
      for (const rpo of allRatedPOs) {
        const r = rpo.ratings;
        totalAvg += (Number(r.price) + Number(r.delivery) + Number(r.quality)) / 3;
      }
      const consolidated = Math.round((totalAvg / allRatedPOs.length) * 10) / 10; // 1 decimal
      await Vendor.update({ rating: consolidated }, { where: { id: po.vendor_id } });
    }

    return this.getVendorPurchaseOrderById(id);
  }

  async createVendorPurchaseOrder(data, user) {
    // Auto-generate PO number per-company: max existing WITHIN this tenant.
    const lastPO = await VendorPurchaseOrder.findOne({
      where: { company_id: user.company_id || null },
      order: [['po_number', 'DESC']],
    });
    const lastNum = lastPO?.po_number ? parseInt(lastPO.po_number.replace(/\D/g, ''), 10) || 0 : 0;
    const poNumber = `PO-${String(lastNum + 1).padStart(5, '0')}`;

    // Calculate totals
    const costMode = data.cost_mode || 'unit';
    let subtotal = 0;
    if (data.items && data.items.length > 0) {
      const itemsWithTotals = data.items.map(i => ({ ...i, line_total: calc.calculateLineTotal(i, costMode) }));
      subtotal = calc.calculateSubtotal(itemsWithTotals, { onlySelected: true });
    }
    const taxAmount = calc.calculateTaxAmount(subtotal, data.tax_type);
    const grandTotal = calc.calculateGrandTotal({ subtotal, taxAmount });

    const po = await VendorPurchaseOrder.create({
      po_number: poNumber,
      project_id: data.project_id,
      rfq_bundle_id: data.rfq_bundle_id || null,
      vendor_id: data.vendor_id,
      po_date: data.po_date || new Date(),
      tax_type: data.tax_type || 'exempt',
      subtotal,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      quotation_file: data.quotation_file || null,
      notes: data.notes || null,
      terms_conditions: data.terms_conditions || null,
      cost_mode: costMode,
      status: data.status || 'draft',
      company_id: user.company_id,
      created_by: user.id,
    });

    // Create line items
    if (data.items && data.items.length > 0) {
      const items = data.items.map(item => ({
        vendor_po_id: po.id,
        part_id: item.part_id || null,
        part_description: item.part_description,
        quantity: Number(item.quantity) || 0,
        unit_cost: Number(item.unit_cost) || 0,
        weight: Number(item.weight) || 0,
        weight_unit: item.weight_unit || 'KG',
        cost_per_weight: Number(item.cost_per_weight) || 0,
        line_total: calc.calculateLineTotal(item, costMode),
        selected: item.selected !== false,
        notes: item.notes || null,
      }));
      await VendorPOItem.bulkCreate(items);
    }

    return this.getVendorPurchaseOrderById(po.id);
  }

  async updateVendorPurchaseOrder(id, data) {
    const po = await VendorPurchaseOrder.findByPk(id);
    if (!po) throw new Error('Vendor Purchase Order not found');

    // Calculate totals
    const costMode = data.cost_mode !== undefined ? data.cost_mode : (po.cost_mode || 'unit');
    let subtotal = po.subtotal;
    if (data.items) {
      const itemsWithTotals = data.items.map(i => ({ ...i, line_total: calc.calculateLineTotal(i, costMode) }));
      subtotal = calc.calculateSubtotal(itemsWithTotals, { onlySelected: true });
    }
    const taxType = data.tax_type || po.tax_type;
    const taxAmount = calc.calculateTaxAmount(subtotal, taxType);
    const grandTotal = calc.calculateGrandTotal({ subtotal, taxAmount });

    await po.update({
      rfq_bundle_id: data.rfq_bundle_id !== undefined ? data.rfq_bundle_id : po.rfq_bundle_id,
      vendor_id: data.vendor_id || po.vendor_id,
      po_date: data.po_date || po.po_date,
      tax_type: taxType,
      subtotal,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      quotation_file: data.quotation_file !== undefined ? data.quotation_file : po.quotation_file,
      notes: data.notes !== undefined ? data.notes : po.notes,
      terms_conditions: data.terms_conditions !== undefined ? data.terms_conditions : po.terms_conditions,
      cost_mode: costMode,
      status: data.status || po.status,
    });

    // Update items if provided
    if (data.items) {
      await VendorPOItem.destroy({ where: { vendor_po_id: id } });
      if (data.items.length > 0) {
        const items = data.items.map(item => ({
          vendor_po_id: id,
          part_id: item.part_id || null,
          part_description: item.part_description,
          quantity: Number(item.quantity) || 0,
          unit_cost: Number(item.unit_cost) || 0,
          weight: Number(item.weight) || 0,
          weight_unit: item.weight_unit || 'KG',
          cost_per_weight: Number(item.cost_per_weight) || 0,
          line_total: calc.calculateLineTotal(item, costMode),
          selected: item.selected !== false,
          notes: item.notes || null,
        }));
        await VendorPOItem.bulkCreate(items);
      }
    }

    return this.getVendorPurchaseOrderById(id);
  }

  async deleteVendorPurchaseOrder(id) {
    const po = await VendorPurchaseOrder.findByPk(id);
    if (!po) throw new Error('Vendor Purchase Order not found');
    await po.destroy(); // items cascade deleted
    return { message: 'Purchase Order deleted successfully' };
  }

  async sendVendorPOToVendor(id, requestingUser = null) {
    const po = await VendorPurchaseOrder.findByPk(id, {
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] },
        { model: VendorPOItem, as: 'items' },
        { model: Project, as: 'project', attributes: ['id', 'project_name'] },
      ],
    });
    if (!po) throw new Error('Vendor Purchase Order not found');
    if (!po.vendor) throw new Error('No vendor associated with this PO');

    // Generate PDF for attachment
    const { buffer, filename } = await this.generateVendorPOPdf(id);

    // Send email to vendor
    const vendorEmail = (po.vendor.contact_email || '').trim();
    const vendorName = po.vendor.vendor_name || 'Vendor';
    const projectName = po.project?.project_name || '';
    const poNumber = po.po_number || 'PO';

    if (!vendorEmail) {
      throw new Error('Email ID not available');
    }
    if (!isValidEmail(vendorEmail)) {
      throw new Error('Invalid email format');
    }

    const emailResult = await sendEmail({
      to: vendorEmail,
      subject: `Purchase Order --- ${poNumber}${projectName ? ' | ' + projectName : ''}`,
      text: [
        `Dear ${vendorName},`,
        '',
        `Please find attached the Purchase Order (${poNumber})${projectName ? ' for project ' + projectName : ''}.`,
        '',
        'Kindly review and confirm acceptance at the earliest.',
        '',
        'Regards,',
      ].join('\n'),
      attachments: [{ filename, content: buffer }],
    });

    if (!emailResult.success) {
      auditLogService.log({
        action: 'vendor_po_email_failed',
        entity_type: 'vendor_purchase_order',
        entity_id: po.id,
        entity_name: poNumber,
        performed_by: requestingUser?.id,
        performer_name: requestingUser?.name,
        performer_role: requestingUser?.role,
        details: { recipient: vendorEmail, reason: emailResult.error || 'UNKNOWN_ERROR', project_id: po.project_id },
        company_id: requestingUser?.company_id
      });

      if (emailResult.error === 'SMTP_NOT_CONFIGURED') {
        throw new Error('Email service is not configured');
      }
      throw new Error('Failed to send PO email');
    }

    await po.update({ status: 'sent' });

    auditLogService.log({
      action: 'vendor_po_email_sent',
      entity_type: 'vendor_purchase_order',
      entity_id: po.id,
      entity_name: poNumber,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { recipient: vendorEmail, project_id: po.project_id, messageId: emailResult.messageId || null },
      company_id: requestingUser?.company_id
    });

    const result = await this.getVendorPurchaseOrderById(id);
    result._emailActuallySent = true;
    return result;
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  PDF Generation --- RFQ Bundle
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async generateRFQBundlePdf(id) {
    const PDFDocument = require('pdfkit');
    const settingsService = require('./settingsService');

    const bundle = await RFQBundle.findByPk(id, {
       include: [
         { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
         { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_person', 'contact_position', 'contact_email', 'contact_phone', 'address'] },
         { model: RFQBundleItem, as: 'items' },
         { model: User, as: 'creator', attributes: ['id', 'name', 'position'] },
       ],
    });
    if (!bundle) throw new Error('RFQ Bundle not found');

    const companySettings = await settingsService.getCompanySettings(bundle.company_id);

    const fmtDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    // Generate standardized filename using naming service
    const { generateDocumentName } = require('./documentNamingService');
    const { fileName: rfqFilename } = await generateDocumentName({
      documentType: 'rfq',
      projectName: bundle.project?.project_name,
      reference: bundle.rfq_number,
      projectId: bundle.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: rfqFilename,
        projectId: bundle.project_id,
      }));
      doc.on('error', reject);

      const M = 40;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW = pageW - 2 * M;
      const FOOTER_H = 55;

      const BDR = 0.5;                 // standard border line width
      const BDR_COL = '#000000';        // border colour
      const ROW_H = 16;                 // standard info-table row height

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - 10) { doc.addPage(); y = M; }
      };

      const drawVDiv = (x, y1, y2, lw = BDR, col = BDR_COL) =>
        doc.lineWidth(lw).moveTo(x, y1).lineTo(x, y2).strokeColor(col).stroke();

      const drawHDiv = (x1, x2, yy, lw = BDR, col = BDR_COL) =>
        doc.lineWidth(lw).moveTo(x1, yy).lineTo(x2, yy).strokeColor(col).stroke();

      // --------- HEADER ---------
      let y = drawGlobalHeader(doc, companySettings, 'Request for Quotation');
      y += 4;

      // --------- UNIFIED TO / PREPARED BY + INFO TABLE ---------------------------------------------------
      // Reference layout: 8 rows in one table
      //   Row 0: "To" | "Prepared By"  (green bg, white text)
      //   Row 1: Vendor Name | Company Name
      //   Row 2: POC | POC
      //   Row 3: Email | Email
      //   Row 4: Phone | Phone
      //   Row 5: (empty spacer)
      //   Row 6: RFQ No: xxx | RFQ Date: xxx
      //   Row 7: Project: xxx | (empty)
      const leftW = Math.round(cW * 0.533);   // 53.3% from reference
      const rightW = cW - leftW;
      const vendor = bundle.vendor || {};
      const infoRowH = ROW_H;
      const labelRowH = 18;
      const contactRowH = 14;
      const spacerH = 8;

      // Rows 1-5+: Contact info
      const contactLines = [
        { left: vendor.vendor_name || '', right: companySettings.name || '', bold: true },
        { left: vendor.address || '', right: companySettings.address || '', bold: false },
        { left: `POC: ${vendor.contact_person || '-'}${vendor.contact_position ? ' | ' + vendor.contact_position : ''}`, right: `POC: ${bundle.creator?.name || '-'}${bundle.creator?.position ? ' | ' + bundle.creator.position : ''}`, bold: false },
        { left: `Email: ${vendor.contact_email || '-'}`, right: `Email: ${companySettings.email || '-'}`, bold: false },
        { left: `Phone: ${vendor.contact_phone || '-'}`, right: `Phone: ${companySettings.phone || '-'}`, bold: false },
      ].filter(line => line.left || line.right);

      // Measure dynamic row heights for wrapping text
      const contactRowHeights = contactLines.map(line => {
        doc.fontSize(8).font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
        const lH = line.left ? doc.heightOfString(line.left, { width: leftW - 12 }) + 6 : contactRowH;
        const rH = line.right ? doc.heightOfString(line.right, { width: rightW - 12 }) + 6 : contactRowH;
        return Math.max(contactRowH, Math.ceil(lH), Math.ceil(rH));
      });
      const contactBlockH = contactRowHeights.reduce((a, b) => a + b, 0);
      const totalTableH = labelRowH + contactBlockH + spacerH + infoRowH * 2;

      checkPage(totalTableH);

      // Row 0: Green header labels
      doc.rect(M, y, leftW, labelRowH).fill(COLORS.TABLE_HEAD);
      doc.rect(M + leftW, y, rightW, labelRowH).fill(COLORS.TABLE_HEAD);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text('To', M + 6, y + (labelRowH - 9) / 2, { width: leftW - 12, lineBreak: false });
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text('Prepared By', M + leftW + 6, y + (labelRowH - 9) / 2, { width: rightW - 12, lineBreak: false });
      y += labelRowH;
      drawHDiv(M, M + cW, y);

      contactLines.forEach((line, li) => {
        const rH = contactRowHeights[li];
        const fnt = line.bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(8).font(fnt).fillColor(COLORS.TEXT_DARK)
           .text(line.left, M + 6, y + 3, { width: leftW - 12, lineBreak: true });
        doc.fontSize(8).font(fnt).fillColor(COLORS.TEXT_DARK)
           .text(line.right, M + leftW + 6, y + 3, { width: rightW - 12, lineBreak: true });
        y += rH;
      });

      // Row 5: Spacer
      y += spacerH;
      drawHDiv(M, M + cW, y);

      // Outer border (drawn after content so we know total height)
      doc.lineWidth(BDR).rect(M, y - contactBlockH - spacerH - labelRowH, cW, totalTableH).strokeColor(BDR_COL).stroke();
      // Vertical divider for full table height
      drawVDiv(M + leftW, y - contactBlockH - spacerH - labelRowH, y - contactBlockH - spacerH - labelRowH + totalTableH);

      // Row 6: RFQ No | RFQ Date
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`RFQ No`, M + 6, y + (infoRowH - 8) / 2, { width: 70, lineBreak: false, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`:   ${bundle.rfq_number || '---'}`, M + 76, y + (infoRowH - 8) / 2, { width: leftW - 82, lineBreak: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`RFQ Date`, M + leftW + 6, y + (infoRowH - 8) / 2, { width: 70, lineBreak: false, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`:  ${fmtDate(bundle.date)}`, M + leftW + 76, y + (infoRowH - 8) / 2, { width: rightW - 82, lineBreak: false });
      y += infoRowH;
      drawHDiv(M, M + cW, y);

      // Row 7: Project | (empty)
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`Project`, M + 6, y + (infoRowH - 8) / 2, { width: 70, lineBreak: false, continued: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(`:   ${bundle.project?.project_name || '---'}`, M + 76, y + (infoRowH - 8) / 2, { width: leftW - 82, lineBreak: false });
      y += infoRowH;

      y += 10;

      // --------- SUMMARY SECTION ------------------------------------------------------------------------------------------------------------------
      checkPage(30);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
         .text('1. Summary', M, y);
      y = doc.y + 6;

      // Column widths: #=7%, Description=80%, Quantity=13%
      const S_COLS = [Math.round(cW * 0.07), 0, Math.round(cW * 0.13)];
      S_COLS[1] = cW - S_COLS[0] - S_COLS[2];

      // Table header
      const TH_H = 20;
      checkPage(TH_H);
      doc.rect(M, y, cW, TH_H).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.75).rect(M, y, cW, TH_H).strokeColor('#000000').stroke();
      const sHdrs = ['S.No', 'Description', 'Quantity'];
      const sAligns = ['center', 'left', 'center'];
      let hx = M;
      sHdrs.forEach((h, i) => {
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text(h, hx + 4, y + (TH_H - 8.5) / 2, { width: S_COLS[i] - 8, align: sAligns[i], lineBreak: false });
        if (i < sHdrs.length - 1) drawVDiv(hx + S_COLS[i], y, y + TH_H, 0.3, '#FFFFFF');
        hx += S_COLS[i];
      });
      y += TH_H;

      // Data rows
      const items = bundle.items || [];
      const DATA_ROW_H = 22;
      items.forEach((item, idx) => {
        const desc = item.part_description || '---';
        // Measure actual height needed for description
        doc.fontSize(8).font('Helvetica');
        const descH = doc.heightOfString(desc, { width: S_COLS[1] - 8 });
        const rowH = Math.max(DATA_ROW_H, Math.ceil(descH) + 8);

        checkPage(rowH);
        const bg = idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
        doc.rect(M, y, cW, rowH).fill(bg);
        doc.lineWidth(0.5).rect(M, y, cW, rowH).strokeColor('#000000').stroke();
        const cells = [String(idx + 1), desc, String(item.quantity || '---')];
        let rx = M;
        cells.forEach((txt, i) => {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text(txt, rx + 4, y + 4, { width: S_COLS[i] - 8, align: sAligns[i], lineBreak: true });
          if (i < cells.length - 1) drawVDiv(rx + S_COLS[i], y, y + rowH, 0.3, '#999999');
          rx += S_COLS[i];
        });
        y += rowH;
      });

      if (items.length === 0) {
        checkPage(DATA_ROW_H);
        doc.rect(M, y, cW, DATA_ROW_H).fill(COLORS.ROW_ALT);
        doc.lineWidth(0.5).rect(M, y, cW, DATA_ROW_H).strokeColor('#000000').stroke();
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text('No items', M + 4, y + (DATA_ROW_H - 8) / 2, { width: cW - 8, align: 'center' });
        y += DATA_ROW_H;
      }
      y += 12;

      // --------- INSTRUCTIONS ---------------------------------------------------------------------------------------------------------------------------
      const instrNotes = Array.isArray(bundle.instructions) && bundle.instructions.length > 0
        ? bundle.instructions
        : [
            'Please provide your best quotation for the above items.',
            `Need materials before: ${fmtDate(bundle.need_materials_before) || 'As soon as possible'}.`,
            'Freight Not Included: Freight charges are not included. Any freight costs will be calculated and billed separately.',
          ];

      if (instrNotes.length > 0) {
        checkPage(30);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
           .text('2. Instructions', M, y);
        y = doc.y + 6;

        instrNotes.forEach(n => {
          if (!n) return;
          checkPage(20);
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text('\u2022  ' + n, M + 8, y, { width: cW - 16, align: 'justify' });
          y = doc.y + 4;
        });
        y += 8;
      }

      // --------- FOOTER ---------
      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  //  PDF Generation --- Vendor Purchase Order
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async generateVendorPOPdf(id) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');
    const settingsService = require('./settingsService');

    const po = await VendorPurchaseOrder.findByPk(id, {
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name', 'status'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_person', 'contact_position', 'contact_email', 'contact_phone', 'address'] },
        { model: RFQBundle, as: 'rfqBundle', attributes: ['id', 'rfq_number'] },
        { model: VendorPOItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'position'] },
      ],
    });
    if (!po) throw new Error('Vendor Purchase Order not found');

    // PDF pre-generation validation
    const validation = validateVendorPOForPdf(po, po.items);
    if (!validation.valid) {
      const err = new Error('Cannot generate Vendor PO PDF: ' + validation.errors.join('; '));
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const companySettings = await settingsService.getCompanySettings(po.company_id);

    // --- Resolve correct descriptions from estimate custom parts + RawMaterial master ---
    const descriptionMap = new Map();
    if (po.project_id) {
      const estimate = await Estimate.findOne({
        where: { project_id: po.project_id },
        order: [['revision', 'DESC']],
      });
      if (estimate && Array.isArray(estimate.custom_parts)) {
        const customPartsMap = new Map();
        for (const cp of estimate.custom_parts) {
          if (cp.id) customPartsMap.set(cp.id, cp);
        }
        for (const item of (po.items || [])) {
          if (!item.part_id) continue;
          const cp = customPartsMap.get(item.part_id);
          if (!cp) continue;

          const category = cp.material || '';
          const grade = cp.material_grade || '';
          let condition = cp.condition || '';
          let shape = cp.shape || '';
          let dimStr = '';

          // Look up RawMaterial for correct dimensions and unit
          if (category && grade) {
            const rmWhere = { material_category: category, material_grade: grade };
            if (condition) rmWhere.condition = condition;
            const rm = await RawMaterial.findOne({ where: rmWhere });
            if (rm) {
              condition = rm.condition || condition;
              shape = rm.shape || shape;
              dimStr = buildPODimString(rm.dimensions, rm.unit_system);
            }
          }

          // Fallback: use custom part dimension string if RawMaterial not found
          if (!dimStr && cp.raw_material_dimension) {
            dimStr = cp.raw_material_dimension;
          }

          // Format: Material Category | Material Grade | Condition | Shape | Dimensions
          const desc = [category, grade, condition, shape, dimStr].filter(Boolean).join(' | ');
          if (desc) descriptionMap.set(item.id, desc);
        }
      }
    }

    const fmtDate = (date) => {
      if (!date) return '---';
      return dayjs(date).format('DD/MM/YYYY');
    };
    const fmtCurrency = calc.fmtCurrency;

    // Generate standardized filename using naming service
    const { generateDocumentName: genVPOName } = require('./documentNamingService');
    const { fileName: vpoFilename } = await genVPOName({
      documentType: 'vendor_po',
      projectName: po.project?.project_name,
      reference: po.po_number,
      projectId: po.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: vpoFilename,
        projectId: po.project_id,
      }));
      doc.on('error', reject);

      // ------ Use shared PDF template (matching RFQ style) ------
      const { COLORS, TABLE, FOOTER_H: TPL_FOOTER_H, SIDE_MARGIN } = require('../utils/pdfTemplate');
      const margin = SIDE_MARGIN;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW = pageW - 2 * margin;
      const FOOTER_H = TPL_FOOTER_H;

      const reHeader = () => drawGlobalHeader(doc, companySettings, 'Purchase Order');

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = reHeader(); }
      };

      const drawSectionTitlePO = (num, title) => {
        checkPage(30);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
           .text(`${num}. ${title}`, margin, y);
        y = doc.y + 6;
      };

      // --------- HEADER ---------
      let y = reHeader();
      y += 4;

      // ------ TO / PREPARED BY + PO INFO (unified block, matching RFQ style) ------
      const leftW = Math.round(cW * 0.533);
      const rightW = cW - leftW;
      const vendor = po.vendor || {};
      const boxY = y;
      const hdrH = 18;

      // Dark gray header row
      doc.rect(margin, boxY, cW, hdrH).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.5).moveTo(margin, boxY + hdrH).lineTo(margin + cW, boxY + hdrH).strokeColor(COLORS.BORDER).stroke();

      // Header labels
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT);
      doc.text('To', margin + 6, boxY + (hdrH - 9) / 2, { width: leftW - 12, lineBreak: false });
      doc.text('Prepared By', margin + leftW + 6, boxY + (hdrH - 9) / 2, { width: rightW - 12, lineBreak: false });

      // Contact lines (matching RFQ style)
      const contactLines = [
        { left: vendor.vendor_name || '', right: companySettings.name || '', bold: true },
        { left: vendor.address || '', right: companySettings.address || '', bold: false },
        { left: `POC: ${vendor.contact_person || '-'}${vendor.contact_position ? ' | ' + vendor.contact_position : ''}`, right: `POC: ${po.creator?.name || '-'}${po.creator?.position ? ' | ' + po.creator.position : ''}`, bold: false },
        { left: `Email: ${vendor.contact_email || '-'}`, right: `Email: ${companySettings.email || '-'}`, bold: false },
        { left: `Phone: ${vendor.contact_phone || '-'}`, right: `Phone: ${companySettings.phone || '-'}`, bold: false },
      ];
      const contactRowH_po = 14;
      const contactRowHeights = contactLines.map(line => {
        doc.fontSize(8).font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
        const lH = line.left ? doc.heightOfString(line.left, { width: leftW - 12 }) + 6 : contactRowH_po;
        const rH = line.right ? doc.heightOfString(line.right, { width: rightW - 12 }) + 6 : contactRowH_po;
        return Math.max(contactRowH_po, Math.ceil(lH), Math.ceil(rH));
      });
      const contactBlockH = contactRowHeights.reduce((a, b) => a + b, 0);
      const spacerH = 8;
      const infoRowH = 16;
      const totalBlockH = hdrH + contactBlockH + spacerH + infoRowH * 2;

      // Draw contact rows
      let cY = boxY + hdrH;
      contactLines.forEach((line, li) => {
        const rH = contactRowHeights[li];
        const fnt = line.bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(8).font(fnt).fillColor(COLORS.TEXT_DARK)
           .text(line.left, margin + 6, cY + 3, { width: leftW - 12, lineBreak: true });
        doc.fontSize(8).font(fnt).fillColor(COLORS.TEXT_DARK)
           .text(line.right, margin + leftW + 6, cY + 3, { width: rightW - 12, lineBreak: true });
        cY += rH;
      });
      cY += spacerH;

      // Horizontal divider before info rows
      doc.lineWidth(0.5).moveTo(margin, cY).lineTo(margin + cW, cY).strokeColor(COLORS.BORDER).stroke();

      // Info row 1: PO No | Quotation Ref No
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('Purchase Order No', margin + 6, cY + (infoRowH - 8) / 2, { width: 100, lineBreak: false });
      doc.text(`:   ${po.po_number || '---'}`, margin + 106, cY + (infoRowH - 8) / 2, { width: leftW - 112, lineBreak: false });
      doc.text('Quotation Ref No', margin + leftW + 6, cY + (infoRowH - 8) / 2, { width: 95, lineBreak: false });
      doc.text(`:   ${po.rfqBundle?.rfq_number || '---'}`, margin + leftW + 101, cY + (infoRowH - 8) / 2, { width: rightW - 107, lineBreak: false });
      cY += infoRowH;
      doc.lineWidth(0.5).moveTo(margin, cY).lineTo(margin + cW, cY).strokeColor(COLORS.BORDER).stroke();

      // Info row 2: PO Date | Project
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('Purchase Order Date', margin + 6, cY + (infoRowH - 8) / 2, { width: 100, lineBreak: false });
      doc.text(`:   ${fmtDate(po.po_date)}`, margin + 106, cY + (infoRowH - 8) / 2, { width: leftW - 112, lineBreak: false });
      doc.text('Project', margin + leftW + 6, cY + (infoRowH - 8) / 2, { width: 95, lineBreak: false });
      doc.text(`:   ${po.project?.project_name || '---'}`, margin + leftW + 101, cY + (infoRowH - 8) / 2, { width: rightW - 107, lineBreak: false });

      // Single outer border + center vertical divider covering entire block
      doc.lineWidth(0.5).rect(margin, boxY, cW, totalBlockH).strokeColor(COLORS.BORDER).stroke();
      doc.lineWidth(0.5).moveTo(margin + leftW, boxY).lineTo(margin + leftW, boxY + totalBlockH).strokeColor(COLORS.BORDER).stroke();
      y = boxY + totalBlockH + 10;

      // --------- SECTION 1: SUMMARY ---------------------------------------------------------------------------------------------------------------------
      drawSectionTitlePO('1', 'Summary');

      // Cost-mode aware column headers
      const isWeightMode = po.cost_mode === 'weight';
      // Get weight unit from first item (KG or LBS) for header display
      const firstItem = (po.items || []).find(i => i.selected !== false);
      const headerWeightUnit = (firstItem?.weight_unit || 'KG').toUpperCase();

      // Column widths: #, Description, Unit Price, Weight, Quantity, Total Price
      const S_COL = [30, 0, 72, 60, 70, 88];
      S_COL[1] = cW - S_COL[0] - S_COL[2] - S_COL[3] - S_COL[4] - S_COL[5];
      const S_HDR = ['#', 'Description', isWeightMode ? `Cost / ${headerWeightUnit}` : 'Unit Price', 'Weight', 'Quantity', 'Total Price'];
      const S_ALIGN = ['center', 'left', 'right', 'center', 'center', 'right'];

      // Summary header (matching RFQ style: height 20, white dividers)
      const S_HDR_H = 20;
      const drawSummaryHeader = () => {
        doc.rect(margin, y, cW, S_HDR_H).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.75).rect(margin, y, cW, S_HDR_H).strokeColor(COLORS.BORDER).stroke();
        let hx = margin;
        S_HDR.forEach((h, i) => {
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
             .text(h, hx + 4, y + (S_HDR_H - 8.5) / 2, { width: S_COL[i] - 8, align: S_ALIGN[i], lineBreak: false });
          if (i < S_HDR.length - 1) {
            doc.lineWidth(0.3).moveTo(hx + S_COL[i], y).lineTo(hx + S_COL[i], y + S_HDR_H).strokeColor('#FFFFFF').stroke();
          }
          hx += S_COL[i];
        });
        y += S_HDR_H;
      };

      checkPage(S_HDR_H);
      drawSummaryHeader();

      // Column dividers helper (matching RFQ: #999999 gray dividers)
      const drawColDividers = (rowY, rowH) => {
        let dx = margin;
        for (let i = 0; i < S_COL.length - 1; i++) {
          dx += S_COL[i];
          doc.lineWidth(0.3).moveTo(dx, rowY).lineTo(dx, rowY + rowH).strokeColor('#999999').stroke();
        }
      };

      // Data rows
      const poItems = (po.items || []).filter(i => i.selected !== false);
      let grandTotal = 0;
      const DATA_ROW_H = 22;

      const ensureRowSpace = (rowH) => {
        if (y + rowH > pageH - FOOTER_H - margin - 20) {
          doc.addPage(); y = reHeader();
          drawSummaryHeader();
        }
      };

      poItems.forEach((item, idx) => {
        const qty = Number(item.quantity) || 0;
        const weight = Number(item.weight) || 0;
        const weightUnit = item.weight_unit || 'KG';
        const unitCost = isWeightMode ? (Number(item.cost_per_weight) || 0) : (Number(item.unit_cost) || 0);
        const lineTotal = Number(item.line_total) || (isWeightMode ? unitCost * weight : unitCost * qty);
        grandTotal += lineTotal;
        const desc = descriptionMap.get(item.id) || item.part_description || '---';
        const weightDisplay = weight > 0 ? `${weight} ${weightUnit}` : '-';

        // Dynamic row height based on description
        const descW = S_COL[1] - 8;
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica');
        const descH = doc.heightOfString(desc, { width: descW });
        const rowH = Math.max(DATA_ROW_H, descH + 8);

        ensureRowSpace(rowH);
        const bg = idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
        doc.rect(margin, y, cW, rowH).fill(bg);
        doc.lineWidth(TABLE.BORDER_W).rect(margin, y, cW, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
        drawColDividers(y, rowH);

        const rowMid = y + (rowH - 9) / 2;
        let cx = margin;

        // # column
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        doc.text(String(idx + 1), cx + 4, rowMid, { width: S_COL[0] - 8, align: 'center', lineBreak: false });
        cx += S_COL[0];

        // Description column
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        doc.text(desc, cx + 4, y + 4, { width: descW, lineBreak: true, height: rowH - 8 });
        cx += S_COL[1];

        // Unit Price | Weight | Quantity | Total Price
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        doc.text(fmtCurrency(unitCost), cx + 6, rowMid, { width: S_COL[2] - 12, align: 'right', lineBreak: false });
        cx += S_COL[2];
        doc.text(weightDisplay, cx + 4, rowMid, { width: S_COL[3] - 8, align: 'center', lineBreak: false });
        cx += S_COL[3];
        doc.text(String(qty), cx + 4, rowMid, { width: S_COL[4] - 8, align: 'center', lineBreak: false });
        cx += S_COL[4];
        doc.text(fmtCurrency(lineTotal), cx + 6, rowMid, { width: S_COL[5] - 12, align: 'right', lineBreak: false });

        y += rowH;
      });

      if (poItems.length === 0) {
        ensureRowSpace(DATA_ROW_H);
        doc.rect(margin, y, cW, DATA_ROW_H).fill(COLORS.ROW_ALT);
        doc.lineWidth(TABLE.BORDER_W).rect(margin, y, cW, DATA_ROW_H).strokeColor(COLORS.BORDER_LIGHT).stroke();
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text('No items', margin + 4, y + (DATA_ROW_H - 8) / 2, { width: cW - 8, align: 'center' });
        y += DATA_ROW_H;
      }

      // Tax row
      const taxAmt = Number(po.tax_amount) || 0;
      const taxLabel = po.tax_type === 'exempt' || !po.tax_type ? 'Exempt' : po.tax_type;
      ensureRowSpace(DATA_ROW_H);
      doc.rect(margin, y, cW, DATA_ROW_H).fill(COLORS.ROW_WHITE);
      doc.lineWidth(TABLE.BORDER_W).rect(margin, y, cW, DATA_ROW_H).strokeColor(COLORS.BORDER_LIGHT).stroke();

      let txCx = margin;
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK);
      doc.text(String(poItems.length + 1), txCx + 4, y + (DATA_ROW_H - 9) / 2, { width: S_COL[0] - 8, align: 'center' });
      doc.lineWidth(TABLE.DIVIDER_W).moveTo(txCx + S_COL[0], y).lineTo(txCx + S_COL[0], y + DATA_ROW_H).strokeColor(COLORS.BORDER_LIGHT).stroke();
      txCx += S_COL[0];

      // "Tax" in Description + Unit Price + Weight merged
      const taxDescW = S_COL[1] + S_COL[2] + S_COL[3];
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Tax', txCx + 4, y + (DATA_ROW_H - 9) / 2, { width: taxDescW - 8, align: 'right' });
      doc.lineWidth(TABLE.DIVIDER_W).moveTo(txCx + taxDescW, y).lineTo(txCx + taxDescW, y + DATA_ROW_H).strokeColor(COLORS.BORDER_LIGHT).stroke();
      txCx += taxDescW;

      // Tax label in Quantity column
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(taxLabel, txCx + 4, y + (DATA_ROW_H - 9) / 2, { width: S_COL[4] - 8, align: 'center' });
      doc.lineWidth(TABLE.DIVIDER_W).moveTo(txCx + S_COL[4], y).lineTo(txCx + S_COL[4], y + DATA_ROW_H).strokeColor(COLORS.BORDER_LIGHT).stroke();
      txCx += S_COL[4];

      // Tax amount in Total Price column
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(fmtCurrency(taxAmt), txCx + 6, y + (DATA_ROW_H - 9) / 2, { width: S_COL[5] - 12, align: 'right' });
      y += DATA_ROW_H;

      // Grand Total row (prominent highlight matching RFQ style)
      const GT_H = 28;
      ensureRowSpace(GT_H);
      doc.rect(margin, y, cW, GT_H).fill(COLORS.GT_BG);
      doc.lineWidth(1).rect(margin, y, cW, GT_H).strokeColor(COLORS.GT_BORDER).stroke();
      doc.lineWidth(1.2).moveTo(margin, y).lineTo(margin + cW, y).strokeColor(COLORS.GT_BORDER).stroke();
      const gtLabelW = cW - S_COL[5];
      doc.lineWidth(TABLE.DIVIDER_W).moveTo(margin + gtLabelW, y).lineTo(margin + gtLabelW, y + GT_H).strokeColor(COLORS.BORDER_MED).stroke();
      const gtMid = y + (GT_H - 9) / 2;
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
      doc.text('Grand Total', margin + 11, gtMid, { width: gtLabelW - 22, align: 'right', lineBreak: false });
      doc.text(fmtCurrency(grandTotal + taxAmt), margin + gtLabelW + 6, gtMid,
               { width: S_COL[5] - 12, align: 'right', lineBreak: false });
      y += GT_H;
      y += 12;

      // --------- SECTION 2: NOTES ------------------------------------------------------------------------------------------------
      if (po.notes && po.notes.trim()) {
        drawSectionTitlePO('2', 'Notes');
        const notesLines = po.notes.split('\n');
        notesLines.forEach(line => {
          if (!line.trim()) { y += 4; return; }
          const nlH = doc.fontSize(TABLE.DATA_FONT).font('Helvetica').heightOfString(line, { width: cW - 14 });
          checkPage(nlH + 6);
          doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text(line, margin + 8, y, { width: cW - 14, align: 'left' });
          y = doc.y + 2;
        });
        y += 8;
      }

      // --------- SECTION 3: TERMS AND CONDITIONS ---------------------------------------------------------------------------------
      drawSectionTitlePO(po.notes && po.notes.trim() ? '3' : '2', 'Terms And Conditions of Sale');

      // Default terms text (matches frontend DEFAULT_PO_TERMS)
      const defaultTermsText = [
        '1. Delivery Timeline:',
        'As per purchase order requirements. Seller will notify Buyer of any delays.',
        '',
        '2. Payment Terms:',
        'Net 30 days from invoice date unless otherwise agreed in writing.',
        '',
        '3. Taxation:',
        'All prices are exclusive of applicable taxes unless stated otherwise. Buyer is responsible for all applicable taxes.',
        '',
        '4. Confidentiality:',
        'Both parties agree to maintain confidentiality of all proprietary information exchanged in connection with this purchase order.',
      ].join('\n');

      const tcText = (po.terms_conditions && po.terms_conditions.trim()) ? po.terms_conditions : defaultTermsText;

      // Parse lines and render with bold titles (lines matching "N. Title:") and normal body
      const tcLines = tcText.split('\n');
      const titleRe = /^\d+\.\s+.+:$/;
      tcLines.forEach(line => {
        if (!line.trim()) { y += 4; return; }
        const isTitle = titleRe.test(line.trim());
        const tcLineH = doc.fontSize(isTitle ? TABLE.HDR_FONT : TABLE.DATA_FONT).font(isTitle ? 'Helvetica-Bold' : 'Helvetica')
                         .heightOfString(line, { width: cW - 14 });
        checkPage(tcLineH + 6);
        doc.fontSize(isTitle ? TABLE.HDR_FONT : TABLE.DATA_FONT).font(isTitle ? 'Helvetica-Bold' : 'Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(line, isTitle ? margin : margin + 14, y, { width: cW - 14, align: isTitle ? 'left' : 'justify' });
        y = doc.y + (isTitle ? 3 : 2);
      });

      // --------- FOOTER ---------
      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }
}

module.exports = new VendorProcurementService();
