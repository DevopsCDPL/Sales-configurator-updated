const { Invoice, Project, Client, Estimate, EstimateItem, SalesOrder, VendorPurchaseOrder, VendorPOItem, User } = require('../models');
const { Op } = require('sequelize');
const settingsService = require('../services/settingsService');
const documentNumberingService = require('../services/documentNumberingService');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const { buildEstimateLineItems, pickBestEstimate, buildDescription } = require('../utils/calculations');
const { validateInvoiceForPdf } = require('../utils/pdfValidation');
const documentService = require('../services/documentService');
const { verifyTenantRecord, buildTenantWhere } = require('../middleware/tenantScope');

/** Verify project belongs to the current tenant */
async function verifyProjectTenant(req, projectId) {
  const project = await Project.findByPk(projectId);
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  if (!verifyTenantRecord(req, project)) throw Object.assign(new Error('Access denied'), { status: 403 });
  return project;
}

/** Verify invoice belongs to the current tenant via its parent project */
async function verifyInvoiceTenant(req, invoiceId) {
  const invoice = await Invoice.findByPk(invoiceId);
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
  if (invoice.project_id) await verifyProjectTenant(req, invoice.project_id);
  return invoice;
}

// --------- Helper: map invoice_type to document numbering type ---------
function invoiceDocType(invoiceType) {
  const t = (invoiceType || '').toLowerCase();
  if (t.includes('tax'))      return 'tax_invoice_number';
  if (t.includes('proforma')) return 'proforma_invoice_number';
  return 'commercial_invoice_number'; // default
}

// --------- Auto-populate invoice data from project ---------
exports.getAutoPopulatedData = async (req, res) => {
  try {
    const { project_id } = req.params;
    await verifyProjectTenant(req, project_id);
    const project = await Project.findByPk(project_id, {
      include: [
        { model: Client, as: 'client' },
        { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] },
        { model: SalesOrder, as: 'salesOrder' },
      ],
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Pick approved/selected estimate using shared logic
    const estimates = project.estimate || [];
    const estimate = pickBestEstimate(estimates, project.selected_revision);

    // Build line items from estimate parts using shared extraction
    const lineItems = buildEstimateLineItems(estimate);

    // Quantity shipped from packages_json
    const packages = project.packages_json;
    let totalShipped = 0;
    if (Array.isArray(packages)) {
      packages.forEach(pkg => { totalShipped += Number(pkg.quantity) || 0; });
    }

    const companyId = req.tenantScope?.company_id || req.user?.company_id || null;
    const { preview: invoiceNumber } = await documentNumberingService.generatePreview('commercial_invoice_number', companyId);

    let sysSettings = {};
    try {
      sysSettings = await settingsService.getSystemSettings(companyId);
    } catch (e) {
      console.warn('Failed to fetch system settings for invoice auto-population');
    }

    res.json({
      data: {
        invoice_number: invoiceNumber,
        invoice_date: new Date().toISOString().split('T')[0],
        customer_name: project.client?.client_name || '',
        customer_address: project.client?.address || '',
        customer_email: project.client?.poc_email || '',
        customer_phone: project.client?.poc_phone || '',
        client_po_number: project.salesOrder?.customer_po_number || project.po_number || '',
        client_po_date: project.salesOrder?.accepted_date ? new Date(project.salesOrder.accepted_date).toISOString().split('T')[0] : '',
        project_name: project.project_name || '',
        revision: estimate ? `R${estimate.revision}` : '',
        line_items: lineItems,
        quantity_shipped: totalShipped || lineItems.reduce((sum, i) => sum + i.quantity, 0),
        payment_terms: sysSettings.invoicePaymentTerms || 'Net 30 days from invoice date. Payment via bank transfer.',
        notes: sysSettings.invoiceNotes || 'Thank you for your business.',
        terms_conditions: sysSettings.invoiceTerms || '',
        tax_type: 'Exempt',
        tax_percent: 0,
        shipping_charges: 0,
        status: 'Draft',
      }
    });
  } catch (err) {
    console.error('Auto-populate error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --------- Create Invoice ---------
exports.createInvoice = async (req, res) => {
  try {
    const data = req.body;
    const companyId = req.tenantScope?.company_id || req.user?.company_id || null;

    // Verify tenant via project
    if (data.project_id) await verifyProjectTenant(req, data.project_id);

    // Generate a globally-unique invoice number — collision-safe against legacy
    // global rows from any company (root-cause fix: never duplicate, never race).
    const docType = invoiceDocType(data.invoice_type);
    const invoiceNumber = await documentNumberingService.generateUniqueNumber(
      docType, companyId, Invoice, 'invoice_number'
    );

    // Normalize line items --- always recalculate line_total from qty × unit_price
    const lineItems = (data.line_items || []).map(item => {
      const q = Number(item.quantity) || 0;
      const u = Number(item.unit_price) || 0;
      return { ...item, quantity: q, unit_price: u, line_total: q * u };
    });
    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const taxPercent = data.tax_type === 'Exempt' ? 0 : (Number(data.tax_percent) || 0);
    const taxAmount = subtotal * (taxPercent / 100);
    const shippingCharges = Number(data.shipping_charges) || 0;
    const finalTotal = subtotal + taxAmount + shippingCharges;

    let sysSettings = {};
    try {
      sysSettings = await settingsService.getSystemSettings(companyId);
    } catch (e) {}

    const buildPayload = (number) => ({
      project_id: data.project_id,
      company_id: companyId,
      invoice_number: number,
      invoice_type: data.invoice_type || 'Commercial',
      invoice_date: data.invoice_date || new Date().toISOString().split('T')[0],
      customer_name: data.customer_name,
      customer_address: data.customer_address,
      customer_email: data.customer_email || null,
      customer_phone: data.customer_phone || null,
      client_po_number: data.client_po_number,
      project_name: data.project_name,
      revision: data.revision,
      line_items: lineItems,
      tax_type: data.tax_type || 'Exempt',
      tax_percent: taxPercent,
      payment_terms: data.payment_terms || sysSettings.invoicePaymentTerms || 'Net 30 days from invoice date. Payment via bank transfer.',
      notes: data.notes || sysSettings.invoiceNotes || 'Thank you for your business.',
      shipping_charges: shippingCharges,
      subtotal,
      tax_amount: taxAmount,
      final_total: finalTotal,
      terms_conditions: data.terms_conditions || sysSettings.invoiceTerms || null,
      status: data.status || 'Draft',
    });

    let invoice;
    try {
      invoice = await Invoice.create(buildPayload(invoiceNumber));
    } catch (createErr) {
      if (createErr.name === 'SequelizeUniqueConstraintError') {
        // Race or stale legacy index — retry up to 10 times with a fresh unique number.
        let lastErr = createErr;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            const retryNumber = await documentNumberingService.generateUniqueNumber(
              docType, companyId, Invoice, 'invoice_number'
            );
            invoice = await Invoice.create(buildPayload(retryNumber));
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (err.name !== 'SequelizeUniqueConstraintError') throw err;
          }
        }
        if (!invoice) throw lastErr;
      } else {
        throw createErr;
      }
    }

    res.json({ data: invoice });
  } catch (err) {
    console.error('Create invoice error:', err.name, err.message);
    res.status(500).json({ message: err.message });
  }
};

// --------- Get all invoices for a project ---------
exports.getInvoicesByProject = async (req, res) => {
  try {
    const { project_id } = req.params;
    await verifyProjectTenant(req, project_id);
    const invoices = await Invoice.findAll({
      where: { project_id },
      order: [['created_at', 'DESC']],
    });
    res.json({ data: invoices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --------- Get all invoices (for analytics) ---------
exports.getAllInvoices = async (req, res) => {
  try {
    const where = buildTenantWhere(req);
    const invoices = await Invoice.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ data: invoices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --------- Get single invoice ---------
exports.getInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await verifyInvoiceTenant(req, id);
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json({ data: invoice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --------- Update invoice ---------
exports.updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await verifyInvoiceTenant(req, id);
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const data = req.body;

    // Normalize line items --- always recalculate line_total from qty -- unit_price
    if (data.line_items) {
      data.line_items = data.line_items.map(item => {
        const q = Number(item.quantity) || 0;
        const u = Number(item.unit_price) || 0;
        return { ...item, quantity: q, unit_price: u, line_total: q * u };
      });
    }

    // Recalculate totals from line items
    const lineItems = data.line_items || invoice.line_items || [];
    const subtotal = lineItems.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);
    const taxType = data.tax_type !== undefined ? data.tax_type : invoice.tax_type;
    const taxPercent = taxType === 'Exempt' ? 0 : (Number(data.tax_percent !== undefined ? data.tax_percent : invoice.tax_percent) || 0);
    const taxAmount = subtotal * (taxPercent / 100);
    const shippingCharges = Number(data.shipping_charges !== undefined ? data.shipping_charges : invoice.shipping_charges) || 0;
    data.subtotal = subtotal;
    data.tax_amount = taxAmount;
    data.final_total = subtotal + taxAmount + shippingCharges;
    data.tax_percent = taxPercent;

    // Use set() + save() instead of update() to guarantee JSONB fields persist.
    // Sequelize's update() internally calls set() which can reset the changed
    // flag for JSONB fields if values appear referentially equal.
    invoice.set(data);
    if (data.line_items) {
      invoice.changed('line_items', true);
    }
    if (data.terms_conditions !== undefined) {
      invoice.changed('terms_conditions', true);
    }
    await invoice.save();
    await invoice.reload();
    res.json({ data: invoice });
  } catch (err) {
    console.error('Update invoice error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --------- Delete Invoice ---------
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    await verifyInvoiceTenant(req, id);
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    await invoice.destroy();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --------- Generate Invoice PDF ---------
exports.generatePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const { invoice_type } = req.query; // Commercial, Proforma, Tax
    await verifyInvoiceTenant(req, id);
    const invoice = await Invoice.findByPk(id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Load project + preparedBy + client for live data
    let prepBy = {};
    let client = {};
    let proj = null;
    if (invoice.project_id) {
      proj = await Project.findByPk(invoice.project_id, {
        include: [
          { model: User, as: 'preparedBy', attributes: ['id', 'name', 'email', 'phone', 'position'] },
          { model: Client, as: 'client' },
          { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] },
          { model: SalesOrder, as: 'salesOrder', attributes: ['accepted_date'] },
        ]
      });
      if (proj) {
        prepBy = proj.preparedBy || {};
        client = proj.client || {};

        // Always pull line items from approved estimation data
        const estimates = proj.estimate || [];
        const est = pickBestEstimate(estimates, proj.selected_revision);
        if (est) {
          const freshItems = buildEstimateLineItems(est);
          if (freshItems.length > 0) {
            invoice.line_items = freshItems;
          }
        }
      }
    }

    const fmtDate = (d) => {
      if (!d) return '';
      try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d); }
    };

    let poDate = '';
    if (proj && proj.salesOrder?.accepted_date) {
      poDate = fmtDate(proj.salesOrder.accepted_date);
    }

    // PDF pre-generation validation
    const validation = validateInvoiceForPdf(invoice);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Cannot generate invoice PDF.',
        errors: validation.errors,
      });
    }

    const company = await settingsService.getCompanySettings(req.user?.company_id);

    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));

    const pdfReady = new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    });

    const M = 40;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cW = pageW - 2 * M;
    const FOOTER_H = 55;

    const fmtCurrency = (n) => {
      const num = Number(n || 0);
      return `$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - 10) { doc.addPage(); y = M; }
    };

    // --------- HEADER ---------
    const rawType = invoice_type || invoice.invoice_type || 'Tax';
    const typeLabel = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase() + ' Invoice';
    let y = drawGlobalHeader(doc, company, typeLabel);

    // --------- TO / PREPARED BY (matches Quotation PDF layout) ---------
    const halfW   = cW / 2;
    const hdrH    = 25;        // header label row height
    const bodyPad = 10;        // vertical padding
    const lineH   = 14;        // line height inside body
    const textW   = halfW - 26; // usable text width per column

    const clientName  = invoice.customer_name || client.client_name || '(Client Name)';
    const clientAddr  = invoice.customer_address || client.address || '';
    const pocName     = client.poc_name || prepBy.name || '(Contact Person)';
    const pocEmail    = invoice.customer_email || client.poc_email || '';
    const pocPhone    = invoice.customer_phone || client.poc_phone || '';
    const prepName    = prepBy.name || '(Preparer Name)';
    const prepPosition = prepBy.position || '';
    const prepEmail   = prepBy.email || company.email || '';
    const prepPhone   = prepBy.phone || company.phone || '';
    const companyAddr = company.address || '';

    const boxY = y;

    // Measure wrapped height of address fields for dynamic box height
    const measureTextH = (text, fontSize) => {
      if (!text) return 0;
      doc.fontSize(fontSize).font('Helvetica');
      return doc.heightOfString(text, { width: textW, lineBreak: true });
    };
    const leftAddrH  = clientAddr ? Math.max(measureTextH(clientAddr, 8) + 2, lineH) : lineH;
    const rightAddrH = companyAddr ? Math.max(measureTextH(companyAddr, 8) + 2, lineH) : lineH;
    const addrH = Math.max(leftAddrH, rightAddrH);
    const boxBodyH = bodyPad + 15 + addrH + lineH * 3 + bodyPad;
    const boxH     = hdrH + boxBodyH;

    // Draw header row
    doc.rect(M, boxY, cW, hdrH).fill(COLORS.TABLE_HEAD);
    // Vertical divider and horizontal separator
    doc.lineWidth(0.75).moveTo(M + halfW, boxY).lineTo(M + halfW, boxY + boxH).strokeColor('#000000').stroke();
    doc.lineWidth(0.5).moveTo(M, boxY + hdrH).lineTo(M + cW, boxY + hdrH).strokeColor('#000000').stroke();

    // Header labels (white text on dark header)
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT);
    doc.text('To',          M + 13,          boxY + (hdrH - 9) / 2, { width: textW, lineBreak: false });
    doc.text('Prepared By', M + halfW + 13, boxY + (hdrH - 9) / 2, { width: textW, lineBreak: false });

    // Left body - client info
    let lY = boxY + hdrH + bodyPad;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
    doc.text(clientName, M + 13, lY, { width: textW, lineBreak: true }); lY += 15;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK);
    if (clientAddr) { doc.text(clientAddr, M + 13, lY, { width: textW, lineBreak: true }); } lY += addrH;
    doc.text(`POC:   ${pocName}${client.position ? ' | ' + client.position : ''}`, M + 13, lY, { width: textW, lineBreak: true }); lY += lineH;
    doc.text(`Email: ${pocEmail}`, M + 13, lY, { width: textW, lineBreak: true }); lY += lineH;
    doc.text(`Phone: ${pocPhone}`, M + 13, lY, { width: textW, lineBreak: false });

    // Right body - company info
    let rY = boxY + hdrH + bodyPad;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
    doc.text(company.name || '', M + halfW + 13, rY, { width: textW, lineBreak: true }); rY += 15;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK);
    if (companyAddr) { doc.text(companyAddr, M + halfW + 13, rY, { width: textW, lineBreak: true }); } rY += addrH;
    doc.text(`POC:   ${prepName}${prepPosition ? ' | ' + prepPosition : ''}`, M + halfW + 13, rY, { width: textW, lineBreak: true }); rY += lineH;
    doc.text(`Email: ${prepEmail}`, M + halfW + 13, rY, { width: textW, lineBreak: false }); rY += lineH;
    doc.text(`Phone: ${prepPhone}`, M + halfW + 13, rY, { width: textW, lineBreak: false });

    y = boxY + boxH;  // no gap - info strip is part of the same table

    // --------- INVOICE INFO STRIP (matches Quotation PDF layout) ---------
    const infoStripH = 28;
    const infoRows = [
      [{ label: 'Invoice No : ',   value: invoice.invoice_number || '-' }, { label: 'Invoice Date: ', value: fmtDate(invoice.invoice_date) || '-' }],
      [{ label: 'PO No : ',        value: invoice.client_po_number || '-' }, { label: 'PO Date: ',     value: poDate || '-' }],
      [{ label: 'Project Name : ', value: invoice.project_name || '-' },   { label: 'Project ID : ',  value: (proj && proj.project_number) || '-' }],
    ];
    // Fill strip with white
    doc.rect(M, y, cW, infoStripH * infoRows.length).fill('#FFFFFF');
    // Separator line between To/Prepared By and Info sections
    doc.lineWidth(0.5).moveTo(M, y).lineTo(M + cW, y).strokeColor('#000000').stroke();
    // Horizontal separators between rows
    for (let ri = 1; ri < infoRows.length; ri++) {
      doc.lineWidth(0.5).moveTo(M, y + infoStripH * ri).lineTo(M + cW, y + infoStripH * ri).strokeColor('#000000').stroke();
    }
    // Vertical dividers (variable per row based on column count)
    infoRows.forEach((row, ri) => {
      const rowQW = cW / row.length;
      for (let i = 1; i < row.length; i++) {
        doc.lineWidth(0.5).moveTo(M + i * rowQW, y + ri * infoStripH).lineTo(M + i * rowQW, y + (ri + 1) * infoStripH).strokeColor('#000000').stroke();
      }
    });
    infoRows.forEach((row, ri) => {
      const rowQW = cW / row.length;
      row.forEach((f, ci) => {
        if (!f.label && !f.value) return;
        const fx = M + ci * rowQW + 13;
        const fy = y + ri * infoStripH + (infoStripH - 10) / 2;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.ACCENT);
        doc.text(f.label, fx, fy, { continued: true, width: rowQW - 16, lineBreak: false });
        doc.font('Helvetica').fillColor(COLORS.TEXT_DARK).text(f.value, { continued: false, lineBreak: false });
      });
    });
    // Single outer border covering both To/Prepared By and Info sections
    doc.lineWidth(0.75).rect(M, boxY, cW, boxH + infoStripH * infoRows.length).strokeColor('#000000').stroke();
    y += infoStripH * infoRows.length + 5;  // compact gap to Summary title

    // --------- 1. SUMMARY SECTION ---------
    if (y + 30 > pageH - FOOTER_H - M - 20) { doc.addPage(); y = drawGlobalHeader(doc, company, typeLabel); }
    y += 12;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
       .text('1. Summary', M, y);
    y += 18;

    // Column widths (matches Quotation PDF)
    const S_COLS = [30, 0, 82, 65, 105];
    S_COLS[1] = cW - S_COLS[0] - S_COLS[2] - S_COLS[3] - S_COLS[4];
    const sHdrs   = ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'];
    const sAligns = ['center', 'left', 'right', 'center', 'right'];

    // Table header (matching Quotation style)
    const S_HDR_H = 20;
    const drawHeaderCell = (text, x, width, align) => {
      let fontSize = 8.5;
      while (fontSize > 7 && doc.widthOfString(text, { font: 'Helvetica-Bold', size: fontSize }) > width) {
        fontSize -= 0.5;
      }
      doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text(text, x, y + (S_HDR_H - fontSize) / 2, { width, align, lineBreak: false });
    };
    checkPage(S_HDR_H);
    doc.rect(M, y, cW, S_HDR_H).fill(COLORS.TABLE_HEAD);
    doc.lineWidth(0.75).rect(M, y, cW, S_HDR_H).strokeColor('#000000').stroke();
    let hx = M;
    sHdrs.forEach((h, i) => {
      drawHeaderCell(h, hx + 4, S_COLS[i] - 8, sAligns[i]);
      if (i < sHdrs.length - 1) {
        doc.lineWidth(0.5).moveTo(hx + S_COLS[i], y).lineTo(hx + S_COLS[i], y + S_HDR_H).strokeColor('#000000').stroke();
      }
      hx += S_COLS[i];
    });
    y += S_HDR_H;

    // Data rows
    let lineItems = invoice.line_items || [];
    if (typeof lineItems === 'string') {
      try { lineItems = JSON.parse(lineItems); } catch { lineItems = []; }
    }
    if (!Array.isArray(lineItems)) lineItems = [];
    let subtotal = 0;
    const DATA_ROW_H = 32; // Increased row height to accommodate description with drawing number

    lineItems.forEach((item, idx) => {
      checkPage(DATA_ROW_H);
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const lineTotal = qty * unitPrice;
      subtotal += lineTotal;
      
      // Use standardized description format: Part Name | Material Category | Material Grade | Condition
      // Drawing / Part No on separate line below
      const { description: stdDesc, drawingDisplay } = buildDescription({
        job_description: item.description || item.job_description || '',
        part_name: item.part_name || item.part || '',
        material: item.material || item.material_category || '',
        material_grade: item.material_grade || '',
        condition: item.condition || '',
        drawing_part_no: item.drawing_part_no || item.part || '',
        drawing_revision: item.drawing_revision || '',
      });

      // Calculate dynamic row height based on description + drawing
      const descW = S_COLS[1] - 12;
      let dynRowH = DATA_ROW_H;
      if (drawingDisplay && stdDesc) {
        doc.fontSize(8.5).font('Helvetica');
        const _descH = doc.heightOfString(stdDesc, { width: descW });
        doc.fontSize(7).font('Helvetica');
        const _drawH = doc.heightOfString(drawingDisplay, { width: descW });
        dynRowH = Math.max(DATA_ROW_H, _descH + _drawH + 10);
      } else if (stdDesc) {
        doc.fontSize(8.5).font('Helvetica');
        const _descH = doc.heightOfString(stdDesc, { width: descW });
        dynRowH = Math.max(DATA_ROW_H, _descH + 8);
      }

      checkPage(dynRowH);
      const bg = idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

      doc.rect(M, y, cW, dynRowH).fill(bg);
      doc.lineWidth(0.5).rect(M, y, cW, dynRowH).strokeColor('#000000').stroke();

      // Column dividers
      let dx = M;
      for (let di = 0; di < S_COLS.length - 1; di++) {
        dx += S_COLS[di];
        doc.lineWidth(0.5).moveTo(dx, y).lineTo(dx, y + dynRowH).strokeColor('#000000').stroke();
      }

      const rowMid = y + (dynRowH - 9) / 2;
      let cx = M;
      doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK);
      // # column
      doc.text(String(idx + 1), cx + 4, rowMid, { width: S_COLS[0] - 8, align: 'center', lineBreak: false });
      cx += S_COLS[0];
      // Description column - Quotation-style two-part rendering
      if (drawingDisplay && stdDesc) {
        doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        const descH = doc.heightOfString(stdDesc, { width: descW });
        doc.text(stdDesc, cx + 6, y + 4, { width: descW, lineBreak: true });
        doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
        doc.text(drawingDisplay, cx + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
      } else {
        doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        doc.text(stdDesc || '-', cx + 6, y + 4, { width: descW, lineBreak: true, height: dynRowH - 8 });
      }
      cx += S_COLS[1];
      // Unit Price
      doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK);
      doc.text(fmtCurrency(unitPrice), cx + 6, rowMid, { width: S_COLS[2] - 12, align: 'right', lineBreak: false });
      cx += S_COLS[2];
      // Quantity
      doc.text(String(qty), cx + 4, rowMid, { width: S_COLS[3] - 8, align: 'center', lineBreak: false });
      cx += S_COLS[3];
      // Total Price
      doc.text(fmtCurrency(lineTotal), cx + 6, rowMid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });

      y += dynRowH;
    });

    if (lineItems.length === 0) {
      checkPage(DATA_ROW_H);
      doc.rect(M, y, cW, DATA_ROW_H).fill(COLORS.ROW_ALT);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('No items', M + 4, y + (DATA_ROW_H - 8) / 2, { width: cW - 8, align: 'center' });
      doc.lineWidth(0.5).rect(M, y, cW, DATA_ROW_H).strokeColor('#000000').stroke();
      y += DATA_ROW_H;
    }

    // ------ Totals rows (styled like Quotation) ------
    const taxType = invoice.tax_type || 'Exempt';
    const taxPct = taxType === 'Exempt' ? 0 : (Number(invoice.tax_percent) || 0);
    const taxAmt = subtotal * (taxPct / 100);
    const shippingCharges = Number(invoice.shipping_charges) || 0;
    const taxLabel = taxType === 'Exempt' || !taxType ? 'Exempt' : `${taxPct}%`;
    const labelW = S_COLS[0] + S_COLS[1] + S_COLS[2] + S_COLS[3];
    const TOTAL_ROW_H = 25;

    const drawTotalRow = (label, amount, isGrand = false) => {
      const rH = isGrand ? 28 : TOTAL_ROW_H;
      checkPage(rH);
      if (isGrand) {
        doc.rect(M, y, cW, rH).fill(COLORS.GT_BG);
        doc.lineWidth(0.75).rect(M, y, cW, rH).strokeColor(COLORS.BORDER).stroke();
        doc.lineWidth(1.2).moveTo(M, y).lineTo(M + cW, y).strokeColor(COLORS.GT_BORDER).stroke();
        doc.lineWidth(0.5).moveTo(M + labelW, y).lineTo(M + labelW, y + rH).strokeColor(COLORS.BORDER).stroke();
        const gtMid = y + (rH - 9) / 2;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
        doc.text(label, M + 11, gtMid, { width: labelW - 22, align: 'right', lineBreak: false });
        doc.text(fmtCurrency(amount), M + labelW + 6, gtMid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });
      } else {
        doc.rect(M, y, cW, rH).fill(COLORS.ROW_WHITE);
        doc.lineWidth(0.5).rect(M, y, cW, rH).strokeColor(COLORS.BORDER).stroke();
        doc.lineWidth(0.5).moveTo(M + labelW, y).lineTo(M + labelW, y + rH).strokeColor(COLORS.BORDER).stroke();
        const mid = y + (rH - 9) / 2;
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
        doc.text(label, M + 11, mid, { width: labelW - 22, align: 'right', lineBreak: false });
        doc.font('Helvetica').text(fmtCurrency(amount), M + labelW + 6, mid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });
      }
      y += rH;
    };

    drawTotalRow('Subtotal', subtotal);
    drawTotalRow(`Tax | ${taxLabel}`, taxAmt);
    drawTotalRow('Shipping Charges', shippingCharges);
    const computedTotal = subtotal + taxAmt + shippingCharges;
    drawTotalRow('Grand Total', computedTotal, true);
    y += 16;

    // --------- 2. TERMS AND CONDITIONS ---------
    checkPage(34);
    y += 10;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
       .text('2. Terms And Conditions of Sale', M, y);
    y += 18;
    doc.lineWidth(0.5).moveTo(M, y).lineTo(M + cW, y).strokeColor(COLORS.BORDER_LIGHT).stroke();
    y += 8;

    const defaultTerms = [
      { t: 'Delivery Timeline:', b: 'As per purchase order requirements. Seller will notify Buyer of any delays.' },
      { t: 'Payment Terms:', b: invoice.payment_terms || 'Net 30 days from invoice date. Payment via bank transfer.' },
      { t: 'Taxation:', b: 'All prices are exclusive of applicable taxes unless stated otherwise. Buyer is responsible for all applicable taxes.' },
      { t: 'Confidentiality:', b: 'Both parties agree to maintain confidentiality of all proprietary information exchanged in connection with this transaction.' },
    ];
    const savedTerms = Array.isArray(invoice.terms_conditions) && invoice.terms_conditions.length > 0
      ? invoice.terms_conditions.map(tc => ({ t: tc.title || tc.t || '', b: tc.body || tc.b || '' }))
      : null;
    const terms = savedTerms || defaultTerms;

    // Measure T&C section height for page break check
    const tcTotalHeight = terms.reduce((sum, sec) => {
      const titleH = doc.heightOfString(sec.t, { width: cW - 8 }) + 2;
      const bodyH = doc.heightOfString(sec.b, { width: cW - 16 }) + 8;
      return sum + titleH + bodyH;
    }, 0);
    checkPage(Math.min(tcTotalHeight, 150));

    terms.forEach((sec, idx) => {
      checkPage(30);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text(`${idx + 1}. ${sec.t}`, M + 6, y, { width: cW - 12 });
      y = doc.y + 3;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(sec.b, M + 12, y, { width: cW - 24, align: 'justify', lineBreak: true });
      y = doc.y + 10;
    });

    // Notes
    if (invoice.notes) {
      checkPage(30);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK).text('Notes:', M + 6, y, { width: cW - 12 });
      y = doc.y + 3;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(invoice.notes, M + 12, y, { width: cW - 24 });
      y = doc.y + 10;
    }

    // --------- FOOTER ---------
    drawGlobalFooter(doc, company);
    doc.end();

    const pdfBuffer = await pdfReady;
    const safeNum = (invoice.invoice_number || 'INV').replace(/[^a-zA-Z0-9_\-]/g, '-');

    // Generate standardized filename using naming service
    const { generateDocumentName } = require('../services/documentNamingService');
    let filename;
    try {
      const { fileName: stdFilename } = await generateDocumentName({
        documentType: 'invoice',
        projectName: invoice.project_name,
        reference: invoice.invoice_number,
        projectId: invoice.project_id,
      });
      filename = stdFilename;
    } catch (nameErr) {
      // Fallback if naming fails (e.g. missing reference)
      filename = `${typeLabel.replace(/\s+/g, '-')}-${safeNum}.pdf`;
    }

    // Save as Document record (now routes through UnifiedFileService)
    if (invoice.project_id) {
      try { await documentService.saveGeneratedPdf(invoice.project_id, req.user?.id, 'invoice', pdfBuffer, filename); } catch (e) { console.warn('saveGeneratedPdf invoice failed:', e.message); }
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ message: err.message });
  }
};

// --------- Analytics metrics ---------
exports.getAnalyticsData = async (req, res) => {
  try {
    // Total Revenue from Invoice totals
    const allInvoices = await Invoice.findAll();
    const totalRevenue = allInvoices.reduce((sum, inv) => sum + Number(inv.final_total || 0), 0);

    // Manufacturing Costs from VendorPurchaseOrders (material) + Estimates (process)
    const allVPOs = await VendorPurchaseOrder.findAll();
    const rawMaterialCost = allVPOs.reduce((sum, vpo) => sum + Number(vpo.grand_total || 0), 0);

    const allEstimates = await Estimate.findAll({ where: { is_approved: true } });
    const processCost = allEstimates.reduce((sum, est) => sum + Number(est.process_cost || 0), 0);

    const totalManufacturingCost = rawMaterialCost + processCost;
    const totalProfit = totalRevenue - totalManufacturingCost;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    // Active Orders (projects in production, quality, logistics stages)
    const activeOrders = await Project.count({
      where: { status: { [Op.in]: ['in_production', 'inspected', 'shipped'] } },
    });

    // Top Customers by revenue
    const customerRevenue = {};
    allInvoices.forEach((inv) => {
      const name = inv.customer_name || 'Unknown';
      customerRevenue[name] = (customerRevenue[name] || 0) + Number(inv.final_total || 0);
    });
    const topCustomers = Object.entries(customerRevenue)
      .map(([name, revenue]) => ({ customer_name: name, total_revenue: revenue }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10);

    // Revenue by month (for trend chart)
    const revenueByMonth = {};
    allInvoices.forEach((inv) => {
      const month = String(inv.invoice_date).slice(0, 7); // YYYY-MM
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.final_total || 0);
    });
    const revenueTrend = Object.entries(revenueByMonth)
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Material usage from VendorPOItems
    const allVPOItems = await VendorPOItem.findAll();
    const materialUsage = {};
    allVPOItems.forEach((item) => {
      const name = item.part_description || 'Unknown Material';
      if (!materialUsage[name]) {
        materialUsage[name] = { material_name: name, total_purchased: 0, total_used: 0, remaining: 0 };
      }
      materialUsage[name].total_purchased += Number(item.quantity || 0);
      materialUsage[name].total_used += Number(item.quantity || 0); // Default: used = purchased
    });

    res.json({
      data: {
        totalRevenue,
        totalManufacturingCost,
        rawMaterialCost,
        processCost,
        totalProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
        activeOrders,
        topCustomers,
        revenueTrend,
        materialUsage: Object.values(materialUsage),
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ message: err.message });
  }
};
