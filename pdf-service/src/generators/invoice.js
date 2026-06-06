'use strict';
/**
 * Invoice PDF generator.
 * Matches backend/src/controllers/invoiceController.js generatePdf() layout exactly.
 * Line items sourced from configurator custom_parts (project.estimate.custom_parts).
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const { buildDescription, pickBestEstimate, fmtCurrency } = require('../utils/calculations');

function generateInvoicePdf(payload) {
  const companySettings = payload.company || {};
  const invoice         = payload.invoice || {};
  const project         = payload.project || {};

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
    const FOOTER_H = 30;

    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - 8) { doc.addPage(); y = drawGlobalHeader(doc, companySettings, typeLabel); }
    };

    // ── Resolve data ─────────────────────────────────────────────────────────
    const preparedBy = project.preparedBy || {};
    const client     = project.client     || {};

    // typeLabel: handle both lowercase and capitalized DB values
    const rawType  = invoice.invoice_type || 'Commercial';
    const typeMap  = { tax: 'Tax Invoice', commercial: 'Commercial Invoice', proforma: 'Proforma Invoice',
                       standard: 'Standard Invoice', credit_note: 'Credit Note', debit_note: 'Debit Note' };
    const typeLabel = typeMap[rawType.toLowerCase()] ||
                      (rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase() + ' Invoice');

    // ── Build line items from configurator custom_parts ──────────────────────
    const estimates  = Array.isArray(project.estimate) ? project.estimate
                     : (project.estimate ? [project.estimate] : []);
    const selectedEst  = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    const customParts  = (selectedEst && Array.isArray(selectedEst.custom_parts)) ? selectedEst.custom_parts : [];
    const storedItems  = Array.isArray(invoice.line_items) ? invoice.line_items : [];

    // Prefer custom_parts for rich part metadata; stored line items as price fallback
    const lineItems = customParts.length > 0
      ? customParts.map((part, idx) => {
          const stored   = storedItems[idx] || {};
          const qty      = Number(part.quantity  || stored.quantity  || 0);
          const unitPrice = Number(stored.unit_price != null ? stored.unit_price
                                 : (part.unit_price || part.rate || 0));
          return {
            job_description: part.job_description || stored.description || '',
            part_name:       part.part_name       || stored.part_name   || '',
            material:        part.material        || stored.material    || '',
            material_grade:  part.material_grade  || stored.material_grade || '',
            condition:       part.condition       || stored.condition   || '',
            drawing_part_no: part.drawing_part_no || stored.drawing_part_no || '',
            drawing_revision:part.drawing_revision|| stored.drawing_revision|| '',
            quantity:        qty,
            unit_price:      unitPrice,
          };
        })
      : storedItems.map(item => ({
          job_description: item.description || item.job_description || '',
          part_name:       item.part_name   || '',
          material:        item.material    || '',
          material_grade:  item.material_grade || '',
          condition:       item.condition   || '',
          drawing_part_no: item.drawing_part_no || '',
          drawing_revision:item.drawing_revision|| '',
          quantity:        Number(item.quantity  || 0),
          unit_price:      Number(item.unit_price || 0),
        }));

    // Date formatter
    const fmtDate = (d) => d ? dayjs(d).format('DD-MMM-YY') : '-';
    const poDate  = invoice.client_po_date || null;

    // ── HEADER ──────────────────────────────────────────────────────────────
    let y = drawGlobalHeader(doc, companySettings, typeLabel);

    // ── TO / PREPARED BY BOX ────────────────────────────────────────────────
    // Mirrors invoiceController.js: dynamic height based on address content
    const halfW  = Math.floor(cW / 2);
    const textW  = halfW - 26;
    const lineH  = 13;
    const addrH  = 13;

    // Measure left (To) height
    const clientName = client.client_name || client.name || '-';
    const clientAddr = client.address     || '';
    const clientPoc  = client.poc_name    || '';
    const clientPos  = client.position    || '';
    const clientEmail= client.poc_email   || '';
    const clientPhone= client.poc_phone   || '';

    // Measure right (Prepared By) height
    const prepName    = preparedBy.name     || companySettings.contact_person || '-';
    const prepPos     = preparedBy.position || '';
    const prepEmail   = preparedBy.email    || companySettings.email || '-';
    const prepPhone   = preparedBy.phone    || companySettings.phone || '-';
    const companyAddr = companySettings.address || '';

    const HDR_ROW_H = 16;
    const nameH     = 13;
    let leftRows = 1 + (clientAddr ? 1 : 0) + (clientPoc ? 1 : 0) + (clientEmail ? 1 : 0) + (clientPhone ? 1 : 0);
    let rightRows= 1 + (companyAddr ? 1 : 0) + 1 + 1 + 1; // name + addr + poc + email + phone
    const bodyH  = Math.max(leftRows, rightRows) * lineH + 8;
    const boxH   = HDR_ROW_H + bodyH;
    const boxY   = y;

    // Header row
    doc.rect(M,         y, halfW, HDR_ROW_H).fill(COLORS.TABLE_HEAD);
    doc.rect(M + halfW, y, halfW, HDR_ROW_H).fill(COLORS.TABLE_HEAD);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('To', M + 10, y + (HDR_ROW_H - 8) / 2, { width: textW, lineBreak: false });
    doc.text('Prepared By', M + halfW + 10, y + (HDR_ROW_H - 8) / 2, { width: textW, lineBreak: false });
    y += HDR_ROW_H;

    // Left body (To)
    let lY = y + 5;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
       .text(clientName, M + 10, lY, { width: textW, lineBreak: true });
    lY += nameH;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK);
    if (clientAddr)  { doc.text(clientAddr,  M + 10, lY, { width: textW, lineBreak: true }); lY += addrH; }
    if (clientPoc)   { doc.text(`Attn:  ${clientPoc}${clientPos ? ' | ' + clientPos : ''}`, M + 10, lY, { width: textW, lineBreak: false }); lY += lineH; }
    if (clientEmail) { doc.text(`Email: ${clientEmail}`, M + 10, lY, { width: textW, lineBreak: false }); lY += lineH; }
    if (clientPhone) { doc.text(`Phone: ${clientPhone}`, M + 10, lY, { width: textW, lineBreak: false }); }

    // Right body (Prepared By)
    let rY = y + 5;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
       .text(companySettings.name || '', M + halfW + 10, rY, { width: textW, lineBreak: true });
    rY += nameH;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK);
    if (companyAddr) { doc.text(companyAddr, M + halfW + 10, rY, { width: textW, lineBreak: true }); rY += addrH; }
    doc.text(`POC:   ${prepName}${prepPos ? ' | ' + prepPos : ''}`, M + halfW + 10, rY, { width: textW, lineBreak: false }); rY += lineH;
    doc.text(`Email: ${prepEmail}`, M + halfW + 10, rY, { width: textW, lineBreak: false }); rY += lineH;
    doc.text(`Phone: ${prepPhone}`, M + halfW + 10, rY, { width: textW, lineBreak: false });

    y = boxY + boxH;

    // ── INVOICE INFO STRIP (3 rows × 2 cols) — matches invoiceController.js ──
    const infoStripH = 28;
    const infoRows = [
      [{ label: 'Invoice No : ',   value: invoice.invoice_number  || '-' }, { label: 'Invoice Date: ', value: fmtDate(invoice.invoice_date) }],
      [{ label: 'PO No : ',        value: invoice.client_po_number || '-' }, { label: 'PO Date: ',     value: fmtDate(poDate) }],
      [{ label: 'Project Name : ', value: invoice.project_name    || project.project_name || '-' }, { label: 'Project ID : ', value: project.project_number || '-' }],
    ];

    doc.rect(M, y, cW, infoStripH * infoRows.length).fill('#FFFFFF');
    doc.lineWidth(0.5).moveTo(M, y).lineTo(M + cW, y).strokeColor('#000000').stroke();
    for (let ri = 1; ri < infoRows.length; ri++) {
      doc.lineWidth(0.5).moveTo(M, y + infoStripH * ri).lineTo(M + cW, y + infoStripH * ri).strokeColor('#000000').stroke();
    }
    infoRows.forEach((row, ri) => {
      const rowQW = cW / row.length;
      for (let ci = 1; ci < row.length; ci++) {
        doc.lineWidth(0.5).moveTo(M + ci * rowQW, y + ri * infoStripH).lineTo(M + ci * rowQW, y + (ri + 1) * infoStripH).strokeColor('#000000').stroke();
      }
    });
    infoRows.forEach((row, ri) => {
      const rowQW = cW / row.length;
      row.forEach((f, ci) => {
        const fx = M + ci * rowQW + 13;
        const fy = y + ri * infoStripH + (infoStripH - 10) / 2;
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.ACCENT)
           .text(f.label, fx, fy, { continued: true, width: rowQW - 16, lineBreak: false });
        doc.font('Helvetica').fillColor(COLORS.TEXT_DARK).text(f.value, { continued: false, lineBreak: false });
      });
    });
    doc.lineWidth(0.75).rect(M, boxY, cW, boxH + infoStripH * infoRows.length).strokeColor('#000000').stroke();
    y += infoStripH * infoRows.length + 5;

    // ── 1. SUMMARY SECTION ───────────────────────────────────────────────────
    checkPage(50);
    y += 12;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('1. Summary', M, y);
    y += 18;

    // Column widths: # | Description | Unit Price | Quantity | Total Price
    const S_COLS = [30, 0, 82, 65, 105];
    S_COLS[1] = cW - S_COLS[0] - S_COLS[2] - S_COLS[3] - S_COLS[4];
    const sHdrs   = ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'];
    const sAligns = ['center', 'left', 'right', 'center', 'right'];
    const S_HDR_H = 20;

    checkPage(S_HDR_H);
    doc.rect(M, y, cW, S_HDR_H).fill(COLORS.TABLE_HEAD);
    doc.lineWidth(0.75).rect(M, y, cW, S_HDR_H).strokeColor('#000000').stroke();
    let hx = M;
    sHdrs.forEach((h, i) => {
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#ffffff')
         .text(h, hx + 4, y + (S_HDR_H - 8.5) / 2, { width: S_COLS[i] - 8, align: sAligns[i], lineBreak: false });
      if (i < sHdrs.length - 1) {
        doc.lineWidth(0.5).moveTo(hx + S_COLS[i], y).lineTo(hx + S_COLS[i], y + S_HDR_H).strokeColor('#000000').stroke();
      }
      hx += S_COLS[i];
    });
    y += S_HDR_H;

    // Data rows
    let subtotal = 0;
    const DATA_ROW_H = 32;
    const descW      = S_COLS[1] - 12;

    if (lineItems.length > 0) {
      lineItems.forEach((item, idx) => {
        const qty      = Number(item.quantity   || 0);
        const unitPrice = Number(item.unit_price || 0);
        const lineTotal = qty * unitPrice;
        subtotal += lineTotal;

        const { description: stdDesc, drawingDisplay } = buildDescription({
          job_description: item.job_description || '',
          part_name:       item.part_name       || '',
          material:        item.material        || '',
          material_grade:  item.material_grade  || '',
          condition:       item.condition       || '',
          drawing_part_no: item.drawing_part_no || '',
          drawing_revision:item.drawing_revision|| '',
        });

        // Dynamic row height
        let dynRowH = DATA_ROW_H;
        if (drawingDisplay && stdDesc) {
          doc.fontSize(8.5).font('Helvetica');
          const descH = doc.heightOfString(stdDesc, { width: descW });
          doc.fontSize(7).font('Helvetica');
          const drawH = doc.heightOfString(drawingDisplay, { width: descW });
          dynRowH = Math.max(DATA_ROW_H, descH + drawH + 10);
        } else if (stdDesc) {
          doc.fontSize(8.5).font('Helvetica');
          dynRowH = Math.max(DATA_ROW_H, doc.heightOfString(stdDesc, { width: descW }) + 8);
        }

        checkPage(dynRowH);
        const bg = idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
        doc.rect(M, y, cW, dynRowH).fill(bg);
        doc.lineWidth(0.5).rect(M, y, cW, dynRowH).strokeColor('#000000').stroke();

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

        // Description column — two-part rendering
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

        doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK);
        // Unit Price
        doc.text(fmtCurrency(unitPrice), cx + 6, rowMid, { width: S_COLS[2] - 12, align: 'right', lineBreak: false });
        cx += S_COLS[2];
        // Quantity
        doc.text(String(qty), cx + 4, rowMid, { width: S_COLS[3] - 8, align: 'center', lineBreak: false });
        cx += S_COLS[3];
        // Total Price
        doc.text(fmtCurrency(lineTotal), cx + 6, rowMid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });

        y += dynRowH;
      });
    } else {
      checkPage(DATA_ROW_H);
      doc.rect(M, y, cW, DATA_ROW_H).fill(COLORS.ROW_ALT);
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text('No items', M + 4, y + (DATA_ROW_H - 8) / 2, { width: cW - 8, align: 'center' });
      doc.lineWidth(0.5).rect(M, y, cW, DATA_ROW_H).strokeColor('#000000').stroke();
      y += DATA_ROW_H;
    }

    // ── TOTALS BLOCK ─────────────────────────────────────────────────────────
    const taxType       = invoice.tax_type || 'Exempt';
    const taxPct        = (taxType === 'Exempt' || !taxType) ? 0 : Number(invoice.tax_percent || 0);
    const taxAmt        = subtotal * (taxPct / 100);
    const shippingCharges = Number(invoice.shipping_charges || 0);
    const taxLabel      = (taxType === 'Exempt' || !taxType) ? 'Exempt' : `${taxPct}%`;
    const labelW        = S_COLS[0] + S_COLS[1] + S_COLS[2] + S_COLS[3];
    const TOTAL_ROW_H   = 25;

    const drawTotalRow = (label, amount, isGrand) => {
      const rH = isGrand ? 28 : TOTAL_ROW_H;
      checkPage(rH);
      if (isGrand) {
        doc.rect(M, y, cW, rH).fill(COLORS.GT_BG);
        doc.lineWidth(0.75).rect(M, y, cW, rH).strokeColor(COLORS.BORDER).stroke();
        doc.lineWidth(1.2).moveTo(M, y).lineTo(M + cW, y).strokeColor(COLORS.GT_BORDER || COLORS.BORDER).stroke();
        doc.lineWidth(0.5).moveTo(M + labelW, y).lineTo(M + labelW, y + rH).strokeColor(COLORS.BORDER).stroke();
        const gtMid = y + (rH - 9) / 2;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
        doc.text(label, M + 11, gtMid, { width: labelW - 22, align: 'right', lineBreak: false });
        doc.text(fmtCurrency(amount), M + labelW + 6, gtMid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });
      } else {
        doc.rect(M, y, cW, rH).fill(COLORS.ROW_WHITE || '#FFFFFF');
        doc.lineWidth(0.5).rect(M, y, cW, rH).strokeColor(COLORS.BORDER).stroke();
        doc.lineWidth(0.5).moveTo(M + labelW, y).lineTo(M + labelW, y + rH).strokeColor(COLORS.BORDER).stroke();
        const mid = y + (rH - 9) / 2;
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
        doc.text(label, M + 11, mid, { width: labelW - 22, align: 'right', lineBreak: false });
        doc.font('Helvetica').text(fmtCurrency(amount), M + labelW + 6, mid, { width: S_COLS[4] - 12, align: 'right', lineBreak: false });
      }
      y += rH;
    };

    drawTotalRow('Subtotal', subtotal, false);
    drawTotalRow(`Tax | ${taxLabel}`, taxAmt, false);
    drawTotalRow('Shipping Charges', shippingCharges, false);
    drawTotalRow('Grand Total', subtotal + taxAmt + shippingCharges, true);
    y += 16;

    // ── 2. TERMS AND CONDITIONS ───────────────────────────────────────────────
    checkPage(34);
    y += 10;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
       .text('2. Terms And Conditions of Sale', M, y);
    y += 18;
    doc.lineWidth(0.5).moveTo(M, y).lineTo(M + cW, y).strokeColor(COLORS.BORDER || '#CCCCCC').stroke();
    y += 8;

    const defaultTerms = [
      { t: 'Delivery Timeline:', b: 'As per purchase order requirements. Seller will notify Buyer of any delays.' },
      { t: 'Payment Terms:',     b: invoice.payment_terms || 'Net 30 days from invoice date. Payment via bank transfer.' },
      { t: 'Taxation:',          b: 'All prices are exclusive of applicable taxes unless stated otherwise. Buyer is responsible for all applicable taxes.' },
      { t: 'Confidentiality:',   b: 'Both parties agree to maintain confidentiality of all proprietary information exchanged in connection with this transaction.' },
    ];
    const savedTerms = Array.isArray(invoice.terms_conditions) && invoice.terms_conditions.length > 0
      ? invoice.terms_conditions.map(tc => ({ t: tc.title || tc.t || '', b: tc.body || tc.b || '' }))
      : null;
    const terms = savedTerms || defaultTerms;

    terms.forEach((sec, idx) => {
      checkPage(30);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text(`${idx + 1}. ${sec.t}`, M + 6, y, { width: cW - 12 });
      y = doc.y + 3;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(sec.b, M + 12, y, { width: cW - 24, align: 'justify', lineBreak: true });
      y = doc.y + 10;
    });

    // ── NOTES ────────────────────────────────────────────────────────────────
    const notes = invoice.notes || '';
    if (notes) {
      checkPage(30);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK).text('Notes:', M + 6, y, { width: cW - 12 });
      y = doc.y + 3;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
         .text(notes, M + 12, y, { width: cW - 24 });
      y = doc.y + 10;
    }

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateInvoicePdf };
