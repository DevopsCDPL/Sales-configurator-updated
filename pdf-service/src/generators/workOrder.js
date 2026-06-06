'use strict';
/**
 * Work Order PDF generator.
 * Layout mirrors workOrderService.js generateTravellerPdf() exactly.
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildDescription } = require('../utils/calculations');

function generateWorkOrderPdf(payload) {
  const { company: companySettings, project } = payload;

  const estimates      = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
  const estimate       = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1] || null;
  const customPartsRaw = Array.isArray(estimate?.custom_parts) ? estimate.custom_parts : [];
  const processModules = Array.isArray(estimate?.items) ? estimate.items : [];

  const mappedModules = processModules.map(item => {
    const inp = item.input_json || {};
    const qty = Number(inp.quantity) || 0;
    const totalCost = Number(item.total_cost) || 0;
    const unitPrice = qty > 0 ? totalCost / qty : totalCost;
    const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return {
      _source: 'process_module',
      module_type: item.module_type,
      job_description: inp.job_name || moduleLabel,
      drawing_part_no: inp.drawing_part_no || '',
      material: inp.material_type || inp.material_grade || '',
      material_grade: inp.material_grade || inp.material_type || '',
      quantity: qty,
      heat_number: inp.heat_number || '',
      raw_material_dimension: inp.raw_material_dimension || '',
    };
  });

  const allParts = [...customPartsRaw, ...mappedModules];
  const wo       = project.workOrder || {};
  const jobIds   = Array.isArray(wo.job_ids) && wo.job_ids.length > 0 ? wo.job_ids : null;

  // Attach _origIdx so requirement/quantity lookups stay correct regardless of jobIds order
  const customParts = [];
  allParts.forEach((part, idx) => {
    if (!jobIds || jobIds.includes(idx)) {
      customParts.push({ ...part, _origIdx: idx });
    }
  });

  // Quality requirements – only include checked items; support both legacy string[] and {text,checked}[]
  const allRequirements = Array.isArray(wo.quality_requirements)
    ? wo.quality_requirements
        .filter(r => typeof r === 'string' ? r.trim() : (r.checked !== false && (r.text || '').trim()))
        .map(r => typeof r === 'string' ? r : r.text)
    : [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, lineGap: 1, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin      = 30;
    const pageW       = doc.page.width;
    const pageH       = doc.page.height;
    const cW          = pageW - 2 * margin;
    const FS          = 8.5;
    const OUTER_COLOR = COLORS.BORDER;    // '#000000'
    const INNER_CLR   = '#000000';

    const drawPageHeader = () => drawGlobalHeader(doc, companySettings);

    // ── Shared table helper (matches workOrderService drawTable exactly) ──
    const drawTable = (startY, headers, colWidths, rows, headerBg = COLORS.TABLE_HEAD, headerH = 22, rowH = 24, colAligns = null, descColIdx = -1) => {
      let y = startY;

      // Header row
      let x = margin;
      headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], headerH).fill(headerBg);
        const textY = y + (headerH - FS) / 2;
        doc.fontSize(FS).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
           .text(String(h), x + 5, textY, { width: colWidths[i] - 10, align: 'center', lineBreak: false });
        x += colWidths[i];
      });
      // Inner vertical dividers in header
      doc.lineWidth(0.5).strokeColor(INNER_CLR);
      x = margin;
      colWidths.slice(0, -1).forEach(w => {
        x += w;
        doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
      });
      // Thick outer border on header
      doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, y, cW, headerH).stroke();
      y += headerH;

      // Data rows
      rows.forEach((row, ri) => {
        // Measure dynamic row height
        let dynamicH = rowH;
        if (descColIdx >= 0 && row[descColIdx] && String(row[descColIdx]).includes('\n')) {
          const parts = String(row[descColIdx]).split('\n');
          const descW = colWidths[descColIdx] - 12;
          doc.fontSize(FS).font('Helvetica');
          const dH = doc.heightOfString(parts[0], { width: descW });
          doc.fontSize(7).font('Helvetica');
          const ddH = doc.heightOfString(parts.slice(1).join('\n'), { width: descW });
          dynamicH = Math.max(rowH, dH + ddH + 10);
        } else {
          row.forEach((cell, ci) => {
            const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
            const pad   = align === 'center' ? 3 : 6;
            const cellH = doc.fontSize(FS).font('Helvetica')
              .heightOfString(String(cell ?? '-'), { width: colWidths[ci] - pad * 2 }) + 8;
            if (cellH > dynamicH) dynamicH = cellH;
          });
        }

        if (y + dynamicH > pageH - 45) { doc.addPage(); y = drawPageHeader(); }
        const bg = ri % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

        // fillAndStroke ensures horizontal separators are not overpainted by the next row's fill
        doc.lineWidth(0.5).strokeColor(INNER_CLR);
        doc.rect(margin, y, cW, dynamicH).fillAndStroke(bg, INNER_CLR);

        // Inner vertical dividers
        doc.lineWidth(0.5).strokeColor(INNER_CLR);
        x = margin;
        colWidths.slice(0, -1).forEach(w => {
          x += w;
          doc.moveTo(x, y).lineTo(x, y + dynamicH).stroke();
        });

        // Cell text
        x = margin;
        row.forEach((cell, ci) => {
          if (ci === descColIdx && cell && String(cell).includes('\n')) {
            const parts = String(cell).split('\n');
            const descW = colWidths[ci] - 12;
            doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK);
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.text(parts[0], x + 6, y + 4, { width: descW, lineBreak: true });
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
            doc.text(parts.slice(1).join('\n'), x + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
          } else {
            const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
            const pad   = align === 'center' ? 3 : 6;
            doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK)
               .text(String(cell ?? '-'), x + pad, y + 4, {
                 width: colWidths[ci] - pad * 2, align, lineBreak: true, height: dynamicH - 6, ellipsis: false,
               });
          }
          x += colWidths[ci];
        });
        y += dynamicH;
      });

      if (rows.length === 0) {
        doc.rect(margin, y, cW, rowH).fill(COLORS.ROW_ALT);
        doc.fontSize(FS).font('Helvetica-Oblique').fillColor('#999')
           .text('No data available', margin, y + (rowH - FS) / 2, { width: cW, align: 'center' });
        y += rowH;
      }

      // Thick outer border around entire table
      doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, startY, cW, y - startY).stroke();
      return y;
    };

    // ── PAGE 1 ────────────────────────────────────────────────────────────
    let currentY = drawPageHeader();

    // Title: "Work Order" — centred, Times-Bold
    doc.fontSize(20).font('Times-Bold').fillColor('#000')
       .text('Work Order', margin, currentY, { width: cW, align: 'center' });
    currentY += 28;

    // ── INFO TABLE ────────────────────────────────────────────────────────
    // 6 columns: S.No | Description | Value | S.No | Description | Value
    const iColW = [36, 100, 131, 36, 100, 132]; // total = 535

    const preparedBy = wo.prepared_by || project.preparedBy?.name || '';
    const approvedBy = wo.approved_by || '';
    const dueDate    = wo.target_date  ? dayjs(wo.target_date).format('DD-MMM-YYYY')  : 'To be Filled';
    const issueDate  = wo.release_date ? dayjs(wo.release_date).format('DD-MMM-YYYY') : dayjs().format('DD-MMM-YYYY');

    const infoRows = [
      ['1', 'Work Order No',     wo.work_order_number || '-',                          '5', 'Prepared By', preparedBy || '-'],
      ['2', 'Project Name',      project.project_name || '-',                          '6', 'Approved By', approvedBy || '-'],
      ['3', 'Client Name',       project.client?.client_name || '-',                   '7', 'Due Date',    dueDate],
      ['4', 'Purchase Order No', project.salesOrder?.sales_order_number || '-',        '8', 'Issue Date',  issueDate],
    ];
    currentY = drawTable(currentY, ['S.No.', 'Description', 'Value', 'S.No.', 'Description', 'Value'], iColW, infoRows,
      COLORS.TABLE_HEAD, 20, 22, ['center', 'left', 'left', 'center', 'left', 'left']);
    currentY += 14;

    // ── 1. MATERIAL DETAILS ───────────────────────────────────────────────
    doc.fontSize(12).font('Times-Bold').fillColor('#000').text('1. Material Details:', margin, currentY);
    currentY += 16;

    const jobReqs = wo.job_requirements || {};
    const mColW   = [36, 260, 65, 174]; // total = 535
    const matRows = customParts.length > 0
      ? customParts.map((part, i) => {
          const origIdx = part._origIdx != null ? part._origIdx : i;
          const userReq = jobReqs[String(origIdx)] || jobReqs[origIdx] || '';
          const requirement = (typeof userReq === 'string' && userReq.trim()) ? userReq.trim() : 'N/A';
          const { description, drawingDisplay } = buildDescription({
            job_description:  part.job_description  || '',
            part_name:        part.part_name        || '',
            material:         part.material         || part.material_category || '',
            material_grade:   part.material_grade   || '',
            condition:        part.condition        || '',
            drawing_part_no:  part.drawing_part_no  || '',
            drawing_revision: part.drawing_revision || '',
          });
          const desc    = drawingDisplay ? `${description}\n${drawingDisplay}` : description;
          const rawQty  = part.quantity;
          const numQty  = Number(rawQty);
          const displayQty = !isNaN(numQty) && numQty > 0 ? numQty : 'N/A';
          return [i + 1, desc, displayQty, requirement];
        })
      : [['1', '-', 'N/A', 'N/A']];

    currentY = drawTable(currentY, ['S.No.', 'Description', 'Quantity', 'Requirements'], mColW, matRows,
      COLORS.TABLE_HEAD, 20, 26, ['center', 'left', 'center', 'left'], 1);
    currentY += 18;

    // ── 2. QUALITY REQUIREMENTS ───────────────────────────────────────────
    if (allRequirements.length > 0) {
      if (currentY + 60 > pageH - 45) { doc.addPage(); currentY = drawPageHeader(); }

      doc.fontSize(12).font('Times-Bold').fillColor('#000').text('2. Quality Requirements:', margin, currentY);
      currentY += 16;

      allRequirements.forEach((item, i) => {
        if (currentY + 14 > pageH - 45) { doc.addPage(); currentY = drawPageHeader(); }
        doc.fontSize(9).font('Helvetica').fillColor('#000')
           .text(`${i + 1}.  ${item}`, margin + 4, currentY, { width: cW - 8 });
        const lineCount = Math.ceil(doc.widthOfString(item, { fontSize: 9 }) / (cW - 30));
        currentY += 13 * Math.max(1, lineCount);
      });

      currentY += 20;
    }

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateWorkOrderPdf };
