'use strict';
/**
 * Request for Quotation (RFQ) Bundle PDF generator.
 * Ported from backend/src/services/vendorProcurementService.js generateRFQBundlePdf().
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');

function generateRFQPdf(payload) {
  const { company: companySettings } = payload;
  const rfqBundle = payload.rfqBundle || payload.rfq_bundle || {};

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M      = SIDE_MARGIN;
    const pageW  = doc.page.width;
    const pageH  = doc.page.height;
    const cW     = pageW - 2 * M;
    const FTRH   = 30;

    const C_DARK   = COLORS.TEXT_DARK;
    const C_BORDER = COLORS.BORDER;
    const C_HDR    = COLORS.TABLE_HEAD;
    const C_ALT    = COLORS.ROW_ALT;

    let y = M;
    const checkPage = (needed) => {
      if (y + needed > pageH - FTRH - 8) { doc.addPage(); y = M; }
    };

    const drawHdr = (cols, hdrs, aligns) => {
      doc.rect(M, y, cW, 20).fill(C_HDR);
      let hx = M;
      hdrs.forEach((h, i) => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFF')
           .text(h, hx + 4, y + 5, { width: cols[i] - 8, align: aligns?.[i] || 'left', lineBreak: false });
        hx += cols[i];
      });
      doc.lineWidth(1.2).rect(M, y, cW, 20).strokeColor(C_BORDER).stroke();
      hx = M;
      cols.forEach((w, i) => {
        if (i < cols.length - 1) doc.lineWidth(0.5).moveTo(hx + w, y).lineTo(hx + w, y + 20).strokeColor(C_BORDER).stroke();
        hx += w;
      });
      y += 20;
    };

    const drawRow = (cols, cells, rowH, bg = '#FFF') => {
      if (y + rowH > pageH - FTRH - 8) { doc.addPage(); y = M; }
      doc.rect(M, y, cW, rowH).fill(bg);
      let rx = M;
      cells.forEach((cell, i) => {
        const txt = typeof cell === 'object' ? (cell.text ?? '') : String(cell ?? '');
        const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
        const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
        doc.fontSize(8).font(fnt).fillColor(C_DARK)
           .text(txt, rx + 4, y + 4, { width: cols[i] - 8, align: aln, lineBreak: true, height: rowH - 8 });
        if (i < cells.length - 1)
          doc.lineWidth(0.3).moveTo(rx + cols[i], y).lineTo(rx + cols[i], y + rowH).strokeColor(C_BORDER).stroke();
        rx += cols[i];
      });
      doc.lineWidth(0.3).rect(M, y, cW, rowH).strokeColor(C_BORDER).stroke();
      y += rowH;
    };

    // ── HEADER ──────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'Request for Quotation');

    // ── TO / PREPARED BY BOX ────────────────────────────────────────────────
    const vendor   = rfqBundle.vendor || {};
    const creator  = rfqBundle.creator || {};
    const halfW    = Math.floor(cW / 2);
    const lnH      = 14;
    const TO_H     = 20 + lnH * 6;

    doc.lineWidth(0.8).rect(M, y, cW, TO_H).strokeColor('#000').stroke();
    doc.lineWidth(0.5).moveTo(M + halfW, y).lineTo(M + halfW, y + TO_H).strokeColor('#000').stroke();

    ['To', 'Prepared By'].forEach((lbl, side) => {
      const bx = M + side * halfW;
      doc.rect(bx, y, halfW, 14).fill(C_HDR);
      doc.lineWidth(0.3).rect(bx, y, halfW, 14).strokeColor(C_BORDER).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFF')
         .text(lbl, bx + 5, y + 3, { width: halfW - 10, lineBreak: false });
    });

    let toY = y + 17;
    doc.fontSize(8).font('Helvetica').fillColor('#000');
    doc.font('Helvetica-Bold').text(vendor.vendor_name || '-', M + 4, toY, { width: halfW - 8, lineBreak: false }); toY += lnH;
    doc.font('Helvetica').text(vendor.address || '-', M + 4, toY, { width: halfW - 8, lineBreak: true }); toY += lnH;
    if (vendor.email) { doc.text(`Email: ${vendor.email}`, M + 4, toY, { width: halfW - 8, lineBreak: false }); toY += lnH; }
    if (vendor.phone) { doc.text(`Phone: ${vendor.phone}`, M + 4, toY, { width: halfW - 8, lineBreak: false }); }

    const pbX = M + halfW + 4;
    const pbW = halfW - 8;
    let pbY = y + 17;
    doc.font('Helvetica-Bold').text(companySettings.name || '', pbX, pbY, { width: pbW, lineBreak: false }); pbY += lnH;
    doc.font('Helvetica').text(`Contact: ${creator.name || companySettings.contact_person || '-'}`, pbX, pbY, { width: pbW, lineBreak: false }); pbY += lnH;
    if (creator.email || companySettings.email) {
      doc.text(`Email: ${creator.email || companySettings.email || '-'}`, pbX, pbY, { width: pbW, lineBreak: false }); pbY += lnH;
    }
    if (creator.phone || companySettings.phone) {
      doc.text(`Phone: ${creator.phone || companySettings.phone || '-'}`, pbX, pbY, { width: pbW, lineBreak: false }); pbY += lnH;
    }
    if (companySettings.address) {
      doc.text(companySettings.address, pbX, pbY, { width: pbW, lineBreak: false });
    }
    y += TO_H + 4;

    // ── RFQ NO / DATE STRIP ─────────────────────────────────────────────────
    const STRIP_H = 22;
    const stripHalfW = Math.floor(cW / 2);
    doc.rect(M, y, cW, STRIP_H).fill(COLORS.GT_BG);
    doc.lineWidth(0.5).rect(M, y, cW, STRIP_H).strokeColor(C_BORDER).stroke();
    doc.lineWidth(0.4).moveTo(M + stripHalfW, y).lineTo(M + stripHalfW, y + STRIP_H).strokeColor(C_BORDER).stroke();

    const rfqDate = rfqBundle.rfq_date
      ? dayjs(rfqBundle.rfq_date).format('DD/MM/YYYY')
      : (rfqBundle.date ? dayjs(rfqBundle.date).format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY'));

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_DARK)
       .text(`RFQ No: `, M + 6, y + 6, { continued: true, width: stripHalfW - 12 });
    doc.font('Helvetica').text(rfqBundle.rfq_number || rfqBundle.rfq_bundle_number || '-');

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_DARK)
       .text(`Date: `, M + stripHalfW + 6, y + 6, { continued: true, width: stripHalfW - 12 });
    doc.font('Helvetica').text(rfqDate);
    y += STRIP_H + 10;

    // ── SUMMARY TABLE ────────────────────────────────────────────────────────
    checkPage(40);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
       .text('Summary of Requirement', M, y);
    y += 12;

    const items = rfqBundle.items || rfqBundle.rfq_items || [];
    const S_COLS = [30, 0, 80, 80, 120];
    S_COLS[1] = cW - S_COLS.reduce((a, b) => a + b, 0) + S_COLS[1];
    drawHdr(S_COLS,
      ['S.No', 'Description', 'Quantity', 'Unit', 'Part Number'],
      ['center','left','center','center','center']);

    if (items.length > 0) {
      items.forEach((item, idx) => {
        const descParts = [];
        if (item.job_description || item.description) descParts.push(item.job_description || item.description);
        if (item.material) descParts.push(`Material: ${item.material}`);
        if (item.material_grade) descParts.push(`Grade: ${item.material_grade}`);
        const descText = descParts.join(' | ') || '-';
        drawRow(S_COLS, [
          { text: String(idx + 1), align: 'center' },
          { text: descText },
          { text: String(item.quantity || '-'), align: 'center' },
          { text: item.unit || 'pcs', align: 'center' },
          { text: item.drawing_part_no || item.part_number || '-', align: 'center' },
        ], 22, idx % 2 === 0 ? '#FFF' : C_ALT);
      });
    } else {
      drawRow(S_COLS, ['', 'No items', '', '', ''], 22, C_ALT);
    }
    y += 14;

    // ── INSTRUCTIONS ────────────────────────────────────────────────────────
    const instructions = rfqBundle.instructions || rfqBundle.special_instructions || '';
    const needBy       = rfqBundle.need_materials_before || rfqBundle.need_by_date;
    if (instructions || needBy) {
      checkPage(40);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Instructions / Notes', M, y);
      y += 12;
      if (needBy) {
        doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK)
           .text(`\u2022  Materials required by: ${dayjs(needBy).format('DD/MM/YYYY')}`, M + 8, y, { width: cW - 16 });
        y = doc.y + 6;
      }
      if (instructions) {
        instructions.trim().split('\n').filter(l => l.trim()).forEach(line => {
          doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK)
             .text(`\u2022  ${line.trim()}`, M + 8, y, { width: cW - 16 });
          y = doc.y + 6;
        });
      }
    }

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateRFQPdf };
