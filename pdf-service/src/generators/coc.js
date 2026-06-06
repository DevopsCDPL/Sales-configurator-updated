'use strict';
/**
 * Certificate of Conformance PDF generator.
 * Supports two layouts:
 *  - Project-level CoC  (type === 'coc'):     matches qualityService.js generateCoCPdf
 *  - Per-job CoC        (type === 'job_coc'): matches qualityService.js generateJobCoCPdf
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildEstimateLineItems } = require('../utils/calculations');

function generateCoCPdf(payload) {
  const { company: companySettings, project } = payload;
  const isJobCoc = payload.jobIndex != null;
  if (isJobCoc) return _generateJobCocLayout(payload, companySettings, project);
  return _generateProjectCocLayout(payload, companySettings, project);
}

// ────────────────────────────────────────────────────────────────────────────
// Project-level CoC — matches qualityService.js generateCoCPdf
// ────────────────────────────────────────────────────────────────────────────
function _generateProjectCocLayout(payload, companySettings, project) {
  const qr  = project.qualityRecord || {};
  const so  = project.salesOrder    || {};

  // Resolve configurator estimated items
  const estimates   = Array.isArray(project.estimate) ? project.estimate
    : (project.estimate ? [project.estimate] : []);
  const selectedEst = pickBestEstimate(estimates, project.selected_revision)
    || estimates[estimates.length - 1];
  const customParts = selectedEst?.custom_parts || [];
  const firstPart   = customParts[0] || {};

  // Total quantity: prefer project.quantity, fallback to sum of configurator parts
  const _rawQty = (project.quantity != null && project.quantity !== '')
    ? project.quantity
    : customParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  const totalQty = (_rawQty != null && _rawQty !== '' && _rawQty !== 0) ? _rawQty : 'N/A';

  const fmtDate = (d) => d ? dayjs(d).format('MM/DD/YYYY') : 'N/A';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin       = 50;
    const pageWidth    = doc.page.width;
    const contentWidth = pageWidth - 2 * margin;
    const colWidth     = (contentWidth - 20) / 2;
    const leftX        = margin;
    const rightX       = margin + colWidth + 20;
    const headerH      = 24;
    const rowH         = 22;
    const GREEN        = COLORS.TABLE_HEAD;
    let y              = margin;
    let x;

    // ── Header ───────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'Certificate of Conformance');

    // ── TO / FROM ────────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
    doc.text('To:', leftX, y);
    doc.text('From:', rightX, y);
    y += 18;

    const client     = project.client     || {};
    const preparedBy = project.preparedBy || {};
    const toLines = [
      `Company: ${client.client_name || 'N/A'}`,
      `POC: ${client.poc_name || 'N/A'}`,
      `Email: ${client.poc_email || 'N/A'}`,
      `Phone: ${client.poc_phone || 'N/A'}`,
    ];
    const fromLines = [
      companySettings.name || '',
      `POC: ${preparedBy.name || 'N/A'}${preparedBy.position ? ' | ' + preparedBy.position : ''}`,
      `Email: ${preparedBy.email || 'N/A'}`,
      `Phone: ${preparedBy.phone || companySettings.phone || 'N/A'}`,
    ].filter(Boolean);

    doc.fontSize(9).font('Helvetica').fillColor('#333');
    toLines.forEach((line, i)   => doc.text(line, leftX,  y + i * 14, { width: colWidth }));
    fromLines.forEach((line, i) => doc.text(line, rightX, y + i * 14, { width: colWidth }));
    y += 14 * Math.max(toLines.length, fromLines.length) + 10;

    // ── Separator ────────────────────────────────────────────────────────────
    doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
    y += 15;

    // ── Project Details ───────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Project Details', margin, y);
    y += 18;

    const details = [
      ['Project Name',     project.project_name           || 'N/A'],
      ['PO Number',        so.customer_po_number          || 'N/A'],
      ['Quantity',         String(totalQty)],
      ['Inspection Date',  fmtDate(qr.inspection_date)],
    ];
    doc.fontSize(9).fillColor('#333');
    details.forEach((pair, idx) => {
      const rowY = y + idx * 16;
      doc.font('Helvetica-Bold').text(`${pair[0]}:`, leftX, rowY, { continued: true, width: contentWidth / 2 });
      doc.font('Helvetica').text(`  ${pair[1]}`);
    });
    y += details.length * 16 + 10;

    // ── Material Specification ────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Material Specification', margin, y);
    y += 18;

    const matColW = [contentWidth / 2, contentWidth / 2];
    doc.rect(margin, y, contentWidth, headerH).fill(GREEN);
    x = margin;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    ['Parameter', 'Value'].forEach((h, i) => {
      doc.text(h, x + 4, y + 7, { width: matColW[i] - 8 });
      x += matColW[i];
    });
    y += headerH;

    const matRows = [
      ['Material Type',        project.material_type         || firstPart.material              || 'N/A'],
      ['Material Grade',       project.material_grade        || firstPart.material_grade        || 'N/A'],
      ['Heat Number',          project.heat_number           || firstPart.heat_number           || 'N/A'],
      ['Material Supplied By', project.material_supplied_by  || firstPart.raw_material_supplied_by || 'N/A'],
    ];
    doc.font('Helvetica').fontSize(8).fillColor('#333');
    matRows.forEach((row, idx) => {
      if (idx % 2 === 0) doc.rect(margin, y, contentWidth, rowH).fill(COLORS.ROW_ALT);
      doc.lineWidth(0.5).rect(margin, y, contentWidth, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
      x = margin;
      doc.font('Helvetica-Bold').fillColor('#333').text(row[0], x + 4, y + 6, { width: matColW[0] - 8 });
      x += matColW[0];
      doc.font('Helvetica').fillColor('#333').text(row[1], x + 4, y + 6, { width: matColW[1] - 8 });
      y += rowH;
    });
    y += 15;

    // ── Inspection Results ────────────────────────────────────────────────────
    doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Inspection Results', margin, y);
    y += 18;

    const inspColW = [30, contentWidth - 30 - 80 - 150, 80, 150];
    doc.rect(margin, y, contentWidth, headerH).fill(GREEN);
    x = margin;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    ['#', 'Inspection Item', 'Result', 'Notes'].forEach((h, i) => {
      doc.text(h, x + 4, y + 7, { width: inspColW[i] - 8 });
      x += inspColW[i];
    });
    y += headerH;

    const inspectionChecklist = qr.inspection_checklist || [];
    const inspRows = inspectionChecklist.length > 0
      ? inspectionChecklist.map((item, idx) => [
          String(idx + 1),
          item.name || item.description || `Item ${idx + 1}`,
          item.passed === true ? 'PASS' : item.passed === false ? 'FAIL' : 'N/A',
          item.notes || '',
        ])
      : [
          ['1', 'Dimensional Verification', qr.dimensional_verification ? 'PASS' : 'N/A', ''],
          ['2', 'Visual Inspection',         qr.visual_inspection        ? 'PASS' : 'N/A', ''],
          ['3', 'Hardness Testing',           qr.hardness_testing         ? 'PASS' : 'N/A', ''],
          ['4', 'NDT Testing',                qr.ndt_testing              ? 'PASS' : 'N/A', ''],
          ['5', 'Pressure Testing',           qr.pressure_testing         ? 'PASS' : 'N/A', ''],
          ['6', 'MTR Verification',           qr.mtr_verification         ? 'PASS' : 'N/A', ''],
        ];

    doc.font('Helvetica').fontSize(8).fillColor('#333');
    inspRows.forEach((row, idx) => {
      if (y > doc.page.height - margin - 120) { doc.addPage(); y = margin; }
      if (idx % 2 === 0) doc.rect(margin, y, contentWidth, rowH).fill(COLORS.ROW_ALT);
      doc.lineWidth(0.5).rect(margin, y, contentWidth, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
      x = margin;
      row.forEach((val, i) => {
        const isResult = i === 2;
        const clr = isResult
          ? (val === 'PASS' ? '#2e7d32' : val === 'FAIL' ? '#c62828' : '#666')
          : '#333';
        doc.font(isResult ? 'Helvetica-Bold' : 'Helvetica').fillColor(clr)
           .text(val, x + 4, y + 6, { width: inspColW[i] - 8 });
        x += inspColW[i];
      });
      y += rowH;
    });
    y += 15;

    // ── Overall Result ────────────────────────────────────────────────────────
    const overallResult  = qr.overall_result || 'pending';
    const resultColor    = overallResult === 'pass' ? '#2e7d32' : overallResult === 'fail' ? '#c62828' : '#666';
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
       .text('Overall Result: ', margin, y, { continued: true });
    doc.fillColor(resultColor).text(overallResult.toUpperCase());
    y += 22;

    // ── Separator ────────────────────────────────────────────────────────────
    doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
    y += 15;

    // ── Certification ─────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Certification', margin, y);
    y += 18;
    const certText = 'This is to certify that the above material/product has been manufactured, inspected, and tested '
      + 'in accordance with the applicable specifications and requirements. All items conform to the purchase order '
      + 'requirements and applicable industry standards. The products have been found to be in full conformance '
      + 'with all specified requirements.';
    doc.fontSize(9).font('Helvetica').fillColor('#333')
       .text(certText, margin, y, { width: contentWidth, align: 'justify' });
    y += doc.heightOfString(certText, { width: contentWidth }) + 20;

    // ── Inspector Notes ───────────────────────────────────────────────────────
    if (qr.inspector_notes) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Inspector Notes:', margin, y);
      y += 14;
      doc.fontSize(9).font('Helvetica').fillColor('#555')
         .text(qr.inspector_notes, margin, y, { width: contentWidth });
      y += doc.heightOfString(qr.inspector_notes, { width: contentWidth }) + 15;
    }

    // ── Separator ────────────────────────────────────────────────────────────
    y += 10;
    doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
    y += 20;

    // ── Signature Block ───────────────────────────────────────────────────────
    const approvedName = companySettings.poc_name || companySettings.contact_person || preparedBy.name || '';
    const approvedDate = dayjs().format('DD-MMM-YYYY');
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text(`Quality Inspector: ${qr.inspector_name || 'N/A'}`, leftX,  y, { width: colWidth });
    doc.text(`Date: ${fmtDate(qr.inspection_date)}`,             rightX, y, { width: colWidth });
    y += 20;
    doc.font('Helvetica-Bold');
    doc.text(`Approved By: ${approvedName || 'N/A'}`, leftX,  y, { width: colWidth });
    doc.text(`Date: ${approvedDate}`,                  rightX, y, { width: colWidth });

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Per-job CoC — matches qualityService.js generateJobCoCPdf
// ────────────────────────────────────────────────────────────────────────────
function _generateJobCocLayout(payload, companySettings, project) {
  const jobIndex = Number(payload.jobIndex) || 0;
  const qr       = project.qualityRecord || {};
  const so       = project.salesOrder    || {};
  const wo       = project.workOrder     || {};

  // Resolve configurator estimated items
  const estimates   = Array.isArray(project.estimate) ? project.estimate
    : (project.estimate ? [project.estimate] : []);
  const selectedEst = pickBestEstimate(estimates, project.selected_revision)
    || estimates[estimates.length - 1];
  const customParts = selectedEst?.custom_parts || [];
  const part        = customParts[jobIndex] || {};
  const allLineItems = buildEstimateLineItems(selectedEst);
  const lineItem    = allLineItems[jobIndex] || {};

  const woNumber  = wo.work_order_number || project.project_name || '';
  const partDesc  = part.job_description || project.project_name || '';
  const partNumber = part.drawing_part_no || project.project_name || '';
  const material  = [part.material, part.material_grade].filter(Boolean).join(' ')
    || [project.material_type, project.material_grade].filter(Boolean).join(' ') || '';

  const estQty      = lineItem.quantity || 0;
  const rawQty      = Number(part.quantity) || 0;
  const resolvedQty = estQty > 0 ? estQty : rawQty;
  const qty         = resolvedQty > 0 ? String(resolvedQty) : '-';

  const prodForms = Array.isArray(wo.production_forms) ? wo.production_forms : [];
  const prodForm  = prodForms.find(f => f.jobIndex === jobIndex) || prodForms[jobIndex];
  const heatNumber = prodForm?.heatNumber || part.heat_number || project.heat_number || 'N/A';

  const revRaw  = part.revision != null && part.revision !== '' ? part.revision
    : (selectedEst?.revision != null ? selectedEst.revision
      : (project.revision != null ? project.revision : ''));
  const revision = revRaw !== '' ? `R${revRaw}` : '';

  // Per-job form data from quality record
  const jobForms    = qr.job_quality_forms || [];
  const jobForm     = jobForms.find(f => f.jobIndex === jobIndex) || {};
  const checklist   = jobForm.checklist || [];
  const customerPO  = so.customer_po_number || so.po_number || '';
  const serialNumbers = jobForm.cocSerialNumber || jobForm.serialNumbers
    || `COC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const procedureId = jobForm.cocProcedureId
    || `QF-${String(Date.now()).slice(-4)}`;

  const fmtDate = (d) => d ? dayjs(d).format('DD-MMM-YY') : dayjs().format('DD-MMM-YY');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin    = 40;
    const pageWidth = doc.page.width;
    const cw        = pageWidth - 2 * margin;
    const GREEN     = COLORS.TABLE_HEAD;
    let y           = margin;

    const cellRect = (cx, cy, w, h, opts = {}) => {
      doc.rect(cx, cy, w, h).strokeColor(opts.stroke || '#333').lineWidth(0.5).stroke();
    };
    const cellText = (text, cx, cy, w, h, opts = {}) => {
      const pad = opts.pad || 4;
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(opts.size || 8)
         .fillColor(opts.color || '#000')
         .text(String(text), cx + pad, cy + pad,
           { width: w - pad * 2, height: h - pad * 2, align: opts.align || 'left', lineBreak: true, ellipsis: false });
    };

    // ── Header ───────────────────────────────────────────────────────────────
    y = drawGlobalHeader(doc, companySettings, 'Certificate of Conformance');

    // ── Job Info Row 1 ────────────────────────────────────────────────────────
    const jobRowH = 32;
    const cols1 = [
      { label: 'WO',                  value: woNumber,            w: cw * 0.13 },
      { label: 'Product Description', value: partDesc,            w: cw * 0.25 },
      { label: 'Procedure ID',        value: procedureId,         w: cw * 0.12 },
      { label: 'Part Number',         value: partNumber,          w: cw * 0.12 },
      { label: 'Revision',            value: String(revision),    w: cw * 0.08 },
      { label: 'Material',            value: material,            w: cw * 0.13 },
      { label: 'Qty',                 value: qty,                 w: cw * 0.08 },
      { label: 'Date',                value: fmtDate(new Date()), w: cw * 0.09 },
    ];
    const totalW1 = cols1.reduce((s, c) => s + c.w, 0);
    let cx1 = margin;
    cols1.forEach(col => {
      col.w = (col.w / totalW1) * cw;
      const cellH = jobRowH / 2;
      doc.rect(cx1, y, col.w, cellH).fillAndStroke(GREEN, '#333').lineWidth(0.5);
      cellText(col.label, cx1, y, col.w, cellH, { bold: true, size: 6.5, color: '#ffffff' });
      cellRect(cx1, y + cellH, col.w, cellH);
      cellText(col.value, cx1, y + cellH, col.w, cellH, { size: 7 });
      cx1 += col.w;
    });
    y += jobRowH;

    // ── Job Info Row 2 ────────────────────────────────────────────────────────
    const cols2 = [
      { label: 'Customer PO Number',  value: customerPO,    w: cw * 0.30 },
      { label: 'Serial Numbers',      value: serialNumbers, w: cw * 0.40 },
      { label: 'Material Heat Number', value: heatNumber,   w: cw * 0.30 },
    ];
    const totalW2 = cols2.reduce((s, c) => s + c.w, 0);
    let cx2 = margin;
    cols2.forEach(col => {
      col.w = (col.w / totalW2) * cw;
      const cellH = jobRowH / 2;
      doc.rect(cx2, y, col.w, cellH).fillAndStroke(GREEN, '#333').lineWidth(0.5);
      cellText(col.label, cx2, y, col.w, cellH, { bold: true, size: 6.5, color: '#ffffff' });
      cellRect(cx2, y + cellH, col.w, cellH);
      cellText(col.value, cx2, y + cellH, col.w, cellH, { size: 7 });
      cx2 += col.w;
    });
    y += jobRowH + 14;

    // ── Procedure Table ───────────────────────────────────────────────────────
    const snW        = cw * 0.08;
    const procLabelW = cw * 0.34;
    const descW      = cw * 0.40;
    const procValW   = cw - snW - procLabelW - descW;
    const procRowH   = 18;

    doc.rect(margin, y, cw, procRowH).fill(GREEN);
    cellRect(margin, y, snW, procRowH);
    cellText('S.No.', margin, y, snW, procRowH, { bold: true, size: 7, align: 'center', color: '#ffffff' });
    cellRect(margin + snW, y, procLabelW, procRowH);
    cellText('Procedure', margin + snW, y, procLabelW, procRowH, { bold: true, size: 8, color: '#ffffff' });
    cellRect(margin + snW + procLabelW, y, descW, procRowH);
    cellText('Description', margin + snW + procLabelW, y, descW, procRowH, { bold: true, size: 8, color: '#ffffff' });
    cellRect(margin + snW + procLabelW + descW, y, procValW, procRowH);
    cellText('Report', margin + snW + procLabelW + descW, y, procValW, procRowH, { bold: true, size: 8, align: 'center', color: '#ffffff' });
    y += procRowH;

    const defaultProcedures = [
      'Dimensional Verification', 'Visual Inspection', 'Hardness Testing',
      'Non-destructive Examination', 'Pressure Testing', 'MTR',
      'Dimension Inspection Report', 'Surface Finish', 'Heat Treatment',
    ];
    const tableChecklist = checklist.length > 0
      ? checklist
      : defaultProcedures.map(name => ({ name, included: false, description: '' }));

    tableChecklist.forEach((item, sn) => {
      const val = item.included ? 'Yes' : 'No';
      cellRect(margin, y, snW, procRowH);
      cellText(String(sn + 1), margin, y, snW, procRowH, { size: 8, align: 'center' });
      cellRect(margin + snW, y, procLabelW, procRowH);
      cellText(item.name || '', margin + snW, y, procLabelW, procRowH, { size: 8 });
      cellRect(margin + snW + procLabelW, y, descW, procRowH);
      cellText(item.description || '', margin + snW + procLabelW, y, descW, procRowH, { size: 7 });
      cellRect(margin + snW + procLabelW + descW, y, procValW, procRowH);
      cellText(val, margin + snW + procLabelW + descW, y, procValW, procRowH, { size: 8, align: 'center' });
      y += procRowH;
    });
    y += 18;

    // ── Inspector Notes / Comments ────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Inspector Notes / Comments:', margin, y);
    y += 14;
    const commentText = jobForm.inspectorNotes || '';
    if (commentText) {
      doc.font('Helvetica').fontSize(8).fillColor('#000').text(commentText, margin, y, { width: cw });
      y = doc.y + 12;
    } else {
      y += 20;
    }

    // ── Signature ─────────────────────────────────────────────────────────────
    if (y + 40 < doc.page.height - margin) {
      const approvedByName = companySettings.poc_name || companySettings.contact_person
        || (project.preparedBy || {}).name || '';
      const approvedDate = dayjs().format('DD-MMM-YYYY');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
         .text('Approved By: ', margin, y, { continued: true, width: cw });
      doc.font('Helvetica').text(approvedByName || '_____________________________', { continued: false });
      y += 14;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
         .text('Date: ', margin, y, { continued: true, width: cw });
      doc.font('Helvetica').text(approvedDate, { continued: false });
    }

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateCoCPdf };
