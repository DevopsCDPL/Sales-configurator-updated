const { Project, QualityRecord, Document, Client, SalesOrder, Estimate, WorkOrder } = require('../models');
const { Op } = require('sequelize');
const settingsService = require('./settingsService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const { buildDescription } = require('../utils/calculations');
const clientService = require('./clientService')

// Document types that count as a Certificate of Conformance for shipment
// validation. Covers both system-generated and user-uploaded variants.
const COC_DOC_TYPES = ['coc', 'certificate_of_conformance'];

/**
 * Returns true if the project has a usable Certificate of Conformance — either
 * (a) the quality record has coc_generated=true (system-generated CoC), or
 * (b) all job-level quality forms are finalized, or
 * (c) a CoC document of an accepted type has been uploaded/attached to the
 *     project and has not been soft-deleted.
 */
async function hasCertificateOfConformance(projectId) {
  const qualityRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
  if (qualityRecord?.coc_generated) return true;
  const jobForms = qualityRecord?.job_quality_forms || [];
  if (jobForms.length > 0 && jobForms.every(f => f.isFinalized)) return true;

  const cocDoc = await Document.findOne({
    where: {
      project_id: projectId,
      document_type: { [Op.in]: COC_DOC_TYPES },
      status: { [Op.ne]: 'deleted' },
    },
  });
  return !!cocDoc;
}

class LogisticsService {
  async getLogisticsData(projectId) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    return {
      project_id: projectId,
      ship_to_address: project.ship_to_address,
      shipping_address: project.ship_to_address,
      shipment_method: project.shipment_method || null,
      packaging_details: project.packaging_details || null,
      packaging: project.packaging_details || null,
      dispatch_date: project.dispatch_date || null,
      ship_date: project.dispatch_date || null,
      tracking_number: project.tracking_number || null,
      carrier: project.carrier || null,
      notes: project.logistics_notes || null,
      special_instructions: project.logistics_notes || null,
      packages_json: project.packages_json || null,
      status: project.status
    };
  }

  async updateLogistics(projectId, logisticsData) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Validate project status
    const allowedStatuses = ['order_confirmed', 'in_production', 'inspected', 'shipped', 'closed'];
    if (!allowedStatuses.includes(project.status)) {
      throw new Error('Logistics can only be updated for projects in production or later');
    }

    const {
      ship_to_address,
      shipping_address,
      shipment_method,
      packaging_details,
      packaging,
      dispatch_date,
      ship_date,
      tracking_number,
      carrier,
      notes,
      special_instructions,
      packages_json
    } = logisticsData;

    await project.update({
      ship_to_address: ship_to_address || shipping_address || project.ship_to_address,
      shipment_method: shipment_method || project.shipment_method,
      packaging_details: packaging_details || packaging || project.packaging_details,
      dispatch_date: dispatch_date || ship_date || project.dispatch_date,
      tracking_number: tracking_number || project.tracking_number,
      carrier: carrier || project.carrier,
      logistics_notes: notes || special_instructions || project.logistics_notes,
      packages_json: packages_json !== undefined ? packages_json : project.packages_json
    });

    return this.getLogisticsData(projectId);
  }

  async markAsShipped(projectId, shipmentData = {}) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.status !== 'inspected') {
      throw new Error('Only inspected projects can be marked as shipped');
    }

    // Get dispatch date from shipment data
    const dispatch_date = shipmentData.dispatch_date || shipmentData.ship_date;
    
    if (!dispatch_date) {
      throw new Error('Please set dispatch date before marking as shipped');
    }

    // Update project with shipment data and mark as shipped
    await project.update({ 
      status: 'shipped',
      dispatch_date: dispatch_date,
      tracking_number: shipmentData.tracking_number || project.tracking_number,
      carrier: shipmentData.carrier || project.carrier,
      shipment_method: shipmentData.shipment_method || project.shipment_method,
      ship_to_address: shipmentData.shipping_address || shipmentData.ship_to_address || project.ship_to_address,
      packaging_details: shipmentData.packaging || shipmentData.packaging_details || project.packaging_details,
      logistics_notes: shipmentData.special_instructions || shipmentData.notes || project.logistics_notes,
      packages_json: shipmentData.packages_json !== undefined ? shipmentData.packages_json : project.packages_json
    });

    return project;
  }

  async closeProject(projectId) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.status !== 'shipped') {
      throw new Error('Only shipped projects can be closed');
    }

    await project.update({ status: 'closed' });

    return project;
  }

  getShipmentMethods() {
    return [
      { value: 'ground', label: 'Ground Shipping' },
      { value: 'air', label: 'Air Freight' },
      { value: 'sea', label: 'Sea Freight' },
      { value: 'express', label: 'Express Delivery' },
      { value: 'pickup', label: 'Customer Pickup' }
    ];
  }

  async generatePackingListPdf(projectId, packingListData, jobCount, senderUser) {
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const dayjs = require('dayjs');

    const project = await Project.findByPk(projectId, {
      include: [
        { model: Client, as: 'client' },
        { model: SalesOrder, as: 'salesOrder' },
        { model: Estimate, as: 'estimate' },
      ]
    });
    if (!project) throw new Error('Project not found');
    const companySettings = await settingsService.getCompanySettings(project.company_id);
    // const clientDetails = await clientService.getClientById(project.client_id);

    const workOrder = await WorkOrder.findOne({ where: { project_id: projectId } });
    // estimate is hasMany --- resolve the selected revision (or latest)
    const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const selectedEstimate = project.selected_revision != null
      ? estimates.find(e => e.revision === project.selected_revision) || estimates[estimates.length - 1]
      : estimates[estimates.length - 1];
    const customParts = selectedEstimate?.custom_parts || [];
    const jobDetails = packingListData.job_details || {};
    const selectedJobs = (packingListData.selected_job_indices || []).map(idx => {
      const part = { ...(customParts[idx] || {}) };
      // Resolve bulk-pricing quantity from estimation
      if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
        part.quantity = part.pricing_tiers[0].quantity || part.quantity;
      }
      // Merge user-entered quantity/weight from packing list (supports partial shipments)
      if (jobDetails[idx]) {
        if (jobDetails[idx].quantity) part.quantity = jobDetails[idx].quantity;
        if (jobDetails[idx].total_weight) part.total_weight = jobDetails[idx].total_weight;
        if (jobDetails[idx].weight_unit) part.weight_unit = jobDetails[idx].weight_unit;
      }
      return { idx, part };
    });

    const pl = packingListData;
    const plDate = pl.shipment_date ? dayjs(pl.shipment_date).format('DD-MMM-YY') : dayjs().format('DD-MMM-YY');
    const poNumber = project.salesOrder?.customer_po_number || project.salesOrder?.po_number || '';
    const woNumber = workOrder?.work_order_number || project.project_name || '';

    // Logo path
    const logoPath = settingsService.getLogoAbsolutePath(companySettings.logo);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ------ Layout (identical to CoC PDF) ------------------------------------------------------------------------------------
      const margin   = 45;
      const pageW    = doc.page.width;
      const pageH    = doc.page.height;
      const cW       = pageW - 2 * margin;
      const FOOTER_H = 34;

      // ------ Palette (identical to CoC PDF --- green theme) ------------------------------------------
      const C_DARK   = COLORS.TEXT_DARK;
      const C_MED    = COLORS.TEXT_MED;
      const C_LIGHT  = COLORS.TEXT_LIGHT;
      const C_NAVY   = COLORS.TABLE_HEAD;
      const C_BORDER = COLORS.BORDER;
      const C_HDR    = COLORS.TABLE_HEAD;
      const C_ALT    = COLORS.ROW_ALT;
      let y = margin;

      const checkPage = (needed) => {
        if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
      };

      const hLine = (lw = 0.5, color = C_BORDER) =>
        doc.lineWidth(lw).moveTo(margin, y).lineTo(margin + cW, y).strokeColor(color).stroke();

      // ------ Table helpers (identical to CoC) ---------------------------------------------------------------------------
      const HDR_ROW_H = 22;
      const drawTblHdr = (cols, hdrs, aligns) => {
        checkPage(HDR_ROW_H);
        doc.rect(margin, y, cW, HDR_ROW_H).fill(C_HDR);
        doc.lineWidth(0.5).rect(margin, y, cW, HDR_ROW_H).strokeColor(C_BORDER).stroke();
        let hx = margin;
        hdrs.forEach((h, i) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
             .text(h, hx + 5, y + 7, { width: cols[i] - 10, align: aligns?.[i] || 'center', lineBreak: false });
          if (i < hdrs.length - 1)
            doc.lineWidth(0.3).moveTo(hx + cols[i], y).lineTo(hx + cols[i], y + HDR_ROW_H).strokeColor(C_BORDER).stroke();
          hx += cols[i];
        });
        y += HDR_ROW_H;
      };

      const drawRow = (cols, cells, rowH, bg = '#FFFFFF', descColIdx = -1) => {
        // Calculate dynamic row height for two-part description
        let dynRowH = rowH;
        if (descColIdx >= 0 && cells[descColIdx]) {
          const cellTxt = typeof cells[descColIdx] === 'string' ? cells[descColIdx] : (cells[descColIdx].text || '');
          if (cellTxt.includes('\n')) {
            const parts = cellTxt.split('\n');
            const descW = cols[descColIdx] - 12;
            doc.fontSize(8.5).font('Helvetica');
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.fontSize(7).font('Helvetica');
            const drawH = doc.heightOfString(parts.slice(1).join('\n'), { width: descW });
            dynRowH = Math.max(rowH, descH + drawH + 10);
          }
        }
        checkPage(dynRowH);
        doc.rect(margin, y, cW, dynRowH).fill(bg);
        doc.lineWidth(0.5).rect(margin, y, cW, dynRowH).strokeColor(C_BORDER).stroke();
        let rx = margin;
        cells.forEach((cell, i) => {
          const txt = typeof cell === 'string' ? cell : (cell.text || '');
          const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
          const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
          const clr = (typeof cell === 'object' && cell.color) ? cell.color : C_DARK;
          if (i === descColIdx && txt.includes('\n')) {
            // Two-part description rendering (matches Quotation PDF)
            const parts = txt.split('\n');
            const descW = cols[i] - 12;
            // Line 1: Main description — 8.5pt, black
            doc.fontSize(8.5).font(fnt).fillColor(C_DARK);
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.text(parts[0], rx + 6, y + 4, { width: descW, lineBreak: true });
            // Line 2: Drawing / Part No — 7pt, light gray #6B7280
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
            doc.text(parts.slice(1).join('\n'), rx + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
          } else {
            doc.fontSize(8.5).font(fnt).fillColor(clr)
               .text(txt, rx + 5, y + 4, { width: cols[i] - 10, align: aln, lineBreak: true, height: dynRowH - 6, ellipsis: false });
          }
          if (i < cells.length - 1)
            doc.lineWidth(0.3).moveTo(rx + cols[i], y).lineTo(rx + cols[i], y + dynRowH).strokeColor(C_BORDER).stroke();
          rx += cols[i];
        });
        y += dynRowH;
      };

      // ------ Section title helper (identical to CoC) ---------------------------------------------------
      const drawSection = (title) => {
        checkPage(30);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(C_NAVY).text(title, margin, y);
        y += 16;
      };

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  HEADER --- uses global document header layout
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      y = drawGlobalHeader(doc, companySettings, 'PACKING LIST');

      // ------ DATE (right-aligned) ---------------------------------------------------------------------------------------------------------------
      doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK)
         .text(`Date: ${plDate}`, margin, y, { width: cW, align: 'right' });
      y += 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  PACKING INFO TABLE (4-column: Label | Value | Label | Value)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const lLabelW = cW * 0.22;
      const lValueW = cW * 0.28;
      const rLabelW = cW * 0.22;
      const rValueW = cW - lLabelW - lValueW - rLabelW;

      const infoRows = [
        { ll: 'Packing Slip Number', lv: pl.number || '',       rl: 'Receiver Name',    rv: pl.receiver_name || project.client?.poc_name || '' },
        { ll: 'Shipped Via',         lv: pl.shipment_method || '', rl: 'Receiver Contact', rv: pl.receiver_phone || project.client?.poc_phone || '' },
        { ll: 'Carrier',             lv: pl.carrier || '',       rl: 'Sender Detail',    rv: companySettings.name || senderUser?.name || senderUser?.email || '' },
        { ll: 'Tracking Number',     lv: pl.tracking_number || '', rl: 'Vehicle Type',   rv: pl.vehicle_type || '' },
        { ll: 'Purchase Order No',   lv: poNumber,               rl: 'Vehicle Number',   rv: pl.vehicle_number || '' },
        { ll: 'Billing Address',     lv: pl.bill_to_address || project.client?.address || '', rl: 'Shipping Address', rv: pl.ship_to_address || project.ship_to_address || '' },
      ];

      // Table header
      drawTblHdr([cW], ['Packing Information'], ['center']);

      // Data rows
      infoRows.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#FFFFFF' : C_ALT;
        const cells = [
          { text: row.ll, bold: true },
          { text: row.lv },
          { text: row.rl, bold: true },
          { text: row.rv },
        ];
        const cols = [lLabelW, lValueW, rLabelW, rValueW];
        
        // Calculate required height for cells with long text
        let rowHeight = 24;
        [1, 3].forEach(cellIdx => {
          if (cells[cellIdx].text) {
            doc.fontSize(8.5).font('Helvetica');
            const cellHeight = doc.heightOfString(cells[cellIdx].text, { width: cols[cellIdx] - 10 });
            rowHeight = Math.max(rowHeight, cellHeight + 8);
          }
        });
        
        drawRow(cols, cells, rowHeight, bg);
      });
      y += 14;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  MATERIAL DETAILS
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(60);
      drawSection('1. Material Details');

      const snW    = 42;
      const descW  = cW * 0.50;
      const qtyW   = cW * 0.16;
      const weightW = cW - snW - descW - qtyW;
      drawTblHdr([snW, descW, qtyW, weightW],
        ['S.No', 'Description', 'Quantity', 'Weight'],
        ['center', 'left', 'center', 'center']);

      // Build description in standardized format: Part Name | Material Category | Material Grade | Condition
      const buildDesc = (part) => {
        const { description, drawingDisplay } = buildDescription({
          job_description: part.job_description || '',
          part_name: part.part_name || '',
          material: part.material || part.material_category || '',
          material_grade: part.material_grade || '',
          condition: part.condition || '',
          drawing_part_no: part.drawing_part_no || '',
          drawing_revision: part.drawing_revision || '',
        });
        return drawingDisplay ? `${description}\n${drawingDisplay}` : description;
      };

      // Determine which parts to render
      const partsToRender = selectedJobs.length > 0
        ? selectedJobs.map(({ part }) => part)
        : customParts.length > 0
          ? customParts
          : [];

      if (partsToRender.length === 0) {
        drawRow([snW, descW, qtyW, weightW], [
          { text: '', align: 'center' },
          { text: 'No items specified', color: C_LIGHT },
          { text: '', align: 'center' },
          { text: '', align: 'center' },
        ], 26, '#FFFFFF');
      } else {
        partsToRender.forEach((part, i) => {
          const qty = part.quantity ? String(part.quantity) : '';
          const wt  = part.total_weight
            ? `${part.total_weight} ${part.weight_unit || 'kg'}`
            : (part.weight ? String(part.weight) : '');
          drawRow([snW, descW, qtyW, weightW], [
            { text: String(i + 1), align: 'center' },
            { text: buildDesc(part) },
            { text: qty, align: 'center' },
            { text: wt, align: 'center' },
          ], 36, i % 2 === 0 ? '#FFFFFF' : C_ALT, 1);
        });
      }
      y += 22;

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  SIGNATURE BLOCK (identical to CoC)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      checkPage(80);
      const SIG_W = 200;

      // Prepared By --- left side
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_NAVY)
         .text('Prepared By', margin, y, { width: SIG_W, align: 'left' });
      // Received By --- right side
      const sigRX = margin + cW - SIG_W;
      const preparedByName = senderUser?.name || senderUser?.email || '';
      const preparedByPosition = senderUser?.position || '';
      const preparedByDate = dayjs().format('DD-MMM-YYYY');

      // Add the receiver details
      const receiverName = pl.receiver_name || project.client?.poc_name || '';
      // const receiverDesignation = clientDetails?.position; // if available
      const receiverDate = dayjs().format('DD-MMM-YYYY'); // optional

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_NAVY)
         .text('Received By', sigRX, y, { width: SIG_W, align: 'left' });
      y += 16;

      [
        { label: 'Name', value: preparedByName, rValue: receiverName },
        // { label: 'Designation', value: preparedByPosition, rValue: receiverDesignation },
        { label: 'Date', value: preparedByDate, rValue: receiverDate },
      ].forEach(({ label, value, rValue }) => {
        // LEFT (Prepared By)
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C_MED).text(`${label}:`, margin, y, { width: 70, lineBreak: false });
        doc.lineWidth(0.5).moveTo(margin + 72, y + 10).lineTo(margin + SIG_W, y + 10).strokeColor(C_BORDER).stroke();
        doc.fontSize(8).font('Helvetica').fillColor(C_DARK).text(value, margin + 72, y, { width: SIG_W - 72, lineBreak: false });

        // RIGHT (Received By) FIX
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C_MED).text(`${label}:`, sigRX, y, { width: 70, lineBreak: false });
        doc.lineWidth(0.5).moveTo(sigRX + 72, y + 10).lineTo(sigRX + SIG_W, y + 10).strokeColor(C_BORDER).stroke();
        doc.fontSize(8).font('Helvetica').fillColor(C_DARK).text(rValue || '', sigRX + 72, y, { width: SIG_W - 72, lineBreak: false });

        y += 18;
      });

      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      //  FOOTER --- all pages (identical to CoC)
      // ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }
}

module.exports = new LogisticsService();
