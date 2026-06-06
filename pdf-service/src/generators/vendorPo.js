'use strict';
/**
 * Vendor Purchase Order PDF generator.
 * Ported from backend/src/services/vendorProcurementService.js generateVendorPOPdf().
 * Note: Java backend pre-builds itemDescriptions as { [itemId]: descriptionString }
 * and passes it in payload.vendorPo.itemDescriptions.
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');

function generateVendorPOPdf(payload) {
  const { company: companySettings } = payload;
  const vendorPo = payload.vendorPo || payload.vendor_po || {};

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

    // ── Resolve data ─────────────────────────────────────────────────────────
    const vendor       = vendorPo.vendor   || {};
    const creator      = vendorPo.creator  || {};
    const rfqBundle    = vendorPo.rfqBundle || vendorPo.rfq_bundle || {};
    const poProject    = vendorPo.project   || {};
    const items        = vendorPo.items     || vendorPo.po_items || [];
    const descMap      = vendorPo.itemDescriptions || {};   // pre-built by Java backend

    // ── HEADER ──────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'Purchase Order');

    // ── TO / PREPARED BY BOX ────────────────────────────────────────────────
    const halfW = Math.floor(cW / 2);
    const lnH   = 14;
    const TO_H  = 20 + lnH * 6;

    doc.lineWidth(0.8).rect(M, y, cW, TO_H).strokeColor('#000').stroke();
    doc.lineWidth(0.5).moveTo(M + halfW, y).lineTo(M + halfW, y + TO_H).strokeColor('#000').stroke();

    ['Vendor', 'Ship To'].forEach((lbl, side) => {
      const bx = M + side * halfW;
      doc.rect(bx, y, halfW, 14).fill(C_HDR);
      doc.lineWidth(0.3).rect(bx, y, halfW, 14).strokeColor(C_BORDER).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#FFF')
         .text(lbl, bx + 5, y + 3, { width: halfW - 10, lineBreak: false });
    });

    let toY = y + 17;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000').text(vendor.vendor_name || '-', M + 4, toY, { width: halfW - 8 }); toY += lnH;
    doc.font('Helvetica').fillColor('#000').text(vendor.address || '-', M + 4, toY, { width: halfW - 8 }); toY += lnH;
    if (vendor.email) { doc.text(`Email: ${vendor.email}`, M + 4, toY, { width: halfW - 8 }); toY += lnH; }
    if (vendor.phone) { doc.text(`Phone: ${vendor.phone}`, M + 4, toY, { width: halfW - 8 }); }

    const shipToX = M + halfW + 4;
    const shipToW = halfW - 8;
    let stY = y + 17;
    doc.font('Helvetica-Bold').text(companySettings.name || '', shipToX, stY, { width: shipToW }); stY += lnH;
    doc.font('Helvetica').text(companySettings.address || '-', shipToX, stY, { width: shipToW }); stY += lnH;
    doc.text(`Contact: ${creator.name || companySettings.contact_person || '-'}`, shipToX, stY, { width: shipToW }); stY += lnH;
    if (creator.email || companySettings.email) doc.text(`Email: ${creator.email || companySettings.email}`, shipToX, stY, { width: shipToW });
    y += TO_H + 4;

    // ── PO INFO STRIP ────────────────────────────────────────────────────────
    const STRIP_H    = 22;
    const stripQuarterW = Math.floor(cW / 4);
    doc.rect(M, y, cW, STRIP_H).fill(COLORS.GT_BG);
    doc.lineWidth(0.5).rect(M, y, cW, STRIP_H).strokeColor(C_BORDER).stroke();
    [1, 2, 3].forEach(i =>
      doc.lineWidth(0.4).moveTo(M + stripQuarterW * i, y).lineTo(M + stripQuarterW * i, y + STRIP_H).strokeColor(C_BORDER).stroke()
    );

    const poDate = vendorPo.po_date
      ? dayjs(vendorPo.po_date).format('DD/MM/YYYY')
      : dayjs().format('DD/MM/YYYY');

    [
      { label: 'PO Number:',     value: vendorPo.po_number || vendorPo.vendor_po_number || '-' },
      { label: 'PO Date:',       value: poDate },
      { label: 'RFQ Number:',    value: rfqBundle.rfq_number || rfqBundle.rfq_bundle_number || '-' },
      { label: 'Payment Terms:', value: vendorPo.payment_terms || '30 Days Net' },
    ].forEach(({ label, value }, i) => {
      const px = M + stripQuarterW * i + 5;
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(C_DARK)
         .text(label + ' ', px, y + 6, { continued: true, width: stripQuarterW - 10 });
      doc.font('Helvetica').text(value);
    });
    y += STRIP_H + 10;

    // ── ITEMS TABLE ──────────────────────────────────────────────────────────
    checkPage(40);
    const I_COLS = [30, 0, 60, 75, 80, 80];
    I_COLS[1] = cW - I_COLS.reduce((a, b) => a + b, 0) + I_COLS[1];
    drawHdr(I_COLS,
      ['S.No', 'Description', 'Quantity', 'Unit Price', 'Total', 'Part Number'],
      ['center','left','center','center','center','center']);

    let grandTotal = 0;
    if (items.length > 0) {
      items.forEach((item, idx) => {
        const desc = descMap[item.id] || descMap[String(item.id)] || item.description || item.job_description || '-';
        const qty  = Number(item.quantity || 0);
        const up   = Number(item.unit_price || 0);
        const tot  = qty * up;
        grandTotal += tot;
        drawRow(I_COLS, [
          { text: String(idx + 1), align: 'center' },
          { text: desc },
          { text: String(qty), align: 'center' },
          { text: `$ ${up.toFixed(2)}`, align: 'center' },
          { text: `$ ${tot.toFixed(2)}`, align: 'center' },
          { text: item.drawing_part_no || item.part_number || '-', align: 'center' },
        ], 24, idx % 2 === 0 ? '#FFF' : C_ALT);
      });
    } else {
      drawRow(I_COLS, ['', 'No items', '', '', '', ''], 22, C_ALT);
    }

    // Grand Total row
    const GT_H = 20;
    checkPage(GT_H);
    doc.rect(M, y, cW, GT_H).fill(COLORS.GT_BG);
    doc.lineWidth(0.5).rect(M, y, cW, GT_H).strokeColor(C_BORDER).stroke();
    const gtLabelW = I_COLS[0] + I_COLS[1] + I_COLS[2] + I_COLS[3];
    doc.lineWidth(0.4).moveTo(M + gtLabelW, y).lineTo(M + gtLabelW, y + GT_H).strokeColor(C_BORDER).stroke();
    doc.lineWidth(0.4).moveTo(M + gtLabelW + I_COLS[4], y).lineTo(M + gtLabelW + I_COLS[4], y + GT_H).strokeColor(C_BORDER).stroke();
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_DARK)
       .text('Grand Total', M + 4, y + 5, { width: gtLabelW - 8, align: 'right', lineBreak: false });
    doc.text(`$ ${grandTotal.toFixed(2)}`, M + gtLabelW + 4, y + 5, { width: I_COLS[4] - 8, align: 'center', lineBreak: false });
    y += GT_H + 14;

    // ── TERMS (optional) ─────────────────────────────────────────────────────
    const terms = vendorPo.terms_and_conditions || '';
    if (terms) {
      checkPage(50);
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Terms & Conditions', M, y);
      y += 12;
      terms.trim().split('\n').filter(l => l.trim()).forEach(line => {
        doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK)
           .text(`\u2022  ${line.trim()}`, M + 8, y, { width: cW - 16 });
        y = doc.y + 6;
      });
    }

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateVendorPOPdf };
