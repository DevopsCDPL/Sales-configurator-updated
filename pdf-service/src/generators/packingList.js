'use strict';
/**
 * Packing List PDF generator.
 * Layout matches backend/src/services/logisticsService.js generatePackingListPdf().
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildDescription } = require('../utils/calculations');

function generatePackingListPdf(payload) {
  const { company: companySettings, project } = payload;
  // senderUser = the authenticated user who generated the PDF (comes from project.preparedBy)
  const senderUser = project.preparedBy || payload.user || {};

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin   = 45;
    const pageW    = doc.page.width;
    const pageH    = doc.page.height;
    const cW       = pageW - 2 * margin;
    const FOOTER_H = 34;

    const C_DARK   = COLORS.TEXT_DARK;
    const C_MED    = COLORS.TEXT_MED;
    const C_NAVY   = COLORS.TABLE_HEAD;
    const C_BORDER = COLORS.BORDER;
    const C_HDR    = COLORS.TABLE_HEAD;
    const C_ALT    = COLORS.ROW_ALT;

    let y = margin;
    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
    };

    const drawTblHdr = (cols, hdrs, aligns) => {
      doc.rect(margin, y, cW, 22).fill(C_HDR);
      let hx = margin;
      hdrs.forEach((h, i) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text(h, hx + 4, y + 7, { width: cols[i] - 8, align: aligns?.[i] || 'center', lineBreak: false });
        hx += cols[i];
      });
      doc.lineWidth(1.5).rect(margin, y, cW, 22).strokeColor(C_BORDER).stroke();
      hx = margin;
      cols.forEach((w, i) => {
        if (i < cols.length - 1) doc.lineWidth(1.5).moveTo(hx + w, y).lineTo(hx + w, y + 22).strokeColor(C_BORDER).stroke();
        hx += w;
      });
      y += 22;
    };

    const drawRow = (cols, cells, rowH, bg = '#FFFFFF') => {
      if (y + rowH > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
      doc.rect(margin, y, cW, rowH).fill(bg);
      let rx = margin;
      cells.forEach((cell, i) => {
        const txt = typeof cell === 'object' ? (cell.text ?? '') : String(cell ?? '');
        const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
        const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
        doc.fontSize(8.5).font(fnt).fillColor(C_DARK)
           .text(txt, rx + 5, y + 4, { width: cols[i] - 10, align: aln, lineBreak: true, height: rowH - 8 });
        if (i < cells.length - 1)
          doc.lineWidth(0.3).moveTo(rx + cols[i], y).lineTo(rx + cols[i], y + rowH).strokeColor(C_BORDER).stroke();
        rx += cols[i];
      });
      y += rowH;
    };

    const drawSection = (title) => {
      checkPage(30);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(C_NAVY).text(title, margin, y);
      y += 16;
    };

    // ── Data resolution ───────────────────────────────────────────────────────
    const estimates   = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const selectedEst = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    const so          = project.salesOrder || {};
    const wo          = project.workOrder  || {};
    const client      = project.client     || {};

    // pl = the PackingList object sent from LogisticsTab
    const pl = payload.packingList || payload.packing_list || {};

    const plDate   = pl.shipment_date ? dayjs(pl.shipment_date).format('DD-MMM-YY') : dayjs().format('DD-MMM-YY');
    const poNumber = so.customer_po_number || so.po_number || pl.po_number || '';

    // Resolve which jobs to render
    const customParts = selectedEst?.custom_parts || [];
    const jobDetails  = pl.job_details || {};
    const selectedJobIndices = Array.isArray(pl.selected_job_indices) ? pl.selected_job_indices : [];
    const selectedJobs = selectedJobIndices.map(idx => {
      const part = { ...(customParts[idx] || {}) };
      // Merge user-entered quantity/weight (supports partial shipments)
      if (jobDetails[idx]) {
        if (jobDetails[idx].quantity)       part.quantity       = jobDetails[idx].quantity;
        if (jobDetails[idx].weight_per_unit) part.weight_per_unit = jobDetails[idx].weight_per_unit;
        if (jobDetails[idx].weight_unit)    part.weight_unit    = jobDetails[idx].weight_unit;
        if (jobDetails[idx].total_weight)   part.total_weight   = jobDetails[idx].total_weight;
      }
      return { idx, part };
    });

    // ── HEADER ────────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'PACKING LIST');

    // ── DATE (right-aligned) ──────────────────────────────────────────────────
    doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK)
       .text(`Date: ${plDate}`, margin, y, { width: cW, align: 'right' });
    y += 14;

    // ── PACKING INFO TABLE (4-column: label|value|label|value) ───────────────
    const lLabelW = cW * 0.22;
    const lValueW = cW * 0.28;
    const rLabelW = cW * 0.22;
    const rValueW = cW - lLabelW - lValueW - rLabelW;

    const infoRows = [
      { ll: 'Packing Slip Number', lv: pl.number || '',            rl: 'Receiver Name',    rv: pl.receiver_name    || client.poc_name  || '' },
      { ll: 'Shipped Via',         lv: pl.shipment_method || '',   rl: 'Receiver Contact', rv: pl.receiver_phone   || client.poc_phone || '' },
      { ll: 'Carrier',             lv: pl.carrier || '',           rl: 'Sender Detail',    rv: companySettings.name || senderUser.name  || senderUser.email || '' },
      { ll: 'Tracking Number',     lv: pl.tracking_number || '',   rl: 'Vehicle Type',     rv: pl.vehicle_type     || '' },
      { ll: 'Purchase Order No',   lv: poNumber,                   rl: 'Vehicle Number',   rv: pl.vehicle_number   || '' },
      { ll: 'Billing Address',     lv: pl.bill_to_address || client.address || '', rl: 'Shipping Address', rv: pl.ship_to_address || project.ship_to_address || '' },
    ];

    // Table header — single wide column with title
    drawTblHdr([cW], ['Packing Information'], ['center']);

    const infoCols = [lLabelW, lValueW, rLabelW, rValueW];
    infoRows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? '#FFFFFF' : C_ALT;
      const cells = [
        { text: row.ll, bold: true },
        { text: row.lv },
        { text: row.rl, bold: true },
        { text: row.rv },
      ];

      // Calculate row height based on potentially long text values
      let rowH = 24;
      [1, 3].forEach(ci => {
        if (cells[ci].text) {
          doc.fontSize(8.5).font('Helvetica');
          const h = doc.heightOfString(cells[ci].text, { width: infoCols[ci] - 10 });
          rowH = Math.max(rowH, h + 8);
        }
      });

      drawRow(infoCols, cells, rowH, bg);
    });
    y += 14;

    // ── MATERIAL DETAILS ──────────────────────────────────────────────────────
    checkPage(60);
    drawSection('1. Material Details');

    const snW     = 42;
    const descW   = cW * 0.50;
    const qtyW    = cW * 0.16;
    const weightW = cW - snW - descW - qtyW;

    drawTblHdr([snW, descW, qtyW, weightW],
      ['S.No', 'Description', 'Quantity', 'Weight'],
      ['center', 'left', 'center', 'center']);

    const buildDesc = (part) => {
      const { description, drawingDisplay } = buildDescription({
        job_description:  part.job_description  || '',
        part_name:        part.part_name        || '',
        material:         part.material         || part.material_category || '',
        material_grade:   part.material_grade   || '',
        condition:        part.condition        || '',
        drawing_part_no:  part.drawing_part_no  || '',
        drawing_revision: part.drawing_revision || '',
      });
      return drawingDisplay ? `${description}\n${drawingDisplay}` : description;
    };

    // Use selected jobs if provided; otherwise fall back to all custom_parts
    const partsToRender = selectedJobs.length > 0
      ? selectedJobs.map(({ part }) => part)
      : customParts.length > 0
        ? customParts
        : [];

    if (partsToRender.length === 0) {
      drawRow([snW, descW, qtyW, weightW], [
        { text: '',                      align: 'center' },
        { text: 'No items specified' },
        { text: '',                      align: 'center' },
        { text: '',                      align: 'center' },
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
          { text: qty,           align: 'center' },
          { text: wt,            align: 'center' },
        ], 36, i % 2 === 0 ? '#FFFFFF' : C_ALT);
      });
    }
    y += 22;

    // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
    checkPage(80);
    const SIG_W = 200;
    const sigRX  = margin + cW - SIG_W;

    const preparedByName = senderUser.name || senderUser.email || '';
    const preparedByDate = dayjs().format('DD-MMM-YYYY');
    const receiverNameVal = pl.receiver_name || client.poc_name || '';
    const receiverDate    = dayjs().format('DD-MMM-YYYY');

    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_NAVY)
       .text('Prepared By', margin, y, { width: SIG_W, align: 'left' });
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_NAVY)
       .text('Received By', sigRX, y, { width: SIG_W, align: 'left' });
    y += 16;

    [
      { label: 'Name', value: preparedByName, rValue: receiverNameVal },
      { label: 'Date', value: preparedByDate, rValue: receiverDate },
    ].forEach(({ label, value, rValue }) => {
      // Left column (Prepared By)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(C_MED)
         .text(`${label}:`, margin, y, { width: 70, lineBreak: false });
      doc.lineWidth(0.5).moveTo(margin + 72, y + 10).lineTo(margin + SIG_W, y + 10).strokeColor(C_BORDER).stroke();
      doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
         .text(value, margin + 72, y, { width: SIG_W - 72, lineBreak: false });

      // Right column (Received By)
      doc.fontSize(8).font('Helvetica-Bold').fillColor(C_MED)
         .text(`${label}:`, sigRX, y, { width: 70, lineBreak: false });
      doc.lineWidth(0.5).moveTo(sigRX + 72, y + 10).lineTo(sigRX + SIG_W, y + 10).strokeColor(C_BORDER).stroke();
      doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
         .text(rValue || '', sigRX + 72, y, { width: SIG_W - 72, lineBreak: false });

      y += 18;
    });

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generatePackingListPdf };
