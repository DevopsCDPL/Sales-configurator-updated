const { SalesOrder, Project, Estimate, EstimateItem, WorkOrder, User, Client, Document, Invoice } = require('../models');
const dayjs = require('dayjs');
const settingsService = require('./settingsService');
const documentNumberingService = require('./documentNumberingService');
const { Op } = require('sequelize');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const calc = require('../utils/calculations');

class SalesOrderService {
  async getSalesOrderByProjectId(projectId) {
    const salesOrder = await SalesOrder.findOne({
      where: { project_id: projectId }
    });
    return salesOrder;
  }

  async createSalesOrder(projectId, orderData, options = {}) {
    const { tenantCompanyId = null } = options;
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Backfill project.company_id from the caller's tenant context if missing.
    // Without this, downstream creates (WorkOrder, Invoice) hit NOT NULL
    // constraint violations and surface as a generic "Validation error".
    if (!project.company_id && tenantCompanyId) {
      await project.update({ company_id: tenantCompanyId });
    }
    const effectiveCompanyId = project.company_id || tenantCompanyId || null;

    // Allow creation for quoted projects, or update for order_confirmed projects
    const allowedStatuses = ['quoted', 'order_confirmed'];
    if (!allowedStatuses.includes(project.status)) {
      throw new Error('Sales order can only be created for quoted or order-confirmed projects');
    }

    // Check estimate is approved
    const estimate = await Estimate.findOne({
      where: { project_id: projectId, is_approved: true }
    });
    if (!estimate) {
      throw new Error('Cannot create sales order without approved estimate and quotation');
    }

    const { customer_po_number, customer_po_file, accepted_date, delivery_date, notes } = orderData;

    // If sales order already exists, update it instead of throwing error
    const existingOrder = await SalesOrder.findOne({ where: { project_id: projectId } });
    if (existingOrder) {
      const updates = {};
      if (customer_po_number !== undefined) updates.customer_po_number = customer_po_number;
      if (customer_po_file !== undefined) updates.customer_po_file = customer_po_file;
      if (accepted_date !== undefined) updates.accepted_date = accepted_date || new Date();
      if (delivery_date !== undefined) updates.delivery_date = delivery_date;
      if (notes !== undefined) updates.notes = notes;
      await existingOrder.update(updates);
      await existingOrder.reload(); // ensure returned object reflects DB values, not stale cache

      // Ensure project status is order_confirmed
      if (project.status === 'quoted') {
        await project.update({ status: 'order_confirmed' });
        await this.createWorkOrder(projectId, effectiveCompanyId);
        await this.autoCreateInvoice(projectId);
      }

      return existingOrder;
    }

    // Generate sales order number
    let salesOrder;
    let sales_order_number = await this.generateSalesOrderNumber(effectiveCompanyId);
    try {
      salesOrder = await SalesOrder.create({
        project_id: projectId,
        company_id: effectiveCompanyId,
        sales_order_number,
        customer_po_number,
        customer_po_file,
        accepted_date: accepted_date || new Date(),
        delivery_date,
        notes
      });
    } catch (createErr) {
      // Handle race-condition: another request created the record between findOne and create
      if (createErr.name === 'SequelizeUniqueConstraintError') {
        // Could be project_id OR sales_order_number conflict
        const raceOrder = await SalesOrder.findOne({ where: { project_id: projectId } });
        if (raceOrder) {
          const updates = {};
          if (customer_po_number !== undefined) updates.customer_po_number = customer_po_number;
          if (customer_po_file !== undefined) updates.customer_po_file = customer_po_file;
          if (delivery_date !== undefined) updates.delivery_date = delivery_date;
          if (notes !== undefined) updates.notes = notes;
          await raceOrder.update(updates);
          if (project.status === 'quoted') {
            await project.update({ status: 'order_confirmed' });
            await this.createWorkOrder(projectId, effectiveCompanyId);
            await this.autoCreateInvoice(projectId);
          }
          return raceOrder;
        }
        // Conflict on sales_order_number (not project_id) --- retry with new numbers.
        // Use multiple attempts to survive concurrency spikes and legacy global unique indexes.
        let retryErr = createErr;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            sales_order_number = await this.generateSalesOrderNumber(effectiveCompanyId);
            salesOrder = await SalesOrder.create({
              project_id: projectId,
              company_id: effectiveCompanyId,
              sales_order_number,
              customer_po_number,
              customer_po_file,
              accepted_date: accepted_date || new Date(),
              delivery_date,
              notes
            });
            retryErr = null;
            break;
          } catch (err) {
            retryErr = err;
            if (err.name !== 'SequelizeUniqueConstraintError') {
              throw err;
            }
          }
        }
        if (retryErr) {
          // Last resort: check if order was sneaked in by another request
          const fallback = await SalesOrder.findOne({ where: { project_id: projectId } });
          if (fallback) return fallback;
          throw retryErr;
        }
      } else {
        throw createErr;
      }
    }

    // Update project status
    await project.update({ status: 'order_confirmed' });

    // Auto-create work order
    await this.createWorkOrder(projectId, effectiveCompanyId);

    // Auto-create invoice
    await this.autoCreateInvoice(projectId);

    return salesOrder;
  }

  async updateSalesOrder(id, updateData) {
    const salesOrder = await SalesOrder.findByPk(id);
    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    const allowedFields = ['customer_po_number', 'customer_po_file', 'accepted_date', 'delivery_date', 'notes'];
    const updates = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    await salesOrder.update(updates);
    return salesOrder;
  }

  async uploadPoFile(projectId, filePath, originalName, fileSize, userId) {
    const project = await Project.findByPk(projectId);
    if (!project) throw new Error('Project not found');

    // Find or create the sales order for this project
    let salesOrder = await SalesOrder.findOne({ where: { project_id: projectId } });
    if (!salesOrder) {
      // Create a placeholder sales order so the file is stored
      const sales_order_number = await this.generateSalesOrderNumber(project.company_id || null);
      salesOrder = await SalesOrder.create({
        project_id: projectId,
        company_id: project.company_id || null,
        sales_order_number,
        accepted_date: new Date(),
      });
    }

    // Store the file path (relative URL for serving via /uploads)
    const relativePath = filePath.replace(/\\/g, '/');
    const urlPath = '/uploads/' + relativePath.split('/uploads/').pop();
    await salesOrder.update({ customer_po_file: urlPath });

    // NOTE: Document record is already created by processUpload() in the controller.
    // Do NOT create a second Document.create here — it causes duplicate entries.

    return salesOrder;
  }

  async autoCreateInvoice(projectId) {
    // Skip if an invoice already exists for this project
    const existing = await Invoice.findOne({ where: { project_id: projectId } });
    if (existing) return existing;

    try {
      const project = await Project.findByPk(projectId, {
        include: [
          { model: Client, as: 'client' },
          { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] },
          { model: SalesOrder, as: 'salesOrder' },
        ],
      });
      if (!project) return null;

      // Pick approved/selected estimate
      const estimates = project.estimate || [];
      const estimate = calc.pickBestEstimate(estimates, project.selected_revision);

      // Build line items from estimate parts
      const lineItems = calc.buildEstimateLineItems(estimate);

      // Generate invoice number — collision-safe via documentNumberingService
      // (root-cause fix: never duplicate against legacy global rows or races).
      const companyId = project.company_id || null;
      const invoiceNumber = await documentNumberingService.generateUniqueNumber(
        'commercial_invoice_number', companyId, Invoice, 'invoice_number'
      );

      const subtotal = calc.calculateSubtotal(lineItems);

      const invoice = await Invoice.create({
        project_id: projectId,
        company_id: project.company_id || null,
        invoice_number: invoiceNumber,
        invoice_type: 'Commercial',
        invoice_date: new Date().toISOString().split('T')[0],
        customer_name: project.client?.client_name || '',
        customer_address: project.client?.address || '',
        client_po_number: project.salesOrder?.customer_po_number || project.po_number || '',
        project_name: project.project_name || '',
        revision: estimate ? `R${estimate.revision}` : '',
        line_items: lineItems,
        tax_type: 'Exempt',
        tax_percent: 0,
        payment_terms: 'Net 30 days from invoice date. Payment via bank transfer.',
        notes: 'Thank you for your business.',
        shipping_charges: 0,
        subtotal,
        tax_amount: 0,
        final_total: subtotal,
        status: 'Draft',
      });

      return invoice;
    } catch (err) {
      console.error('Auto-create invoice failed (non-blocking):', err.message);
      return null;
    }
  }

  async createWorkOrder(projectId, fallbackCompanyId = null) {
    const existingWorkOrder = await WorkOrder.findOne({ where: { project_id: projectId } });
    if (existingWorkOrder) {
      return existingWorkOrder;
    }

    const project = await Project.findByPk(projectId);
    const companyId = project?.company_id || fallbackCompanyId || null;
    if (!companyId) {
      throw new Error('Cannot create work order: project is not associated with a company.');
    }
    const work_order_number = await documentNumberingService.generateUniqueNumber(
      'work_order_number', companyId, WorkOrder, 'work_order_number'
    );
    const production_traveler_number = await documentNumberingService.generateUniqueNumber(
      'production_traveler_number', companyId, WorkOrder, 'production_traveler_number'
    );

    const workOrder = await WorkOrder.create({
      project_id: projectId,
      company_id: companyId,
      work_order_number,
      production_traveler_number,
      release_date: new Date(),
      status: 'pending',
      operations: []
    });

    return workOrder;
  }

  async generateSalesOrderNumber(companyId = null) {
    const year = dayjs().format('YYYY');
    const month = dayjs().format('MM');
    const prefix = `SO-${year}${month}-`;

    // Build from existing monthly SO numbers and tolerate malformed historical values.
    // INTERNAL_ONLY: _skipTenantScope is used solely to detect global
    // collisions with legacy rows and stale global unique indexes.
    const rows = await SalesOrder.findAll({
      where: {
        sales_order_number: {
          [Op.like]: `${prefix}%`
        }
      },
      attributes: ['sales_order_number'],
      _skipTenantScope: true,
    });

    let maxSeen = 0;
    for (const row of rows) {
      const value = row?.sales_order_number || '';
      if (!value.startsWith(prefix)) continue;
      const suffix = value.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      const parsed = parseInt(suffix, 10);
      if (!Number.isNaN(parsed) && parsed > maxSeen) {
        maxSeen = parsed;
      }
    }

    // Keep trying sequential candidates until we find one that doesn't exist globally.
    // This is resilient even when a legacy global unique index is still present.
    for (let offset = 1; offset <= 200; offset++) {
      const next = maxSeen + offset;
      const candidate = `${prefix}${String(next).padStart(4, '0')}`;
      const exists = await SalesOrder.findOne({
        where: { sales_order_number: candidate },
        attributes: ['id'],
        _skipTenantScope: true,
      });
      if (!exists) return candidate;
    }

    // Emergency fallback if an unusual amount of contention exists.
    const fallback = `${prefix}${Date.now().toString().slice(-6)}`;
    return fallback;
  }

  async generateWorkOrderNumber(companyId) {
    return documentNumberingService.generateNumber('work_order_number', companyId);
  }

  async generateSalesOrderPdf(salesOrderId) {
    const PDFDocument = require('pdfkit');

    const salesOrder = await SalesOrder.findByPk(salesOrderId);
    if (!salesOrder) throw new Error('Sales order not found');

    const project = await Project.findByPk(salesOrder.project_id, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy' },
        {
          model: Estimate,
          as: 'estimate',
          include: [{ model: EstimateItem, as: 'items' }]
        }
      ]
    });
    if (!project) throw new Error('Project not found');

    const companySettings = await settingsService.getCompanySettings(project.company_id);
    const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);

    const fmtDate = (date) => {
      if (!date) return '-';
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('default', { month: 'short' })}-${d.getFullYear()}`;
    };

    const fmtCurrency = calc.fmtCurrency;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: `SalesOrder-${salesOrder.sales_order_number}.pdf`
      }));
      doc.on('error', reject);

      const margin = 30;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 2 * margin;
      let y = drawGlobalHeader(doc, companySettings, 'Sales Order');

      // --------- INFO TABLE ------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const colW = contentWidth / 2;   // each half
      const rowH = 20;
      const labelW = 130;
      const tableStartY = y;

      const preparedByName = project.preparedBy?.name || 'Production Manager';
      const preparedByDisplay = project.preparedBy?.position
        ? `${preparedByName} (${project.preparedBy.position})`
        : preparedByName;
      const infoRows = [
        ['Sales Order No (Auto Gen)', salesOrder.sales_order_number, 'Issue Date (Today\'s Date)', fmtDate(salesOrder.accepted_date || new Date())],
        ['Project Name (Auto Fill)', project.project_name, 'Due Date (To be Filled)', fmtDate(salesOrder.delivery_date)],
        ['Client Name (Auto Fill)', project.client?.client_name || '-', 'Customer PO No (Auto Fill)', salesOrder.customer_po_number || '-'],
        ['Part No / Drawing No', project.part_number || project.drawing_number || '-', 'Revision (Auto Gen)', `${project.revision || 1}`],
        ['Material (Auto Fill)', [project.material_type, project.material_grade].filter(Boolean).join(' --- ') || '-', 'Quantity (Auto Gen)', `${project.quantity || '-'} Nos`],
        ['Prepared By (Auto Fill)', preparedByDisplay, 'Approved By', 'Operations Head'],
      ];

      infoRows.forEach((row, i) => {
        const rowY = tableStartY + i * rowH;

        // Left column
        doc.fontSize(8).font('Helvetica').fillColor('#333');
        doc.text(row[0], margin + 4, rowY + 5, { width: labelW });
        doc.font('Helvetica').fillColor('#000');
        doc.text(`: ${row[1]}`, margin + labelW + 4, rowY + 5, { width: colW - labelW - 8 });

        // Right column
        doc.font('Helvetica').fillColor('#333');
        doc.text(row[2], margin + colW + 4, rowY + 5, { width: labelW });
        doc.font('Helvetica').fillColor('#000');
        doc.text(`: ${row[3]}`, margin + colW + labelW + 4, rowY + 5, { width: colW - labelW - 8 });
      });

      const tableH = infoRows.length * rowH;

      // Outer border
      doc.lineWidth(0.75).rect(margin, tableStartY, contentWidth, tableH).strokeColor('#333').stroke();
      // Vertical divider (mid)
      doc.moveTo(margin + colW, tableStartY).lineTo(margin + colW, tableStartY + tableH).stroke();
      // Horizontal row dividers
      for (let i = 1; i < infoRows.length; i++) {
        const lineY = tableStartY + i * rowH;
        doc.moveTo(margin, lineY).lineTo(margin + contentWidth, lineY).stroke();
      }

      y = tableStartY + tableH + 16;

      // --------- SECTION 1: Material Details ---------------------------------------------------------------------------------------------------------------
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
      doc.text('1.  Material Details:', margin, y);
      y += 16;

      const matRows = [
        ['Material Type (Auto Fill)', project.material_type || '-'],
        ['Material Grade (Auto Fill)', project.material_grade || '-'],
        ['Raw Material Dimension (Auto Fill)', project.raw_material_dimension || '-'],
        ['Heat Number (Enter Manually)', project.heat_number || '-'],
      ];

      const matLabelW = 200;
      const matTableStartY = y;

      matRows.forEach((row, i) => {
        const rowY = matTableStartY + i * rowH;
        doc.fontSize(8).font('Helvetica').fillColor('#333');
        doc.text(row[0], margin + 4, rowY + 5, { width: matLabelW });
        doc.fillColor('#000');
        doc.text(`: ${row[1]}`, margin + matLabelW + 4, rowY + 5, { width: contentWidth - matLabelW - 8 });
      });

      const matTableH = matRows.length * rowH;
      doc.lineWidth(0.75).rect(margin, matTableStartY, contentWidth, matTableH).strokeColor('#333').stroke();
      // Vertical divider for label/value
      doc.moveTo(margin + matLabelW, matTableStartY).lineTo(margin + matLabelW, matTableStartY + matTableH).stroke();
      for (let i = 1; i < matRows.length; i++) {
        const lineY = matTableStartY + i * rowH;
        doc.moveTo(margin, lineY).lineTo(margin + contentWidth, lineY).strokeColor('#333').stroke();
      }

      y = matTableStartY + matTableH + 16;

      // --------- SECTION 2: Line Items ------------------------------------------------------------------------------------------------------------------------------------
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
      doc.text('2.  Item Details:', margin, y);
      y += 14;

      // Pull items from approved estimation data
      const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
      const bestEstimate = calc.pickBestEstimate(estimates, project.selected_revision);
      const items = calc.buildEstimateLineItems(bestEstimate);
      if (items.length > 0) {
        // Table header
        const colWidths = [30, 200, 60, 90, 90];
        const headers = ['#', 'Description', 'Qty', 'Unit Price', 'Total'];
        const headerY = y;
        const headerH = 18;

        doc.rect(margin, headerY, contentWidth, headerH).fill(COLORS.TABLE_HEAD);
        doc.lineWidth(0.5).rect(margin, headerY, contentWidth, headerH).strokeColor(COLORS.TABLE_HEAD).stroke();

        let cx = margin;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
        headers.forEach((h, i) => {
          doc.text(h, cx + 3, headerY + 5, { width: colWidths[i] - 6, align: i > 1 ? 'right' : 'left' });
          cx += colWidths[i];
        });

        y += headerH;

        items.forEach((item, idx) => {
          if (y + rowH > doc.page.height - 80) {
            doc.addPage();
            y = margin;
          }
          cx = margin;
          const cells = [
            idx + 1,
            item.description || item.part || '-',
            item.quantity || '-',
            fmtCurrency(item.unit_price),
            fmtCurrency(item.line_total)
          ];
          doc.fontSize(8).font('Helvetica').fillColor('#000');
          cells.forEach((cell, i) => {
            doc.text(String(cell), cx + 3, y + 5, { width: colWidths[i] - 6, align: i > 1 ? 'right' : 'left' });
            cx += colWidths[i];
          });
          doc.lineWidth(0.4).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
          y += rowH;
        });

        // Bottom border & total
        doc.lineWidth(0.75).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#333').stroke();
        y += 4;

        const total = items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        doc.text(`Total Amount: ${fmtCurrency(total)}`, margin, y + 4, { width: contentWidth, align: 'right' });
        y += 20;
      } else {
        doc.fontSize(8.5).font('Helvetica').fillColor('#555');
        doc.text('No items available.', margin + 4, y + 4);
        y += 20;
      }

      y += 8;

      // --------- SECTION 3: Terms & Conditions ------------------------------------------------------------------------------------------------------------
      if (y + 80 > doc.page.height - 60) { doc.addPage(); y = margin; }
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
      doc.text('3.  Terms & Conditions:', margin, y);
      y += 16;

      const estimate = bestEstimate;
      const paymentTerms = estimate?.quotation?.payment_terms || companySettings.defaultPaymentTerms || 'Net 30';
      const deliveryTerms = estimate?.quotation?.delivery_terms || 'Ex-Works';
      const termsItems = [
        `Payment Terms: ${paymentTerms}`,
        `Delivery Terms: ${deliveryTerms}`,
        `Warranty: As per applicable standards and specifications.`,
        `All disputes subject to jurisdiction of manufacturer\'s location.`,
      ];

      doc.fontSize(9).font('Helvetica').fillColor('#000');
      termsItems.forEach((t, i) => {
        doc.text(`${i + 1}.  ${t}`, margin + 10, y);
        y += 14;
      });

      y += 6;

      // --------- SECTION 4: Special Instructions ---------------------------------------------------------------------------------------------------
      if (salesOrder.notes) {
        if (y + 60 > doc.page.height - 60) { doc.addPage(); y = margin; }
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
        doc.text('4.  Special Instructions', margin, y);
        y += 16;

        const noteLines = salesOrder.notes.split('\n').filter(l => l.trim());
        doc.fontSize(9).font('Helvetica').fillColor('#000');
        noteLines.forEach((line, i) => {
          doc.text(`${i + 1}.  ${line.trim()}`, margin + 10, y);
          y += 14;
        });
      }

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }
}

module.exports = new SalesOrderService();
