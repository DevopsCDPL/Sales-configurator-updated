'use strict';
/**
 * Quotation PDF generator (pdf-service edition).
 * Ported from backend/src/services/documentService.js _buildQuotationPdf().
 * All data is passed in the payload – no database access.
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const {
  pickBestEstimate,
  buildDescription,
  buildStandardizedLineItems,
} = require('../utils/calculations');

/**
 * @param {object} payload
 * @param {object} payload.company   – company settings (logo_data, name, address, phone, website, tax_id)
 * @param {object} payload.project   – project with client, preparedBy, estimate (array), selected_revision, etc.
 * @returns {Promise<Buffer>}
 */
function generateQuotationPdf(payload) {
  return new Promise((resolve, reject) => {
    const { company: companySettings, project } = payload;

    const doc    = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M        = SIDE_MARGIN;
    const pageW    = doc.page.width;
    const pageH    = doc.page.height;
    const cW       = pageW - 2 * M;
    const FOOTER_H = 22;
    let y = M;

    // ── Helpers ────────────────────────────────────────────────────────────
    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - 8) { doc.addPage(); y = M; }
    };

    const drawHRule = (lw = 0.5, col = '#CCCCCC') =>
      doc.lineWidth(lw).moveTo(M, y).lineTo(M + cW, y).strokeColor(col).stroke();

    const drawVDiv = (x, y1, y2, lw = 0.4, col = '#BBBBBB') =>
      doc.lineWidth(lw).moveTo(x, y1).lineTo(x, y2).strokeColor(col).stroke();

    const drawBanner = (text) => {
      checkPage(20);
      doc.rect(M, y, cW, 16).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.3).rect(M, y, cW, 16).strokeColor(COLORS.BORDER).stroke();
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
         .text(text, M + 6, y + 4, { width: cW - 12, lineBreak: false });
      y += 16;
    };

    const drawTblHdr = (cols, hdrs, aligns) => {
      const H = 16;
      doc.rect(M, y, cW, H).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.3).rect(M, y, cW, H).strokeColor(COLORS.BORDER).stroke();
      let hx = M;
      hdrs.forEach((h, i) => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
           .text(h, hx + 3, y + 4, { width: cols[i] - 6, align: aligns?.[i] || 'left', lineBreak: false });
        if (i < hdrs.length - 1) drawVDiv(hx + cols[i], y, y + H, 0.3, COLORS.BORDER_MED);
        hx += cols[i];
      });
      y += H;
    };

    const drawRow = (cols, cells, rowH, bg, aligns, descColIdx = -1) => {
      checkPage(rowH);
      const rowBg = bg || COLORS.ROW_WHITE;
      doc.rect(M, y, cW, rowH).fill(rowBg);
      doc.lineWidth(0.3).rect(M, y, cW, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
      let rx = M;
      cells.forEach((cell, i) => {
        const txt = typeof cell === 'object' ? (cell.text || '') : String(cell ?? '');
        const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
        const aln = aligns?.[i] || (typeof cell === 'object' && cell.align) || 'left';
        if (i === descColIdx && txt.includes('\n')) {
          const parts = txt.split('\n');
          const descW = cols[i] - 12;
          doc.fontSize(8.5).font(fnt).fillColor(COLORS.TEXT_DARK);
          const descH = doc.heightOfString(parts[0], { width: descW });
          doc.text(parts[0], rx + 6, y + 4, { width: descW, lineBreak: true });
          doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
          doc.text(parts.slice(1).join('\n'), rx + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
        } else {
          doc.fontSize(7.5).font(fnt).fillColor(COLORS.TEXT_DARK)
             .text(txt, rx + 3, y + 3, { width: cols[i] - 6, align: aln, lineBreak: true, height: rowH - 6 });
        }
        if (i < cells.length - 1) drawVDiv(rx + cols[i], y, y + rowH, 0.3, COLORS.BORDER_LIGHT);
        rx += cols[i];
      });
      y += rowH;
    };

    // ── HEADER ──────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'Quotation');

    // ── TO / PREPARED BY two-column box ────────────────────────────────────
    const halfW  = Math.floor(cW / 2);
    const client = project.client   || {};
    const prepBy = project.preparedBy || {};
    const lH     = 10.5;
    const tiTextW = halfW - 8;

    doc.fontSize(8).font('Helvetica');
    const _clientAddrH  = client.address   ? Math.max(doc.heightOfString(client.address, { width: tiTextW }) + 4, lH) : lH;
    const _companyAddrH = companySettings.address ? Math.max(doc.heightOfString(companySettings.address, { width: tiTextW }) + 4, lH) : lH;
    const tiAddrRowH    = Math.max(_clientAddrH, _companyAddrH);
    const clientLineCount  = 1 + (client.address ? 1 : 0) + 1 + 1 + (client.poc_phone ? 1 : 0);
    const companyLineCount = 1 + 1 + (prepBy.email ? 1 : 0) + (prepBy.phone ? 1 : 0) + (companySettings.address ? 1 : 0);
    const TO_H = 16 + 13 + tiAddrRowH + lH * (Math.max(clientLineCount, companyLineCount) - 2) + 6;

    doc.lineWidth(0.8).rect(M, y, cW, TO_H).strokeColor('#000000').stroke();
    drawVDiv(M + halfW, y, y + TO_H, 0.6, '#000000');

    ['To', 'Prepared By'].forEach((lbl, side) => {
      const bx = M + side * halfW;
      doc.rect(bx, y, halfW, 13).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.3).rect(bx, y, halfW, 13).strokeColor(COLORS.BORDER).stroke();
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
         .text(lbl, bx + 5, y + 3, { width: halfW - 10, lineBreak: false });
    });

    let toY = y + 16;
    doc.fontSize(8).font('Helvetica').fillColor('#000000');
    doc.text(client.client_name || '{Company Name}', M + 4, toY, { width: tiTextW, lineBreak: true }); toY += lH;
    if (client.address)
      { doc.text(client.address, M + 4, toY, { width: tiTextW, lineBreak: true }); toY += tiAddrRowH; }
    doc.text(`POC: ${client.poc_name || '-'}${client.position ? ' | ' + client.position : ''}`, M + 4, toY, { width: tiTextW, lineBreak: true }); toY += lH;
    doc.text(`Email: ${client.poc_email || '-'}`,   M + 4, toY, { width: tiTextW, lineBreak: true }); toY += lH;
    if (client.poc_phone)
      doc.text(`Phone: ${client.poc_phone}`, M + 4, toY, { width: tiTextW, lineBreak: false });

    const pbX = M + halfW + 4;
    const pbW = halfW - 8;
    let pbY = y + 16;
    doc.text(companySettings.name || '', pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH;
    doc.font('Helvetica-Bold').text(`POC: ${prepBy.name || '-'}${prepBy.position ? ' | ' + prepBy.position : ''}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.TEXT_DARK);
    if (prepBy.email)
      { doc.text(`Email: ${prepBy.email}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH; }
    if (prepBy.phone)
      { doc.text(`Phone: ${prepBy.phone}`, pbX, pbY, { width: pbW, lineBreak: true }); pbY += lH; }
    if (companySettings.address)
      { doc.text(companySettings.address, pbX, pbY, { width: pbW, lineBreak: true }); }
    y += TO_H;

    // ── QUOTATION INFO STRIP ────────────────────────────────────────────────
    const PROP_H  = 24;
    const propCW  = Math.floor(cW / 3);
    doc.lineWidth(0.8).rect(M, y, cW, PROP_H).strokeColor('#000000').stroke();
    [1, 2].forEach(i => drawVDiv(M + propCW * i, y, y + PROP_H, 0.5, '#000000'));

    const qNum      = project.quotation_number || `TPS/${(project.project_name || 'PROJ').replace(/\s+/g, '_').slice(0, 12)}`;
    const qDate     = dayjs().format('DD/MM/YYYY');
    const validThru = dayjs().add(30, 'day').format('DD/MM/YYYY');

    [
      { label: 'Quotation No:',   value: qNum },
      { label: 'Quotation Date:', value: qDate },
      { label: 'Valid Thru:',     value: `${validThru} (30 days from abv. date)` },
    ].forEach(({ label, value }, i) => {
      const px = M + propCW * i + 5;
      const pw = propCW - 10;
      doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text(label + ' ', px, y + 4, { continued: true, width: pw });
      doc.font('Helvetica').fillColor(COLORS.TEXT_DARK).text(value);
    });
    y += PROP_H;

    // Project / Revision strip
    const PJ_H = 14;
    doc.rect(M, y, cW, PJ_H).fill(COLORS.GT_BG);
    doc.lineWidth(0.4).rect(M, y, cW, PJ_H).strokeColor(COLORS.BORDER_LIGHT).stroke();

    const estimates   = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const activeEst   = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
       .text(
         `Project : ${project.project_name || '-'}   |   Revision: R${activeEst?.revision ?? 0}   |   ${project.client?.client_name || ''}`,
         M + 5, y + 3, { width: cW - 10, lineBreak: true }
       );
    y += PJ_H + 8;

    // ── SECTION 1 – SUMMARY ─────────────────────────────────────────────────
    drawBanner('1. Summary');

    const customPartsData = Array.isArray(activeEst?.custom_parts) ? activeEst.custom_parts : [];
    const hasBulkPricing  = customPartsData.some(p =>
      p.bulk_order_variable_price && Array.isArray(p.pricing_tiers) && p.pricing_tiers.length > 0
    );

    const _buildPartDesc = (part) => buildDescription({
      job_description: part.job_description || '',
      part_name: part.part_name || '',
      material: part.material || part.material_category || '',
      material_grade: part.material_grade || '',
      condition: part.condition || '',
      drawing_part_no: part.drawing_part_no || '',
      drawing_revision: part.drawing_revision || '',
    });

    const _measureDescH = (desc, drawDisp, descW) => {
      let rowH = 20;
      if (drawDisp && desc) {
        doc.fontSize(8.5).font('Helvetica');
        const dH = doc.heightOfString(desc, { width: descW });
        doc.fontSize(7).font('Helvetica');
        const ddH = doc.heightOfString(drawDisp, { width: descW });
        rowH = Math.max(32, dH + ddH + 10);
      } else if (desc) {
        doc.fontSize(8.5).font('Helvetica');
        const dH = doc.heightOfString(desc, { width: descW });
        rowH = Math.max(20, dH + 8);
      }
      return rowH;
    };

    if (hasBulkPricing) {
      const B_COLS = [30, 0, 65, 82, 105];
      B_COLS[1] = cW - B_COLS[0] - B_COLS[2] - B_COLS[3] - B_COLS[4];
      drawTblHdr(B_COLS, ['S.No', 'Description', 'Quantity', 'Price/EA', 'Total Price'],
                         ['center', 'left', 'right', 'right', 'right']);

      let bRowNum = 0;
      let bGlobalIdx = 0;

      customPartsData.forEach((part) => {
        bRowNum++;
        const { description: partDesc, drawingDisplay: partDraw } = _buildPartDesc(part);
        const descW = B_COLS[1] - 12;

        if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
          part.pricing_tiers.forEach((tier, tIdx) => {
            const qty = Number(tier.quantity || 1);
            const unitPrice = Number(tier.unit_price || 0);
            const totalPrice = qty * unitPrice;
            const isFirst = tIdx === 0;
            const descText = isFirst ? (partDraw ? `${partDesc}\n${partDraw}` : partDesc) : '';
            const rowH = isFirst ? _measureDescH(partDesc, partDraw, descW) : 20;
            const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
            drawRow(B_COLS,
              [isFirst ? String(bRowNum) : '', descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalPrice.toFixed(2)}`],
              rowH, bg, ['center', 'left', 'right', 'right', 'right'], isFirst ? 1 : -1);
            bGlobalIdx++;
          });
        } else {
          const qty = Number(part.quantity || 1);
          const rawUP = Number(part.job_cost_per_unit || 0);
          const total = Number(part.total_cost) || (qty * rawUP);
          const unitPrice = rawUP || (qty > 0 ? total / qty : total);
          const totalPrice = qty * unitPrice;
          const descText = partDraw ? `${partDesc}\n${partDraw}` : partDesc;
          const rowH = _measureDescH(partDesc, partDraw, descW);
          const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
          drawRow(B_COLS,
            [String(bRowNum), descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalPrice.toFixed(2)}`],
            rowH, bg, ['center', 'left', 'right', 'right', 'right'], 1);
          bGlobalIdx++;
        }
      });

      const procModules = Array.isArray(activeEst?.items) ? activeEst.items : [];
      const sortedModules = [...procModules].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
      sortedModules.forEach((item) => {
        bRowNum++;
        const inp = item.input_json || {};
        const qty = Number(inp.quantity) || 0;
        const totalCost = Number(item.total_cost) || 0;
        const unitPrice = qty > 0 ? totalCost / qty : totalCost;
        const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const desc = inp.job_name || inp.description || moduleLabel;
        const descText = desc ? `${moduleLabel} - ${desc}` : moduleLabel;
        const bg = bGlobalIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
        drawRow(B_COLS,
          [String(bRowNum), descText, String(qty), `$ ${unitPrice.toFixed(2)}`, `$ ${totalCost.toFixed(2)}`],
          20, bg, ['center', 'left', 'right', 'right', 'right'], -1);
        bGlobalIdx++;
      });

      if (customPartsData.length === 0 && sortedModules.length === 0) {
        drawRow(B_COLS, ['', 'No items', '', '', ''], 20, COLORS.ROW_ALT,
          ['center', 'center', 'center', 'center', 'center']);
      }
      y += 12;

    } else {
      const S_COLS = [30, 0, 90, 60, 90];
      S_COLS[1] = cW - S_COLS.reduce((a, b) => a + b);
      drawTblHdr(S_COLS, ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'],
                         ['center', 'left', 'center', 'center', 'center']);

      const summaryLineItems = buildStandardizedLineItems(activeEst);
      let grandTotal = 0;

      summaryLineItems.forEach((item, idx) => {
        const qty   = item.quantity;
        const price = item.unit_price;
        const total = item.line_total;
        grandTotal += total;
        const descWithDrawing = item.drawingDisplay
          ? `${item.description}\n${item.drawingDisplay}`
          : item.description;
        const descW = S_COLS[1] - 12;
        let rowHeight = 20;
        if (item.drawingDisplay && item.description) {
          doc.fontSize(8.5).font('Helvetica');
          const dH = doc.heightOfString(item.description, { width: descW });
          doc.fontSize(7).font('Helvetica');
          const ddH = doc.heightOfString(item.drawingDisplay, { width: descW });
          rowHeight = Math.max(32, dH + ddH + 10);
        } else if (item.description) {
          doc.fontSize(8.5).font('Helvetica');
          const dH = doc.heightOfString(item.description, { width: descW });
          rowHeight = Math.max(20, dH + 8);
        }
        drawRow(S_COLS,
          [String(idx + 1), descWithDrawing, `$ ${price.toFixed(2)}`, String(qty), `$ ${total.toFixed(2)}`],
          rowHeight, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
          ['center', 'left', 'center', 'center', 'center'], 1);
      });

      if (summaryLineItems.length === 0) {
        drawRow(S_COLS, ['', 'No items', '', '', ''], 20, COLORS.ROW_ALT,
          ['center', 'center', 'center', 'center', 'center']);
      }

      const GT_H = 18;
      checkPage(GT_H);
      doc.rect(M, y, cW, GT_H).fill(COLORS.GT_BG);
      doc.lineWidth(0.4).rect(M, y, cW, GT_H).strokeColor(COLORS.GT_BORDER).stroke();
      const gtLW = S_COLS[0] + S_COLS[1] + S_COLS[2] + S_COLS[3];
      drawVDiv(M + gtLW, y, y + GT_H, 0.4, COLORS.GT_BORDER);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Grand Total', M + 4, y + 5, { width: gtLW - 8, align: 'right', lineBreak: false });
      doc.text(`$ ${grandTotal.toFixed(2)}`, M + gtLW + 4, y + 5,
           { width: S_COLS[4] - 8, align: 'center', lineBreak: false });
      y += GT_H + 12;
    }

    // ── SECTION 2 – BILL OF MATERIALS ───────────────────────────────────────
    let sectionNum = 2;
    checkPage(50);
    drawBanner(`${sectionNum}. Bill of Materials:`);
    sectionNum++;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
       .text('Consider this Bill of material to give input:', M + 2, y + 1);
    y = doc.y + 4;

    const customParts = Array.isArray(activeEst?.custom_parts) ? activeEst.custom_parts : [];
    if (customParts.length > 0) {
      checkPage(36);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Custom Parts:', M + 2, y, { lineBreak: false });
      y += 13;
      const CP = [22, 0, 58, 38, 26, 52, 36, 64];
      CP[1] = cW - CP.reduce((a, b) => a + b);
      drawTblHdr(CP,
        ['#', 'Job Description', 'Material', 'Grade', 'Qty', 'Drg Part No', 'Heat #', 'RM Dimension'],
        ['center', 'left', 'left', 'center', 'center', 'center', 'center', 'center']);
      customParts.forEach((p, idx) => {
        drawRow(CP, [
          String(idx + 1),
          p.job_description || '-',
          p.material        || '-',
          p.material_grade  || '-',
          String(p.quantity || '-'),
          (p.drawing_part_no || '-') + (p.drawing_revision ? ' - ' + p.drawing_revision : ''),
          p.heat_number              || '-',
          p.raw_material_dimension   || '-',
        ], 18, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
        ['center', 'left', 'left', 'center', 'center', 'center', 'center', 'center']);
      });
      y += 5;
    }

    const procItems = activeEst?.items || [];
    if (procItems.length > 0) {
      checkPage(36);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Process Modules:', M + 2, y, { lineBreak: false });
      y += 13;
      const modLabel = (t) => ({
        cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', laser_cutting: 'Laser Cutting',
        fabrication_welding: 'Fabrication & Welding', welding: 'Welding',
        heat_treatment: 'Heat Treatment', grinding: 'Grinding', drilling: 'Drilling',
        boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
        assembly: 'Assembly', testing: 'Testing / Inspection', other: 'Other',
      }[t] || t || '-');

      const PM = [22, 0, 90];
      PM[1] = cW - PM.reduce((a, b) => a + b);
      drawTblHdr(PM, ['#', 'Process', 'Cost (INR)'], ['center', 'left', 'right']);

      let pmTotal = 0;
      procItems.forEach((item, idx) => {
        const cost = Number(item.output_json?.total_cost || item.output_json?.total_job_cost || 0);
        pmTotal += cost;
        drawRow(PM,
          [String(idx + 1), modLabel(item.module_type), cost.toFixed(2)],
          18, idx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT,
          ['center', 'left', 'right']);
      });

      const PTH = 18;
      checkPage(PTH);
      doc.rect(M, y, cW, PTH).fill(COLORS.GT_BG);
      doc.lineWidth(0.3).rect(M, y, cW, PTH).strokeColor(COLORS.GT_BORDER).stroke();
      const ptLW = PM[0] + PM[1];
      drawVDiv(M + ptLW, y, y + PTH, 0.3, COLORS.GT_BORDER);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('Total Process Cost', M + 4, y + 5, { width: ptLW - 8, align: 'right', lineBreak: false });
      doc.text(`$ ${pmTotal.toFixed(2)}`, M + ptLW + 4, y + 5, { width: PM[2] - 8, align: 'right', lineBreak: false });
      y += PTH + 6;
    }

    // ── SCHEDULE & COMMERCIAL NOTES ────────────────────────────────────────
    const quotation = activeEst?.quotation || {};
    const quotationNotes = (quotation.notes || '').trim();
    if (quotationNotes) {
      checkPage(50);
      drawBanner(`${sectionNum}. Project Schedule & Commercial Notes`);
      sectionNum++;
      y += 6;
      quotationNotes.split('\n').filter(l => l.trim()).forEach(n => {
        const trimmed = n.trim();
        const poMatch = trimmed.match(/^Purchase Orders to be sent to:\s*(.*)$/i);
        if (poMatch) {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text('Purchase Orders to be sent to:  ', M + 10, y, { continued: true, width: cW - 20 });
          doc.font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK).text(poMatch[1] || '', { continued: false });
        } else {
          doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text('\u2022  ' + trimmed, M + 10, y, { width: cW - 20 });
        }
        y = doc.y + 6;
      });
      y += 6;
    }

    // ── TERMS AND CONDITIONS ────────────────────────────────────────────────
    if (quotation.include_terms === true) {
      checkPage(50);
      y += 2;
      drawBanner(`${sectionNum}. Terms And Conditions of Sale:`);
      sectionNum++;
      y += 3;

      const tcSections = [
        { t: '1. ACCEPTANCE OF DOCUMENT.', b: 'This contract is between company ("Seller") and client ("Buyer") for a specific order. These Terms and Conditions form the basis for all transactions between the parties. Any amendments require mutual written consent and are only binding when acknowledged by both parties.' },
        { t: '2. DELIVERY/RISK OF LOSS', b: 'Products are delivered FCA Seller\'s factory unless stated otherwise. Buyer is solely responsible for freight unless agreed otherwise in writing.' },
        { t: '3. INSPECTION', b: 'Buyer can specifically request a factory test. Buyer must notify Seller within three (3) days prior if the order arrives with visible defects.' },
        { t: '4. PRODUCTS RETURNS', b: 'Seller may at its own discretion authorize product returns with a 15% restocking fee plus shipping. Custom orders are non-returnable.' },
        { t: '5. CUSTOM PRODUCTS', b: 'Prices for custom products are based on current cost structures. Buyer may not seek substitutions once the order is placed.' },
        { t: '6. SERVICES', b: 'Any claims or inaccuracies in services must be reported to Seller in writing.' },
        { t: '7. WARRANTY', b: 'Seller warrants goods against defects in material and workmanship for a period of one (1) year from date of shipment.' },
        { t: '8. CONSEQUENTIAL DAMAGES', b: 'Seller shall not be liable for any indirect, incidental, special, or consequential damages.' },
        { t: '9. LIMITATION OF LIABILITY', b: 'Seller\'s total liability for any claim shall not exceed the purchase price of the goods.' },
        { t: '10. DAYS, DAMAGES & LOSS', b: 'Seller is not responsible for delivery delays caused by circumstances beyond its control.' },
        { t: '11. INDEMNITY', b: 'Buyer agrees to indemnify, defend, and hold harmless Seller from any claims arising from Buyer\'s use of the goods.' },
        { t: '12. SALES AND TAXES', b: 'All prices are exclusive of applicable taxes, duties, and levies. Buyer is responsible for all applicable taxes.' },
        { t: '13. PAYMENT TERMS', b: 'Orders $0-$5,000: 100% on order. Orders $500-$300,000: 50% deposit, 50% due 30 days from invoice. Orders over $300,000: 10% deposit, 40% at production start, 50% due 30 days from invoice.' },
        { t: '14. CREDIT HOLD, C.O.D., AND PURCHASES', b: 'Seller may place an account on credit hold at any time. All outstanding invoices become immediately due.' },
        { t: '15. SUBSEQUENT PAYMENTS', b: 'A service charge of 1.5% per month (18% annually) will be imposed on any unpaid overdue invoice.' },
        { t: '16. TITLE', b: 'Title to goods shall remain with Seller until full payment has been received.' },
        { t: '17. SECURITY INTEREST', b: 'Buyer hereby grants Seller a security interest in the goods to secure payment.' },
        { t: '18. ATTORNEYS FEES', b: 'If any legal action is required to enforce this contract, the prevailing party shall be entitled to recover reasonable attorneys fees.' },
      ];

      const TC_GAP = 6;
      const TC_CW  = (cW - TC_GAP) / 2;
      const tc_lx  = M;
      const tc_rx  = M + TC_CW + TC_GAP;
      let lColY    = y;
      let rColY    = y;

      tcSections.forEach((sec, idx) => {
        const isLeft = idx % 2 === 0;
        const tcX    = isLeft ? tc_lx : tc_rx;
        let   tcY    = isLeft ? lColY : rColY;

        if (tcY + 40 > pageH - FOOTER_H - 10) {
          doc.addPage();
          lColY = M; rColY = M; tcY = M;
        }

        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
           .text(sec.t, tcX + 2, tcY, { width: TC_CW - 4 });
        tcY = doc.y + 1;
        doc.fontSize(7.5).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(sec.b, tcX + 4, tcY, { width: TC_CW - 8, align: 'justify' });
        tcY = doc.y + 5;

        if (isLeft) lColY = tcY; else rColY = tcY;
      });
      y = Math.max(lColY, rColY) + 4;
    }

    // ── FOOTER ──────────────────────────────────────────────────────────────
    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateQuotationPdf };
