const { Op } = require('sequelize');
const {
  sequelize,
  MgmtProcurementRFQ,
  MgmtProcurementPO,
  RawMaterial,
  Vendor,
  User,
  Stock,
} = require('../models');
const documentNumberingService = require('./documentNumberingService');

class MgmtProcurementService {
  // ═══════════════════════════════════════════════════════════════════════════
  //  RFQ Operations
  // ═══════════════════════════════════════════════════════════════════════════

  // async generateRFQNumber(companyId, { transaction, offset = 0 } = {}) {
  //   // Per-company sequence: each company gets its own RFQ-P-##### series.
  //   // Use MAX(rfq_number) within the company so deletions don't reuse numbers.
  //   const where = { company_id: companyId || null };
  //   const lastRfq = await MgmtProcurementRFQ.findOne({
  //     where,
  //     order: [['rfq_number', 'DESC']],
  //     ...(transaction ? { transaction } : {}),
  //   });
  //   let seq = 1;
  //   if (lastRfq && lastRfq.rfq_number) {
  //     const parts = lastRfq.rfq_number.split('-');
  //     const lastSeq = parseInt(parts[2] || '0', 10);
  //     if (!isNaN(lastSeq)) {
  //       seq = lastSeq + 1;
  //     }
  //   }
  //   const rfqNumber = `RFQ-P-${String(seq + offset).padStart(5, '0')}`;
  //   console.log(`Generated RFQ number: ${rfqNumber} (company: ${companyId || 'global'}, seq: ${seq}, offset: ${offset})`);
  //   return rfqNumber;

  async generateRFQNumber(companyId, _options) {
    return documentNumberingService.generateUniqueNumber(
      'client_po_number', companyId, MgmtProcurementRFQ, 'rfq_number'
    );
  }

  async getAllRFQs(query, user) {
    const where = { deleted_at: null };
    if (user.company_id) where.company_id = user.company_id;
    if (query.status) where.status = query.status;
    if (query.search) where.rfq_number = { [Op.iLike]: `%${query.search}%` };

    return MgmtProcurementRFQ.findAll({
      where,
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: MgmtProcurementPO, as: 'purchaseOrders', attributes: ['id', 'po_number', 'status'], where: { deleted_at: null }, required: false },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  async getRFQById(id) {
    const rfq = await MgmtProcurementRFQ.findByPk(id, {
      include: [
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone', 'address', 'contact_person', 'contact_position'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'position'] },
        { model: MgmtProcurementPO, as: 'purchaseOrders' },
      ],
    });
    if (!rfq) throw new Error('RFQ not found');
    return rfq;
  }

  /**
   * Create one or more RFQs.
   *
   * When multiple vendor_ids are supplied the system creates one independent
   * RFQ per vendor, each with its own RFQ-P-##### number and full snapshot.
   */
  async createRFQ(data, user) {
    console.log('createRFQ called with data:', JSON.stringify(data, null, 2));
    console.log('User:', { id: user?.id, company_id: user?.company_id });
    
    const t = await sequelize.transaction();
    try {
      // ── Support both legacy single-part and new multi-part payloads ──
      const items = Array.isArray(data.items) ? data.items : [];
      const isLegacySingle = items.length === 0 && data.part_id;

      console.log('Items count:', items.length, 'Is legacy single:', isLegacySingle);

      // Validate required fields
      if (!isLegacySingle && items.length === 0) throw new Error('At least 1 part must be added');
      if (isLegacySingle && (!data.quantity || Number(data.quantity) <= 0)) throw new Error('Quantity must be greater than 0');
      if (!data.vendor_ids || data.vendor_ids.length === 0) throw new Error('At least 1 vendor must be selected');

      // Validate each line item
      for (const item of items) {
        if (!item.part_id) throw new Error('Each line item must have a part selected');
        if (!item.quantity || Number(item.quantity) <= 0) throw new Error('Each line item quantity must be greater than 0');
      }

      console.log('Validation passed, building line items...');

      // Validate that all vendors exist
      for (const vendorId of data.vendor_ids) {
        const vendor = await Vendor.findByPk(vendorId);
        if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);
      }
      console.log('All vendors validated');

      // Build line_items snapshots from raw material master
      let lineItems = [];
      let primarySnapshot = {};

      if (isLegacySingle) {
        // Legacy: single part_id + quantity
        const rawMaterial = await RawMaterial.findByPk(data.part_id);
        if (!rawMaterial) throw new Error('Raw material not found in Raw Material Master');
        primarySnapshot = {
          part_id: rawMaterial.id,
          part_name: `${rawMaterial.material_category} — ${rawMaterial.material_grade}`,
          material_category: rawMaterial.material_category,
          material_grade: rawMaterial.material_grade,
          condition: rawMaterial.condition || null,
          density: rawMaterial.density,
          form: rawMaterial.form,
          shape: rawMaterial.shape,
          dimensions: rawMaterial.dimensions,
          weight_per_piece: null,
        };
        lineItems = [{
          ...primarySnapshot,
          quantity: Number(data.quantity),
        }];
      } else {
        // New multi-part: fetch raw material for each item
        for (const item of items) {
          const rm = await RawMaterial.findByPk(item.part_id);
          if (!rm) throw new Error(`Raw material not found for part_id: ${item.part_id}`);
          lineItems.push({
            part_id: rm.id,
            part_name: `${rm.material_category} — ${rm.material_grade}`,
            material_category: rm.material_category,
            material_grade: rm.material_grade,
            condition: rm.condition || null,
            density: rm.density,
            form: rm.form,
            shape: rm.shape,
            dimensions: rm.dimensions,
            weight_per_piece: null,
            quantity: Number(item.quantity),
          });
        }
        // Primary snapshot from first item (backward compat for PDF / listing)
        primarySnapshot = { ...lineItems[0] };
        delete primarySnapshot.quantity;
      }

      const totalQty = lineItems.reduce((sum, li) => sum + li.quantity, 0);
      console.log('Line items built, totalQty:', totalQty);

      const created = [];

      for (let i = 0; i < data.vendor_ids.length; i++) {
        const vendorId = data.vendor_ids[i];
        console.log(`Creating RFQ for vendor ${i + 1}/${data.vendor_ids.length}: ${vendorId}`);

        // Retry on unique-constraint collisions. The MAX(rfq_number)+1 strategy
        // can race against parallel saves OR collide with a legacy global unique
        // constraint that survives soft-deletes. We bump the offset and retry.
        // Each attempt runs in its own SAVEPOINT so a failed INSERT does not
        // poison the outer transaction.
        let rfq = null;
        let lastErr = null;
        let extraOffset = 0;
        for (let attempt = 0; attempt < 10; attempt++) {
          const rfqNumber = await this.generateRFQNumber(user.company_id, {
            transaction: t,
            offset: i + extraOffset,
          });

          const rfqData = {
            rfq_number: rfqNumber,
            date: data.date || new Date().toISOString().slice(0, 10),
            need_materials_before: data.need_materials_before || null,
            instructions: data.instructions || null,
            status: 'Draft',
            ...primarySnapshot,
            quantity: totalQty,
            line_items: lineItems,
            vendor_id: vendorId,
            parent_rfq_id: null,
            company_id: user.company_id,
            created_by: user.id,
          };

          try {
            // Nested transaction = SAVEPOINT. If it throws, only the savepoint
            // is rolled back; the outer transaction `t` remains usable.
            rfq = await sequelize.transaction({ transaction: t }, async (sp) => {
              return MgmtProcurementRFQ.create(rfqData, { transaction: sp });
            });
            console.log(`RFQ created with id: ${rfq.id} (rfq_number=${rfqNumber}, attempt=${attempt + 1})`);
            break;
          } catch (e) {
            lastErr = e;
            const isDup = e?.name === 'SequelizeUniqueConstraintError'
              || e?.original?.code === '23505'
              || /duplicate key|already exists/i.test(e?.message || '');
            if (!isDup) throw e;
            extraOffset += 1;
            console.warn(`RFQ number collision on ${rfqNumber}, retrying with offset+${extraOffset}`);
          }
        }

        if (!rfq) {
          throw lastErr || new Error('Failed to allocate a unique RFQ number after 10 attempts');
        }

        created.push(rfq);
      }

      // Link siblings via parent_rfq_id (first RFQ is the "parent")
      if (created.length > 1) {
        const parentId = created[0].id;
        for (const rfq of created) {
          await rfq.update({ parent_rfq_id: parentId }, { transaction: t });
        }
      }

      await t.commit();
      console.log('Transaction committed successfully');

      // Re-fetch with includes
      const result = [];
      for (const r of created) {
        const fetched = await this.getRFQById(r.id);
        result.push(fetched);
      }
      console.log(`createRFQ completed, returning ${result.length} RFQ(s)`);
      return result;
    } catch (err) {
      await t.rollback();
      console.error('createRFQ error:', err.message);
      console.error('Stack:', err.stack);
      throw err;
    }
  }

  async updateRFQ(id, data, user) {
    const rfq = await MgmtProcurementRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');

    const updates = {};
    if (data.date !== undefined) updates.date = data.date;
    if (data.need_materials_before !== undefined) updates.need_materials_before = data.need_materials_before;
    if (data.instructions !== undefined) updates.instructions = data.instructions;

    // Allow changing vendor
    if (data.vendor_id && data.vendor_id !== rfq.vendor_id) {
      const vendor = await Vendor.findByPk(data.vendor_id);
      if (!vendor) throw new Error('Vendor not found');
      updates.vendor_id = data.vendor_id;
    }

    // Multi-part items array
    const items = Array.isArray(data.items) ? data.items.filter(i => i.part_id && Number(i.quantity) > 0) : [];

    if (items.length > 0) {
      // Build line_items with fresh snapshots
      const lineItems = [];
      let totalQty = 0;
      for (const item of items) {
        const rm = await RawMaterial.findByPk(item.part_id);
        if (!rm) throw new Error(`Raw material ${item.part_id} not found`);
        const qty = Number(item.quantity);
        if (qty <= 0) throw new Error('Quantity must be greater than 0');
        totalQty += qty;
        lineItems.push({
          part_id: rm.id,
          part_name: `${rm.material_category} — ${rm.material_grade}`,
          material_category: rm.material_category,
          material_grade: rm.material_grade,
          density: rm.density,
          form: rm.form,
          shape: rm.shape,
          dimensions: rm.dimensions,
          weight_per_piece: null,
          quantity: qty,
        });
      }
      // Primary part for backward compat
      const primary = lineItems[0];
      updates.part_id = primary.part_id;
      updates.part_name = primary.part_name;
      updates.material_category = primary.material_category;
      updates.material_grade = primary.material_grade;
      updates.density = primary.density;
      updates.form = primary.form;
      updates.shape = primary.shape;
      updates.dimensions = primary.dimensions;
      updates.weight_per_piece = primary.weight_per_piece;
      updates.quantity = totalQty;
      updates.line_items = lineItems;
    } else {
      // Legacy single-part update
      if (data.quantity !== undefined) {
        if (Number(data.quantity) <= 0) throw new Error('Quantity must be greater than 0');
        updates.quantity = data.quantity;
      }
      if (data.part_id && data.part_id !== rfq.part_id) {
        const rawMaterial = await RawMaterial.findByPk(data.part_id);
        if (!rawMaterial) throw new Error('Raw material not found in Raw Material Master');
        updates.part_id = rawMaterial.id;
        updates.part_name = `${rawMaterial.material_category} — ${rawMaterial.material_grade}`;
        updates.material_category = rawMaterial.material_category;
        updates.material_grade = rawMaterial.material_grade;
        updates.density = rawMaterial.density;
        updates.form = rawMaterial.form;
        updates.shape = rawMaterial.shape;
        updates.dimensions = rawMaterial.dimensions;
        updates.weight_per_piece = null;
      }
    }

    await rfq.update(updates);
    return this.getRFQById(id);
  }

  async sendRFQ(id) {
    const rfq = await MgmtProcurementRFQ.findByPk(id);
    if (!rfq) throw new Error('RFQ not found');
    if (rfq.status !== 'Draft') throw new Error('RFQ has already been sent');
    await rfq.update({ status: 'Sent' });
    return this.getRFQById(id);
  }

  async deleteRFQ(id, { force = false, userId = null } = {}) {
    const rfq = await MgmtProcurementRFQ.findByPk(id, {
      include: [{ model: MgmtProcurementPO, as: 'purchaseOrders' }],
    });
    if (!rfq) throw new Error('RFQ not found');

    const linkedPOs = (rfq.purchaseOrders || []).filter(p => !p.deleted_at);
    if (linkedPOs.length > 0 && !force) {
      const poNumbers = linkedPOs.map(p => p.po_number).join(', ');
      const err = new Error(`Cannot delete RFQ with existing Purchase Orders: ${poNumbers}. Use force delete to remove RFQ and its linked POs.`);
      err.code = 'HAS_LINKED_POS';
      err.linkedPOs = linkedPOs.map(p => ({ id: p.id, po_number: p.po_number, status: p.status }));
      throw err;
    }

    const now = new Date();
    // Soft-delete linked POs
    if (linkedPOs.length > 0) {
      await MgmtProcurementPO.update({ deleted_at: now, deleted_by: userId }, { where: { rfq_id: id, deleted_at: null } });
    }
    await rfq.update({ deleted_at: now, deleted_by: userId });
    return { message: 'RFQ deleted', status: rfq.status, deletedPOs: linkedPOs.length };
  }

  async copyRFQ(id, user) {
    const source = await this.getRFQById(id);
    const rfqNumber = await this.generateRFQNumber(user.company_id);
    const copy = await MgmtProcurementRFQ.create({
      rfq_number: rfqNumber,
      date: new Date().toISOString().slice(0, 10),
      need_materials_before: source.need_materials_before,
      instructions: source.instructions,
      status: 'Draft',
      part_id: source.part_id,
      part_name: source.part_name,
      material_category: source.material_category,
      material_grade: source.material_grade,
      density: source.density,
      form: source.form,
      shape: source.shape,
      dimensions: source.dimensions,
      weight_per_piece: source.weight_per_piece,
      quantity: source.quantity,
      line_items: source.line_items || null,
      vendor_id: source.vendor_id,
      parent_rfq_id: null,
      company_id: user.company_id,
      created_by: user.id,
    });
    return this.getRFQById(copy.id);
  }

  async bulkDeleteRFQs(ids, { force = false, userId = null } = {}) {
    const rfqs = await MgmtProcurementRFQ.findAll({
      where: { id: { [Op.in]: ids }, deleted_at: null },
      include: [{ model: MgmtProcurementPO, as: 'purchaseOrders' }],
    });
    if (rfqs.length === 0) throw new Error('No RFQs found');

    const withPOs = rfqs.filter(r => (r.purchaseOrders || []).some(p => !p.deleted_at));
    if (withPOs.length > 0 && !force) {
      const err = new Error(`Cannot delete ${withPOs.length} RFQ(s) that have Purchase Orders: ${withPOs.map(r => r.rfq_number).join(', ')}. Use force delete to remove them with linked POs.`);
      err.code = 'HAS_LINKED_POS';
      err.rfqsWithPOs = withPOs.map(r => r.rfq_number);
      throw err;
    }

    const now = new Date();
    // Soft-delete linked POs
    if (withPOs.length > 0) {
      const rfqIdsWithPOs = withPOs.map(r => r.id);
      await MgmtProcurementPO.update({ deleted_at: now, deleted_by: userId }, { where: { rfq_id: { [Op.in]: rfqIdsWithPOs }, deleted_at: null } });
    }
    await MgmtProcurementRFQ.update({ deleted_at: now, deleted_by: userId }, { where: { id: { [Op.in]: ids } } });
    return { message: `${rfqs.length} RFQ(s) deleted`, deleted: rfqs.length };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RFQ PDF Generation (uses locked global template)
  // ═══════════════════════════════════════════════════════════════════════════

  async generateRFQPdf(id) {
    const PDFDocument = require('pdfkit');
    const settingsService = require('./settingsService');
    const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
    const { COLORS } = require('../utils/pdfTemplate');

    const rfq = await this.getRFQById(id);
    const companySettings = await settingsService.getCompanySettings(rfq.company_id);

    // Pre-fetch raw material data for condition and unit_system for each line item
    const lineItems = Array.isArray(rfq.line_items) && rfq.line_items.length > 0
      ? rfq.line_items
      : [{
          part_id: rfq.part_id,
          material_category: rfq.material_category,
          material_grade: rfq.material_grade,
          shape: rfq.shape,
          dimensions: rfq.dimensions,
          quantity: rfq.quantity,
        }];

    // Fetch condition + unit_system for each unique part_id
    const partIds = [...new Set(lineItems.map(li => li.part_id).filter(Boolean))];
    const rmLookup = {};
    for (const pid of partIds) {
      const rm = await RawMaterial.findByPk(pid, { attributes: ['id', 'condition', 'unit_system'] });
      if (rm) rmLookup[pid] = { condition: rm.condition || '', unit_system: rm.unit_system || 'imperial' };
    }

    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: `${(rfq.rfq_number || 'RFQ').replace(/[^a-zA-Z0-9_\-]/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`,
      }));
      doc.on('error', reject);

      const M = SIDE_MARGIN;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW = pageW - 2 * M;
      const FOOTER_H = 55;
      const BDR = 0.5;
      const ROW_H = 16;

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - 10) { doc.addPage(); y = M; }
      };
      const drawHDiv = (x1, x2, yy) =>
        doc.lineWidth(BDR).moveTo(x1, yy).lineTo(x2, yy).strokeColor('#000000').stroke();
      const drawVDiv = (x, y1, y2) =>
        doc.lineWidth(BDR).moveTo(x, y1).lineTo(x, y2).strokeColor('#000000').stroke();

      // ── HEADER ──
      let y = drawGlobalHeader(doc, companySettings, 'Request for Quotation');
      y += 4;

      // ── TO / PREPARED BY ──
      const leftW = Math.round(cW * 0.533);
      const rightW = cW - leftW;
      const vendor = rfq.vendor || {};
      const labelRowH = 18;
      const contactRowH = 14;
      const spacerH = 8;

      const contactLines = [
        { left: vendor.vendor_name || '', right: companySettings.name || '', bold: true },
        { left: vendor.address || '', right: companySettings.address || '', bold: false },
        { left: `POC: ${vendor.contact_person || '-'}${vendor.contact_position ? ' | ' + vendor.contact_position : ''}`, right: `POC: ${rfq.creator?.name || '-'}${rfq.creator?.position ? ' | ' + rfq.creator.position : ''}`, bold: false },
        { left: `Email: ${vendor.contact_email || '-'}`, right: `Email: ${companySettings.email || '-'}`, bold: false },
        { left: `Phone: ${vendor.contact_phone || '-'}`, right: `Phone: ${companySettings.phone || '-'}`, bold: false },
      ].filter(l => l.left || l.right);

      const contactRowHeights = contactLines.map(line => {
        doc.fontSize(8).font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
        const lH = line.left ? doc.heightOfString(line.left, { width: leftW - 12 }) + 6 : contactRowH;
        const rH = line.right ? doc.heightOfString(line.right, { width: rightW - 12 }) + 6 : contactRowH;
        return Math.max(contactRowH, Math.ceil(lH), Math.ceil(rH));
      });
      const contactBlockH = contactRowHeights.reduce((a, b) => a + b, 0);
      const totalTableH = labelRowH + contactBlockH + spacerH + ROW_H * 2;
      checkPage(totalTableH);

      // Row 0: Green header
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

      y += spacerH;
      drawHDiv(M, M + cW, y);

      doc.lineWidth(BDR).rect(M, y - contactBlockH - spacerH - labelRowH, cW, totalTableH).strokeColor('#000000').stroke();
      drawVDiv(M + leftW, y - contactBlockH - spacerH - labelRowH, y - contactBlockH - spacerH - labelRowH + totalTableH);

      // RFQ No | RFQ Date
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('RFQ No', M + 6, y + (ROW_H - 8) / 2, { width: 70, lineBreak: false });
      doc.text(`:   ${rfq.rfq_number || '---'}`, M + 76, y + (ROW_H - 8) / 2, { width: leftW - 82, lineBreak: false });
      doc.text('RFQ Date', M + leftW + 6, y + (ROW_H - 8) / 2, { width: 70, lineBreak: false });
      doc.text(`:  ${fmtDate(rfq.date)}`, M + leftW + 76, y + (ROW_H - 8) / 2, { width: rightW - 82, lineBreak: false });
      y += ROW_H;
      drawHDiv(M, M + cW, y);

      // Need Material Before
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('Need Before', M + 6, y + (ROW_H - 8) / 2, { width: 80, lineBreak: false });
      doc.text(`:   ${fmtDate(rfq.need_materials_before) || 'As soon as possible'}`, M + 86, y + (ROW_H - 8) / 2, { width: leftW - 92, lineBreak: false });
      y += ROW_H;
      y += 10;

      // ── SUMMARY TABLE ──
      checkPage(30);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
         .text('1. Summary', M, y);
      y = doc.y + 6;

      const S_COLS = [Math.round(cW * 0.07), 0, Math.round(cW * 0.13)];
      S_COLS[1] = cW - S_COLS[0] - S_COLS[2];
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
        if (i < sHdrs.length - 1) {
          doc.lineWidth(0.3).moveTo(hx + S_COLS[i], y).lineTo(hx + S_COLS[i], y + TH_H).strokeColor('#FFFFFF').stroke();
        }
        hx += S_COLS[i];
      });
      y += TH_H;

      // Data rows for each line item
      const buildDimString = (dims, unitSys) => {
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
      };
      const DATA_ROW_H = 22;

      lineItems.forEach((li, idx) => {
        const rmInfo = rmLookup[li.part_id] || { condition: '', unit_system: 'imperial' };
        const dimStr = buildDimString(li.dimensions, rmInfo.unit_system);
        const desc = [li.material_category, li.material_grade, li.shape, rmInfo.condition, dimStr].filter(Boolean).join(' | ');
        const qty = String(li.quantity || '---');

        doc.fontSize(8).font('Helvetica');
        const descH = doc.heightOfString(desc, { width: S_COLS[1] - 8 });
        const rowH = Math.max(DATA_ROW_H, Math.ceil(descH) + 8);
        checkPage(rowH);

        const bgColor = idx % 2 === 0 ? COLORS.ROW_WHITE : (COLORS.ROW_ALT || '#F5F5F5');
        doc.rect(M, y, cW, rowH).fill(bgColor);
        doc.lineWidth(0.5).rect(M, y, cW, rowH).strokeColor('#000000').stroke();

        const cells = [String(idx + 1), desc, qty];
        let rx = M;
        cells.forEach((txt, i) => {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text(txt, rx + 4, y + 4, { width: S_COLS[i] - 8, align: sAligns[i], lineBreak: true });
          if (i < cells.length - 1) {
            doc.lineWidth(0.3).moveTo(rx + S_COLS[i], y).lineTo(rx + S_COLS[i], y + rowH).strokeColor('#999999').stroke();
          }
          rx += S_COLS[i];
        });
        y += rowH;
      });
      y += 12;

      // ── INSTRUCTIONS ──
      const instrText = rfq.instructions || '';
      const instrNotes = instrText.split('\n').filter(Boolean);

      if (instrNotes.length > 0) {
        checkPage(30);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
           .text('2. Instructions', M, y);
        y = doc.y + 6;
        instrNotes.forEach(n => {
          if (!n) return;
          checkPage(20);
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text('\u2022  ' + n.trim(), M + 8, y, { width: cW - 16, align: 'justify' });
          y = doc.y + 4;
        });
      }

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RFQ Email
  // ═══════════════════════════════════════════════════════════════════════════

  async sendRFQEmail(id) {
    const { sendEmail, isSmtpConfigured, isValidEmail } = require('../utils/emailService');
    const settingsService = require('./settingsService');

    const rfq = await this.getRFQById(id);

    const vendor = rfq.vendor;
    if (!vendor || !vendor.contact_email) {
      throw new Error('Vendor does not have an email address. Please update vendor details first.');
    }

    if (!isValidEmail(vendor.contact_email)) {
      throw new Error(`Vendor email "${vendor.contact_email}" is not a valid email address.`);
    }

    if (!isSmtpConfigured()) {
      throw new Error('Email service is not configured. Please configure SMTP settings in environment variables.');
    }

    const pdf = await this.generateRFQPdf(id);
    const companySettings = await settingsService.getCompanySettings(rfq.company_id);

    const isResend = rfq.status === 'Sent';
    const subject = isResend
      ? `Revised RFQ – ${rfq.rfq_number}`
      : `RFQ ${rfq.rfq_number}`;

    const html = isResend
      ? `
      <p>Dear ${vendor.contact_person || vendor.vendor_name},</p>
      <p>This is an updated version of the previously shared Request for Quotation <strong>${rfq.rfq_number}</strong>.</p>
      <p>Please disregard the earlier version and refer to the updated details attached.</p>
      <p>Kindly review and proceed accordingly.</p>
      <br/>
      <p>Best Regards,<br/>${companySettings.name || 'Forge i-DAS'}</p>
    `
      : `
      <p>Dear ${vendor.contact_person || vendor.vendor_name},</p>
      <p>Please find attached the Request for Quotation <strong>${rfq.rfq_number}</strong>.</p>
      <p>Kindly review and provide your best quotation at the earliest.</p>
      <br/>
      <p>Best Regards,<br/>${companySettings.name || 'Forge i-DAS'}</p>
    `;

    const result = await sendEmail({
      to: vendor.contact_email,
      subject,
      html,
      attachments: [{ filename: pdf.filename, content: pdf.buffer }],
    });

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error || 'Unknown error'}`);
    }

    // Only mark as Sent after successful email delivery
    if (rfq.status === 'Draft') {
      await rfq.update({ status: 'Sent' });
    }

    return { sent: true, emailResult: result, rfq: await this.getRFQById(id) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PO Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async generatePONumber(companyId) {
    return documentNumberingService.generateUniqueNumber(
      'vendor_po_number', companyId, MgmtProcurementPO, 'po_number'
    );
  }

  async getAllPOs(query, user) {
    const where = { deleted_at: null };
    if (user.company_id) where.company_id = user.company_id;
    if (query.status) where.status = query.status;
    if (query.search) where.po_number = { [Op.iLike]: `%${query.search}%` };

    const pos = await MgmtProcurementPO.findAll({
      where,
      include: [
        { model: MgmtProcurementRFQ, as: 'rfq', attributes: ['id', 'rfq_number', 'part_name', 'material_category', 'material_grade', 'quantity', 'weight_per_piece', 'part_id'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    // Enrich with unit_system from raw material for display formatting
    const partIds = [...new Set(pos.map(p => p.rfq?.part_id).filter(Boolean))];
    let unitMap = {};
    if (partIds.length > 0) {
      const rms = await RawMaterial.findAll({ where: { id: { [Op.in]: partIds } }, attributes: ['id', 'unit_system'] });
      unitMap = rms.reduce((m, rm) => { m[rm.id] = rm.unit_system || 'imperial'; return m; }, {});
    }
    return pos.map(p => {
      const plain = p.toJSON();
      plain.unit_system = unitMap[plain.rfq?.part_id] || 'imperial';
      return plain;
    });
  }

  async getPOById(id) {
    const po = await MgmtProcurementPO.findByPk(id, {
      include: [
        { model: MgmtProcurementRFQ, as: 'rfq' },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name', 'contact_email', 'contact_phone', 'address', 'contact_person', 'contact_position'] },
        { model: User, as: 'creator', attributes: ['id', 'name', 'position'] },
      ],
    });
    if (!po) throw new Error('Purchase Order not found');
    return po;
  }

  async createPO(data, user) {
    if (!data.rfq_id) throw new Error('RFQ must be selected');

    const rfq = await this.getRFQById(data.rfq_id);
    if (rfq.status !== 'Sent') throw new Error('PO can only be created from Sent RFQs');

    // Check if PO already exists for this RFQ (exclude soft-deleted)
    const existing = await MgmtProcurementPO.findOne({ where: { rfq_id: data.rfq_id, deleted_at: null } });
    if (existing) throw new Error('A PO already exists for this RFQ');

    const poNumber = await this.generatePONumber(user.company_id);
    const costMode = data.cost_mode || 'unit';
    const taxType = data.tax_type || 'Exempt';

    // ── Build line items from RFQ + per-line costs from request ──
    const rfqLineItems = Array.isArray(rfq.line_items) && rfq.line_items.length > 0
      ? rfq.line_items
      : [{
          part_id: rfq.part_id,
          part_name: rfq.part_name,
          material_category: rfq.material_category,
          material_grade: rfq.material_grade,
          quantity: parseFloat(rfq.quantity) || 0,
        }];

    const requestItems = Array.isArray(data.items) ? data.items : [];

    const lineItems = rfqLineItems.map((rfqItem, idx) => {
      // Match request item by index (items come in same order as RFQ)
      const reqItem = requestItems[idx] || {};
      const qty = parseFloat(reqItem.quantity) || parseFloat(rfqItem.quantity) || 0;
      const weight = parseFloat(reqItem.weight) || 0;
      const unitCost = parseFloat(reqItem.unit_cost) || 0;
      const costPerWeight = parseFloat(reqItem.cost_per_weight) || 0;
      const weightUnit = reqItem.weight_unit || 'KG';

      let lineTotal = 0;
      if (costMode === 'weight') {
        lineTotal = qty * weight * costPerWeight;
      } else {
        lineTotal = qty * unitCost;
      }

      return {
        part_id: rfqItem.part_id || null,
        part_name: rfqItem.part_name || '',
        material_category: rfqItem.material_category || '',
        material_grade: rfqItem.material_grade || '',
        condition: reqItem.condition || rfqItem.condition || '',
        form: reqItem.form || rfqItem.form || '',
        dimensions: reqItem.dimensions || rfqItem.dimensions || null,
        unit_system: reqItem.unit_system || rfqItem.unit_system || 'imperial',
        quantity: qty,
        weight,
        unit_cost: unitCost,
        cost_per_weight: costPerWeight,
        weight_unit: weightUnit,
        line_total: parseFloat(lineTotal.toFixed(2)),
      };
    });

    const subtotal = lineItems.reduce((sum, li) => sum + (li.line_total || 0), 0);
    const totalQty = lineItems.reduce((sum, li) => sum + (li.quantity || 0), 0);
    const totalWeight = lineItems.reduce((sum, li) => sum + (li.weight || 0), 0);

    let taxPct = 0;
    if (taxType === '5%') taxPct = 0.05;
    else if (taxType === '12%') taxPct = 0.12;
    else if (taxType === '18%') taxPct = 0.18;
    const taxAmount = subtotal * taxPct;
    const grandTotal = subtotal + taxAmount;

    // Use first line item for backward-compat top-level snapshot
    const primary = lineItems[0] || {};

    // Concurrency-safe insert: retry with a freshly generated PO number when
    // we hit the per-company unique index. The MAX-suffix generator is
    // collision-safe vs soft-deleted rows but two parallel requests can still
    // reach the same number — the unique index catches that and we just bump.
    let po;
    let attemptPoNumber = poNumber;
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        po = await MgmtProcurementPO.create({
          po_number: attemptPoNumber,
          rfq_id: rfq.id,
          vendor_id: rfq.vendor_id,
          po_date: data.po_date || new Date().toISOString().slice(0, 10),
          tax_type: taxType,
          part_name: primary.part_name || rfq.part_name,
          material_category: primary.material_category || rfq.material_category,
          material_grade: primary.material_grade || rfq.material_grade,
          quantity: totalQty,
          weight_per_piece: rfq.weight_per_piece,
          total_weight: totalWeight,
          cost_mode: costMode,
          unit_cost: primary.unit_cost || null,
          cost_per_weight: primary.cost_per_weight || null,
          weight_unit: data.weight_unit || 'KG',
          line_total: subtotal,
          line_items: lineItems,
          subtotal,
          tax_amount: taxAmount,
          grand_total: grandTotal,
          status: 'Draft',
          notes: data.notes || null,
          terms_conditions: data.terms_conditions || null,
          condition: rfq.condition || null,
          form: rfq.form || null,
          shape: rfq.shape || null,
          dimensions: rfq.dimensions || null,
          company_id: user.company_id,
          created_by: user.id,
        });
        break;
      } catch (err) {
        const isPoNumberDup = err?.name === 'SequelizeUniqueConstraintError'
          && (err?.errors?.some(e => e.path === 'po_number') || /po_number/i.test(err?.parent?.detail || ''));
        if (!isPoNumberDup || attempt === maxRetries - 1) throw err;
        attemptPoNumber = await this.generatePONumber(user.company_id);
      }
    }

    return this.getPOById(po.id);
  }

  async updatePO(id, data) {
    const po = await MgmtProcurementPO.findByPk(id);
    if (!po) throw new Error('PO not found');
    if (!['Draft'].includes(po.status)) throw new Error('Only Draft POs can be edited');

    const updates = {};
    if (data.po_date !== undefined) updates.po_date = data.po_date;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.terms_conditions !== undefined) updates.terms_conditions = data.terms_conditions;
    if (data.tax_type !== undefined) updates.tax_type = data.tax_type;
    if (data.cost_mode !== undefined) updates.cost_mode = data.cost_mode;
    if (data.weight_unit !== undefined) updates.weight_unit = data.weight_unit;

    const costMode = data.cost_mode || po.cost_mode || 'unit';

    // ── Multi-line items update ──
    if (Array.isArray(data.items) && data.items.length > 0) {
      const lineItems = data.items.map(item => {
        const qty = parseFloat(item.quantity) || 0;
        const weight = parseFloat(item.weight) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        const costPerWeight = parseFloat(item.cost_per_weight) || 0;
        const weightUnit = item.weight_unit || 'KG';

        let lineTotal = 0;
        if (costMode === 'weight') {
          lineTotal = qty * weight * costPerWeight;
        } else {
          lineTotal = qty * unitCost;
        }

        return {
          part_id: item.part_id || null,
          part_name: item.part_name || '',
          material_category: item.material_category || '',
          material_grade: item.material_grade || '',
          condition: item.condition || '',
          form: item.form || '',
          dimensions: item.dimensions || null,
          unit_system: item.unit_system || 'imperial',
          quantity: qty,
          weight,
          unit_cost: unitCost,
          cost_per_weight: costPerWeight,
          weight_unit: weightUnit,
          line_total: parseFloat(lineTotal.toFixed(2)),
        };
      });

      updates.line_items = lineItems;
      updates.quantity = lineItems.reduce((s, li) => s + (li.quantity || 0), 0);
      updates.total_weight = lineItems.reduce((s, li) => s + (li.weight || 0), 0);

      const subtotal = lineItems.reduce((s, li) => s + (li.line_total || 0), 0);
      updates.line_total = subtotal;
      updates.subtotal = subtotal;

      // Use first item for backward-compat top-level fields
      const primary = lineItems[0] || {};
      updates.unit_cost = primary.unit_cost || null;
      updates.cost_per_weight = primary.cost_per_weight || null;
      updates.part_name = primary.part_name || po.part_name;
      updates.material_category = primary.material_category || po.material_category;
      updates.material_grade = primary.material_grade || po.material_grade;
    } else {
      // Legacy single-item update (backward compat)
      if (data.unit_cost !== undefined) updates.unit_cost = parseFloat(data.unit_cost) || null;
      if (data.cost_per_weight !== undefined) updates.cost_per_weight = parseFloat(data.cost_per_weight) || null;
      if (data.quantity !== undefined) updates.quantity = data.quantity;
      if (data.weight !== undefined) updates.total_weight = parseFloat(data.weight) || po.total_weight;

      const qty = parseFloat(updates.quantity || po.quantity) || 0;
      const weight = parseFloat(updates.total_weight || po.total_weight) || 0;
      let lineTotal = 0;
      if (costMode === 'weight') {
        lineTotal = weight * (parseFloat(updates.cost_per_weight || po.cost_per_weight) || 0);
      } else {
        lineTotal = qty * (parseFloat(updates.unit_cost || po.unit_cost) || 0);
      }
      if (lineTotal > 0) {
        updates.line_total = lineTotal;
        updates.subtotal = lineTotal;
      } else if (data.subtotal !== undefined) {
        updates.subtotal = parseFloat(data.subtotal) || 0;
        updates.line_total = updates.subtotal;
      }
    }

    // Recalculate tax
    const subtotal = updates.subtotal !== undefined ? updates.subtotal : (po.subtotal || 0);
    const taxType = updates.tax_type || po.tax_type || 'Exempt';
    let taxPct = 0;
    if (taxType === '5%') taxPct = 0.05;
    else if (taxType === '12%') taxPct = 0.12;
    else if (taxType === '18%') taxPct = 0.18;
    updates.tax_amount = subtotal * taxPct;
    updates.grand_total = subtotal + updates.tax_amount;

    await po.update(updates);
    return this.getPOById(id);
  }

  async copyPO(id, user) {
    const source = await this.getPOById(id);

    const poNumber = await this.generatePONumber(user.company_id);

    const copy = await MgmtProcurementPO.create({
      po_number:         poNumber,
      po_date:           new Date().toISOString().slice(0, 10),
      rfq_id:            source.rfq_id,
      vendor_id:         source.vendor_id,
      status:            'Draft',
      cost_mode:         source.cost_mode         || 'unit',
      weight_unit:       source.weight_unit        || 'KG',
      tax_type:          source.tax_type           || 'Exempt',
      tax_amount:        source.tax_amount         || 0,
      notes:             source.notes              || null,
      terms_conditions:  source.terms_conditions   || null,
      // Line items — deep copy so edits on the copy don't affect source
      line_items:        source.line_items
                           ? JSON.parse(JSON.stringify(source.line_items))
                           : null,
      // Top-level snapshot fields (backward compat)
      part_id:           source.part_id            || null,
      part_name:         source.part_name          || null,
      material_category: source.material_category  || null,
      material_grade:    source.material_grade     || null,
      dimensions:        source.dimensions
                           ? JSON.parse(JSON.stringify(source.dimensions))
                           : null,
      quantity:          source.quantity           || 0,
      total_weight:      source.total_weight       || 0,
      unit_cost:         source.unit_cost          || null,
      cost_per_weight:   source.cost_per_weight    || null,
      line_total:        source.line_total         || 0,
      subtotal:          source.subtotal           || 0,
      grand_total:       source.grand_total        || 0,
      company_id:        user.company_id,
      created_by:        user.id,
    });

    return this.getPOById(copy.id);
  }

  async sendPO(id) {
    const po = await MgmtProcurementPO.findByPk(id);
    if (!po) throw new Error('PO not found');
    if (po.status !== 'Draft') throw new Error('PO has already been sent');
    await po.update({ status: 'Sent' });
    return this.getPOById(id);
  }

  async markOrdered(id) {
    const po = await MgmtProcurementPO.findByPk(id);
    if (!po) throw new Error('PO not found');
    if (!['Sent', 'Draft'].includes(po.status)) throw new Error('Cannot mark as Ordered from current status');
    await po.update({ status: 'Ordered' });
    return this.getPOById(id);
  }

  async markReceived(id) {
    const po = await MgmtProcurementPO.findByPk(id);
    if (!po) throw new Error('PO not found');
    if (!['Sent', 'Ordered'].includes(po.status)) throw new Error('Only Sent or Ordered POs can be marked Received');
    await po.update({ status: 'Received' });

    // Copy ALL line items to Material Stock as separate entries
    try {
      // Resolve line items: multi-line or legacy single-item fallback
      const items = Array.isArray(po.line_items) && po.line_items.length > 0
        ? po.line_items
        : [{
            part_id: po.part_id || null,
            part_name: po.part_name,
            material_category: po.material_category,
            material_grade: po.material_grade,
            dimensions: po.dimensions,
            condition: po.condition,
            form: po.form,
            shape: po.shape,
            quantity: po.quantity,
          }];

      // Fetch linked RFQ for per-item dimensions/condition/form/shape
      // (PO line_items may not carry these fields)
      let rfqLineItems = [];
      if (po.rfq_id) {
        const rfq = await MgmtProcurementRFQ.findByPk(po.rfq_id);
        if (rfq && Array.isArray(rfq.line_items)) {
          rfqLineItems = rfq.line_items;
        }
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Match RFQ line item by part_id first, then by index
        const rfqItem = rfqLineItems.find(r => r.part_id && r.part_id === item.part_id) || rfqLineItems[i] || {};

        // Build part_description (category) and material_grade (grade) separately
        // Frontend description = "category | grade | condition | shape | dimension"
        const partDescription = item.material_category || item.part_name || 'Unknown';
        const materialGrade = item.material_grade || rfqItem.material_grade || '';
        const dims = item.dimensions || rfqItem.dimensions || po.dimensions || {};
        const dimVals = [dims.length, dims.width, dims.height, dims.thickness, dims.diameter,
          dims.outer_diameter, dims.inner_diameter, dims.across_flats, dims.side].filter(Boolean);
        const dimension = dimVals.length > 0 ? dimVals.join(' x ') + ' mm' : '';
        const quantity = parseFloat(item.quantity) || 0;

        if (quantity > 0) {
          let stockId;
          try {
            stockId = await documentNumberingService.generateNumber('material_stock_entry_id', po.company_id || null);
          } catch (e) {
            console.warn('Failed to generate stock_id:', e.message);
          }

          // Resolve raw_material_id from part_id (RawMaterial UUID) in line item, or match by grade
          let rawMaterialId = item.part_id || rfqItem.part_id || null;
          if (!rawMaterialId && materialGrade) {
            const where = { material_grade: { [Op.iLike]: materialGrade.trim() } };
            if (po.company_id) where.company_id = po.company_id;
            const rm = await RawMaterial.findOne({ where, attributes: ['id'] });
            if (rm) rawMaterialId = rm.id;
          }

          await Stock.create({
            stock_id: stockId || null,
            part_description: partDescription,
            material_grade: materialGrade,
            condition: item.condition || rfqItem.condition || po.condition || null,
            shape: item.shape || rfqItem.shape || po.shape || null,
            dimension: dimension || '',
            quantity,
            raw_material_id: rawMaterialId,
            company_id: po.company_id || null,
            created_by: po.created_by || null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to copy received PO to material stock:', err.message);
    }

    return this.getPOById(id);
  }

  async deletePO(id, userId = null) {
    const po = await MgmtProcurementPO.findByPk(id);
    if (!po) throw new Error('PO not found');
    if (!['Draft', 'Sent'].includes(po.status)) throw new Error('Only Draft or Sent POs can be deleted');
    await po.update({ deleted_at: new Date(), deleted_by: userId });
    return { message: 'PO deleted' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PO PDF Generation (uses locked global template)
  // ═══════════════════════════════════════════════════════════════════════════

  async generatePOPdf(id) {
    const PDFDocument = require('pdfkit');
    const settingsService = require('./settingsService');
    const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
    const { COLORS } = require('../utils/pdfTemplate');

    const po = await this.getPOById(id);

    // ── Resolve line items (multi-line or legacy single-item fallback) ──
    let poLineItems = Array.isArray(po.line_items) && po.line_items.length > 0
      ? po.line_items
      : [];
    // Fallback for legacy single-item POs that predate the line_items column
    if (poLineItems.length === 0 && (po.material_category || po.part_name)) {
      poLineItems = [{
        part_name: po.part_name || '',
        material_category: po.material_category || '',
        material_grade: po.material_grade || '',
        quantity: parseFloat(po.quantity) || 0,
        weight: parseFloat(po.total_weight) || 0,
        unit_cost: parseFloat(po.unit_cost) || 0,
        cost_per_weight: parseFloat(po.cost_per_weight) || 0,
        weight_unit: po.weight_unit || 'KG',
        line_total: parseFloat(po.line_total) || parseFloat(po.subtotal) || 0,
      }];
    }
    if (poLineItems.length === 0) {
      const err = new Error('Cannot generate PO PDF: Purchase Order has no line items');
      err.statusCode = 400;
      throw err;
    }

    const companySettings = await settingsService.getCompanySettings(po.company_id);

    const fmtDate = (d) => {
      if (!d) return '---';
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    };
    const fmtCurrency = (v) => {
      const n = parseFloat(v) || 0;
      return `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: `${(po.po_number || 'PO').replace(/[^a-zA-Z0-9_\-]/g, '-')}_${new Date().toISOString().slice(0, 10)}.pdf`,
      }));
      doc.on('error', reject);

      const M = SIDE_MARGIN;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW = pageW - 2 * M;
      const FOOTER_H = 55;
      const BDR = 0.5;
      const ROW_H = 16;

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - 10) { doc.addPage(); y = M; }
      };
      const drawHDiv = (x1, x2, yy) =>
        doc.lineWidth(BDR).moveTo(x1, yy).lineTo(x2, yy).strokeColor('#000000').stroke();
      const drawVDiv = (x, y1, y2) =>
        doc.lineWidth(BDR).moveTo(x, y1).lineTo(x, y2).strokeColor('#000000').stroke();

      // ── HEADER ──
      let y = drawGlobalHeader(doc, companySettings, 'Purchase Order');
      y += 4;

      // ── TO / PREPARED BY ──
      const leftW = Math.round(cW * 0.533);
      const rightW = cW - leftW;
      const vendor = po.vendor || {};
      const labelRowH = 18;
      const contactRowH = 14;
      const spacerH = 8;

      const contactLines = [
        { left: vendor.vendor_name || '', right: companySettings.name || '', bold: true },
        { left: vendor.address || '', right: companySettings.address || '', bold: false },
        { left: `POC: ${vendor.contact_person || '-'}${vendor.contact_position ? ' | ' + vendor.contact_position : ''}`, right: `POC: ${po.creator?.name || '-'}${po.creator?.position ? ' | ' + po.creator.position : ''}`, bold: false },
        { left: `Email: ${vendor.contact_email || '-'}`, right: `Email: ${companySettings.email || '-'}`, bold: false },
        { left: `Phone: ${vendor.contact_phone || '-'}`, right: `Phone: ${companySettings.phone || '-'}`, bold: false },
      ].filter(l => l.left || l.right);

      const contactRowHeights = contactLines.map(line => {
        doc.fontSize(8).font(line.bold ? 'Helvetica-Bold' : 'Helvetica');
        const lH = line.left ? doc.heightOfString(line.left, { width: leftW - 12 }) + 6 : contactRowH;
        const rH = line.right ? doc.heightOfString(line.right, { width: rightW - 12 }) + 6 : contactRowH;
        return Math.max(contactRowH, Math.ceil(lH), Math.ceil(rH));
      });
      const contactBlockH = contactRowHeights.reduce((a, b) => a + b, 0);
      const totalTableH = labelRowH + contactBlockH + spacerH + ROW_H * 2;
      checkPage(totalTableH);

      // Row 0: Dark header (matches RFQ)
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

      y += spacerH;
      drawHDiv(M, M + cW, y);

      // Outer border + vertical divider for contact block (identical to RFQ)
      doc.lineWidth(BDR).rect(M, y - contactBlockH - spacerH - labelRowH, cW, totalTableH).strokeColor('#000000').stroke();
      drawVDiv(M + leftW, y - contactBlockH - spacerH - labelRowH, y - contactBlockH - spacerH - labelRowH + totalTableH);

      // PO No | Quotation Ref No
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('PO No', M + 6, y + (ROW_H - 8) / 2, { width: 70, lineBreak: false });
      doc.text(`:   ${po.po_number || '---'}`, M + 76, y + (ROW_H - 8) / 2, { width: leftW - 82, lineBreak: false });
      doc.text('Quotation Ref', M + leftW + 6, y + (ROW_H - 8) / 2, { width: 80, lineBreak: false });
      doc.text(`:  ${po.rfq?.rfq_number || '---'}`, M + leftW + 86, y + (ROW_H - 8) / 2, { width: rightW - 92, lineBreak: false });
      y += ROW_H;
      drawHDiv(M, M + cW, y);

      // PO Date | Project
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('PO Date', M + 6, y + (ROW_H - 8) / 2, { width: 70, lineBreak: false });
      doc.text(`:   ${fmtDate(po.po_date)}`, M + 76, y + (ROW_H - 8) / 2, { width: leftW - 82, lineBreak: false });
      const projectName = po.project?.project_name || po.rfq?.project?.project_name || '---';
      doc.text('Project', M + leftW + 6, y + (ROW_H - 8) / 2, { width: 70, lineBreak: false });
      doc.text(`:  ${projectName}`, M + leftW + 76, y + (ROW_H - 8) / 2, { width: rightW - 82, lineBreak: false });
      y += ROW_H;
      y += 10;

      // ── Resolve cost mode ──
      const costMode = po.cost_mode || 'unit';
      const isWeightMode = costMode === 'weight';

      // ── 1. SUMMARY ──
      checkPage(30);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
         .text('1. Summary', M, y);
      y = doc.y + 6;

      // Summary table columns: S.No | Description | Quantity | Unit Weight | Cost | Line Total
      const weightUnitLabel = (po.weight_unit || poLineItems[0]?.weight_unit || 'KG').toUpperCase();
      console.log(`weight unit label: ${weightUnitLabel}`);
      const sumColW = [
        Math.round(cW * 0.06),  // S.No
        Math.round(cW * 0.32),  // Description
        Math.round(cW * 0.10),  // Quantity
        Math.round(cW * 0.19),  // Unit Weight
        Math.round(cW * 0.17),  // Cost
        0,                       // Line Total (remainder)
      ];
      sumColW[5] = cW - sumColW[0] - sumColW[1] - sumColW[2] - sumColW[3] - sumColW[4];

      const costColLabel = isWeightMode
        ? `Cost / ${weightUnitLabel}`
        : 'Cost / Unit';
      const unitWeightColLabel = `Unit Weight (${weightUnitLabel === 'KG' ? 'Kg' : 'Lbs'})`;
      const sumHdrs = ['S.No', 'Description', 'Quantity', unitWeightColLabel, costColLabel, 'Line Total'];
      const sumAligns = ['center', 'left', 'center', 'center', 'right', 'right'];

      // Table header — dark bg matching RFQ
      const TH_H = 24;  // increased height to accommodate wrapping if needed
      const drawSummaryHeader = () => {
        doc.rect(M, y, cW, TH_H).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.75).rect(M, y, cW, TH_H).strokeColor('#000000').stroke();
        let hx = M;
        sumHdrs.forEach((h, i) => {
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(h, hx + 3, y + 4, { width: sumColW[i] - 6, align: sumAligns[i], lineBreak: true });
          if (i < sumHdrs.length - 1) {
            doc.lineWidth(0.3).moveTo(hx + sumColW[i], y).lineTo(hx + sumColW[i], y + TH_H).strokeColor('#FFFFFF').stroke();
          }
          hx += sumColW[i];
        });
        y += TH_H;
      };

      checkPage(TH_H);
      drawSummaryHeader();

      // Column dividers helper
      const drawColDividers = (rowY, rowH) => {
        let dx = M;
        for (let i = 0; i < sumColW.length - 1; i++) {
          dx += sumColW[i];
          doc.lineWidth(0.3).moveTo(dx, rowY).lineTo(dx, rowY + rowH).strokeColor('#999999').stroke();
        }
      };

      // Helper to format dimensions object to string
      const fmtDimensions = (dims, unitSys) => {
        if (!dims || typeof dims !== 'object') return '';
        const vals = [];
        if (dims.length) vals.push(`${dims.length}`);
        if (dims.width) vals.push(`${dims.width}`);
        if (dims.height) vals.push(`${dims.height}`);
        if (dims.thickness) vals.push(`${dims.thickness}`);
        if (dims.diameter) vals.push(`${dims.diameter}`);
        if (dims.outer_diameter) vals.push(`${dims.outer_diameter}`);
        if (dims.inner_diameter) vals.push(`${dims.inner_diameter}`);
        if (dims.across_flats) vals.push(`${dims.across_flats}`);
        if (dims.side) vals.push(`${dims.side}`);
        if (vals.length === 0) return '';
        const unit = unitSys === 'imperial' ? '"' : ' mm';
        return vals.join(' x ') + unit;
      };

      // Data rows — one per line item
      const DATA_ROW_H = 22;
      let subtotalCalc = 0;

      poLineItems.forEach((item, idx) => {
        // Description: Material | Grade | Condition | Form | Dimension
        const dimStr = fmtDimensions(item.dimensions, item.unit_system);
        const desc = [item.material_category, item.material_grade, item.condition, item.form, dimStr]
          .filter(Boolean).join(' | ') || item.part_name || '---';
        const qty = parseFloat(item.quantity) || 0;
        const weight = parseFloat(item.weight) || 0;
        const unitCost = isWeightMode ? (parseFloat(item.cost_per_weight) || 0) : (parseFloat(item.unit_cost) || 0);
        const lineTotal = isWeightMode ? (qty * weight * unitCost) : (qty * unitCost);
        subtotalCalc += lineTotal;

        // Dynamic row height based on description
        doc.fontSize(8).font('Helvetica');
        const descH = doc.heightOfString(desc, { width: sumColW[1] - 8 });
        const rowH = Math.max(DATA_ROW_H, Math.ceil(descH) + 8);

        // Page break check — redraw header if needed
        if (y + rowH > pageH - FOOTER_H - 10) {
          doc.addPage(); y = M;
          drawSummaryHeader();
        }

        const bg = idx % 2 === 0 ? COLORS.ROW_WHITE : (COLORS.ROW_ALT || '#F3F4F6');
        doc.rect(M, y, cW, rowH).fill(bg);
        doc.lineWidth(0.5).rect(M, y, cW, rowH).strokeColor('#000000').stroke();
        drawColDividers(y, rowH);

        let rx = M;
        // S.No
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(String(idx + 1), rx + 4, y + (rowH - 8) / 2, { width: sumColW[0] - 8, align: 'center', lineBreak: false });
        rx += sumColW[0];
        // Description
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(desc, rx + 4, y + 4, { width: sumColW[1] - 8, lineBreak: true });
        rx += sumColW[1];
        // Quantity
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(String(qty), rx + 4, y + (rowH - 8) / 2, { width: sumColW[2] - 8, align: 'center', lineBreak: false });
        rx += sumColW[2];
        // Unit Weight
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(weight ? String(weight) : '-', rx + 4, y + (rowH - 8) / 2, { width: sumColW[3] - 8, align: 'center', lineBreak: false });
        rx += sumColW[3];
        // Cost (Unit Cost or Cost per Weight)
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(fmtCurrency(unitCost), rx + 4, y + (rowH - 8) / 2, { width: sumColW[4] - 8, align: 'right', lineBreak: false });
        rx += sumColW[4];
        // Line Total
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(fmtCurrency(lineTotal), rx + 4, y + (rowH - 8) / 2, { width: sumColW[5] - 8, align: 'right', lineBreak: false });

        y += rowH;
      });

      // Tax row
      const TAX_ROW_H = 22;
      checkPage(TAX_ROW_H);
      doc.rect(M, y, cW, TAX_ROW_H).fill(COLORS.ROW_WHITE);
      doc.lineWidth(0.5).rect(M, y, cW, TAX_ROW_H).strokeColor('#000000').stroke();

      // Merge S.No + Description + Quantity + Unit Weight columns for "Tax" label
      const taxLabelW = sumColW[0] + sumColW[1] + sumColW[2] + sumColW[3];
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Tax', M + 4, y + (TAX_ROW_H - 8.5) / 2, { width: taxLabelW - 8, align: 'right', lineBreak: false });
      doc.lineWidth(0.3).moveTo(M + taxLabelW, y).lineTo(M + taxLabelW, y + TAX_ROW_H).strokeColor('#999999').stroke();

      // Tax type in Cost column
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(po.tax_type || 'Exempt', M + taxLabelW + 4, y + (TAX_ROW_H - 8) / 2, { width: sumColW[4] - 8, align: 'center', lineBreak: false });
      doc.lineWidth(0.3).moveTo(M + taxLabelW + sumColW[4], y).lineTo(M + taxLabelW + sumColW[4], y + TAX_ROW_H).strokeColor('#999999').stroke();

      // Tax amount in Line Total column
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(fmtCurrency(po.tax_amount || 0), M + taxLabelW + sumColW[4] + 4, y + (TAX_ROW_H - 8) / 2,
           { width: sumColW[5] - 8, align: 'right', lineBreak: false });
      y += TAX_ROW_H;

      // Grand Total row
      const GT_ROW_H = 22;
      checkPage(GT_ROW_H);
      doc.rect(M, y, cW, GT_ROW_H).fill(COLORS.GT_BG);
      doc.lineWidth(0.75).rect(M, y, cW, GT_ROW_H).strokeColor('#000000').stroke();

      const gtLabelW = sumColW[0] + sumColW[1] + sumColW[2] + sumColW[3] + sumColW[4];
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Grand Total', M + 8, y + (GT_ROW_H - 9) / 2, { width: gtLabelW - 16, align: 'right', lineBreak: false });
      doc.lineWidth(0.5).moveTo(M + gtLabelW, y).lineTo(M + gtLabelW, y + GT_ROW_H).strokeColor('#000000').stroke();

      const grandTotal = subtotalCalc + (parseFloat(po.tax_amount) || 0);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text(fmtCurrency(grandTotal), M + gtLabelW + 4, y + (GT_ROW_H - 9) / 2,
           { width: sumColW[5] - 8, align: 'right', lineBreak: false });
      y += GT_ROW_H;
      y += 12;

      // ── NOTES (if any) ──
      if (po.notes) {
        checkPage(50);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
           .text('2. Notes', M, y);
        y = doc.y + 6;
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(po.notes, M + 8, y, { width: cW - 16, lineBreak: true });
        y = doc.y + 6;
      }

      // ── TERMS & CONDITIONS (if any) ──
      if (po.terms_conditions) {
        checkPage(50);
        const tcNum = po.notes ? '3' : '2';
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
           .text(`${tcNum}. Terms & Conditions`, M, y);
        y = doc.y + 6;
        const tcLines = po.terms_conditions.split('\n').filter(Boolean);
        tcLines.forEach(n => {
          if (!n) return;
          checkPage(20);
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text('\u2022  ' + n.trim(), M + 8, y, { width: cW - 16, align: 'justify' });
          y = doc.y + 4;
        });
      }

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PO Email
  // ═══════════════════════════════════════════════════════════════════════════

  async sendPOEmail(id) {
    const { sendEmail } = require('../utils/emailService');
    const settingsService = require('./settingsService');

    const po = await this.getPOById(id);

    const vendor = po.vendor;
    if (!vendor || !vendor.contact_email) {
      if (po.status === 'Draft') {
        await MgmtProcurementPO.update({ status: 'Sent' }, { where: { id } });
      }
      return { sent: false, reason: 'Vendor has no email address', po: await this.getPOById(id) };
    }

    const pdf = await this.generatePOPdf(id);
    const companySettings = await settingsService.getCompanySettings(po.company_id);

    const html = `
      <p>Dear ${vendor.contact_person || vendor.vendor_name},</p>
      <p>Please find attached the Purchase Order <strong>${po.po_number}</strong>.</p>
      <p>Kindly acknowledge receipt and proceed accordingly.</p>
      <br/>
      <p>Best Regards,<br/>${companySettings.name || 'Forge i-DAS'}</p>
    `;

    const result = await sendEmail({
      to: vendor.contact_email,
      subject: `PO ${po.po_number}`,
      html,
      attachments: [{ filename: pdf.filename, content: pdf.buffer }],
    });

    if (po.status === 'Draft') {
      await MgmtProcurementPO.update({ status: 'Sent' }, { where: { id } });
    }

    return { sent: result.success, emailResult: result, po: await this.getPOById(id) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Purchased Materials (view from POs)
  // ═══════════════════════════════════════════════════════════════════════════

  async getPurchasedMaterials(query, user) {
    const where = { deleted_at: null };
    if (user.company_id) where.company_id = user.company_id;
    // Show only POs that have been sent/ordered/received
    where.status = { [Op.in]: ['Sent', 'Ordered', 'Received'] };

    return MgmtProcurementPO.findAll({
      where,
      include: [
        { model: MgmtProcurementRFQ, as: 'rfq', attributes: ['id', 'rfq_number'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });
  }
}

module.exports = new MgmtProcurementService();
