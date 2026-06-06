'use strict';
/**
 * Production Traveller PDF generator.
 * Ported from backend/src/services/documentService.js _buildProductionTravellerPdf().
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter } = require('../utils/pdfHeader');
const { COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate } = require('../utils/calculations');

function generateProductionTravellerPdf(payload) {
  const { company: companySettings, project } = payload;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const wo  = project.workOrder  || {};
    const so  = project.salesOrder || {};
    const ops = wo.operations || [];

    const _pfForm0         = (wo.production_forms || [])[0] || {};
    const _pfSectionB      = _pfForm0.sectionB || [];
    const _pfSectionACompleted = _pfForm0.sectionACompleted || {};
    const _pfQuantity      = _pfForm0.quantity || '';

    const estimates    = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const selectedEst  = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    const cp           = selectedEst?.custom_parts || [];
    const fp           = cp[0] || {};
    const matType  = project.material_type  || fp.material        || '';
    const matGrade = project.material_grade || fp.material_grade  || '';
    const heatNum  = project.heat_number    || fp.heat_number     || 'N/A';
    const qty      = project.quantity       || _pfQuantity || cp.reduce((s, p) => s + (Number(p.quantity) || 0), 0) || '-';

    const margin   = 45;
    const pageW    = doc.page.width;
    const pageH    = doc.page.height;
    const cW       = pageW - 2 * margin;
    const FOOTER_H = 34;

    const C_DARK   = COLORS.TEXT_DARK;
    const C_NAVY   = COLORS.ACCENT;
    const C_BORDER = COLORS.BORDER;
    const C_HDR    = COLORS.TABLE_HEAD;
    const C_ALT    = COLORS.ROW_ALT;

    const fmtDate = (d) => d ? dayjs(d).format('MM/DD/YYYY') : 'N/A';
    const modLabel = (t) => ({
      cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', welding: 'Welding',
      heat_treatment: 'Heat Treat', grinding: 'Grinding', drilling: 'Drilling',
      boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
      assembly: 'Assembly', testing: 'Testing / Inspection', deburr: 'Deburr',
      marking: 'Marking', inspection: 'Final QC / Inspection', other: 'Other',
    }[t] || t || 'Operation');

    let y = margin;
    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; return true; }
      return false;
    };

    const drawTick = (cx, cy, size) => {
      const s = size || 8;
      doc.save().lineWidth(1.8).strokeColor(C_DARK)
         .moveTo(cx - s * 0.35, cy).lineTo(cx - s * 0.05, cy + s * 0.35).lineTo(cx + s * 0.45, cy - s * 0.35)
         .stroke().restore();
    };

    const ptTitle = project.production_traveler_type === 'anodizing_industry'
      ? 'Production Traveller - Anodizing'
      : 'Production Traveller - Machining';
    y = drawGlobalHeader(doc, companySettings, ptTitle);

    const drawSection = (title) => {
      checkPage(30);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(C_NAVY).text(title, margin, y);
      y += 18;
    };

    const HDR_ROW_H = 24;
    const drawTblHdr = (cols, hdrs, aligns) => {
      const totalColWidth = cols.reduce((a, b) => a + b, 0);
      if (totalColWidth !== cW) { const diff = cW - totalColWidth; cols[cols.length - 1] += diff; }
      doc.rect(margin, y, cW, HDR_ROW_H).fill(C_HDR);
      let hx = margin;
      hdrs.forEach((h, i) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text(h, hx + 4, y + 7, { width: cols[i] - 8, align: aligns?.[i] || 'center', lineBreak: false });
        hx += cols[i];
      });
      doc.lineWidth(1.5).rect(margin, y, cW, HDR_ROW_H).strokeColor(C_BORDER).stroke();
      hx = margin;
      cols.forEach((w, i) => {
        if (i < cols.length - 1) {
          doc.lineWidth(1.5).moveTo(hx + w, y).lineTo(hx + w, y + HDR_ROW_H).strokeColor(C_BORDER).stroke();
        }
        hx += w;
      });
      y += HDR_ROW_H;
    };

    const drawRow = (cols, cells, rowH, bg = '#FFFFFF') => {
      if (y + rowH > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
      doc.rect(margin, y, cW, rowH).fill(bg);
      let rx = margin;
      cells.forEach((cell, i) => {
        const txt = typeof cell === 'string' ? cell : (cell.text || '');
        const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
        const aln = (typeof cell === 'object' && cell.align) ? cell.align : 'left';
        doc.fontSize(8).font(fnt).fillColor(C_DARK)
           .text(txt, rx + 5, y + 6, { width: cols[i] - 10, align: aln, lineBreak: true, height: rowH - 12 });
        rx += cols[i];
      });
      doc.lineWidth(1.5).rect(margin, y, cW, rowH).strokeColor(C_BORDER).stroke();
      rx = margin;
      cols.forEach((w, i) => {
        if (i < cols.length - 1) {
          doc.lineWidth(1.5).moveTo(rx + w, y).lineTo(rx + w, y + rowH).strokeColor(C_BORDER).stroke();
        }
        rx += w;
      });
      y += rowH;
    };

    // WO SUMMARY ROW
    const WO_C = [48, 52, 80, 0, 28, 30, 66, 62];
    WO_C[3] = cW - WO_C.reduce((a, b) => a + b, 0) + WO_C[3];
    drawTblHdr(WO_C,
      ['PT #', 'PO #', 'Part Number', 'Product Description', 'Rev. #', 'Qty', 'PO Date', 'Dim. Report'],
      ['center','center','left','left','center','center','center','center']);

    if (cp.length > 0) {
      cp.forEach((part, idx) => {
        const pfForm = (wo.production_forms || [])[idx] || {};
        const partQty = pfForm.quantity || part.quantity || _pfQuantity || '-';
        drawRow(WO_C, [
          { text: idx === 0 ? (wo.production_traveler_number || wo.work_order_number || '-') : '', align: 'center' },
          { text: idx === 0 ? (so.customer_po_number || so.sales_order_number || '-') : '', align: 'center' },
          { text: (part.drawing_part_no || '-') + (part.drawing_revision ? ' - ' + part.drawing_revision : ''), align: 'left' },
          { text: part.job_description || '-', align: 'left' },
          { text: String(project.revision || 'A'), align: 'center' },
          { text: String(partQty), align: 'center' },
          { text: idx === 0 ? fmtDate(so.order_date || so.created_at) : '', align: 'center' },
          { text: 'N/A', align: 'center' },
        ], 28, idx % 2 === 0 ? '#FFFFFF' : C_ALT);
      });
    } else {
      drawRow(WO_C, [
        { text: wo.production_traveler_number || wo.work_order_number || '-', align: 'center' },
        { text: so.customer_po_number || '-', align: 'center' },
        { text: '-', align: 'left' },
        { text: project.project_name || '-', align: 'left' },
        { text: String(project.revision || 'A'), align: 'center' },
        { text: String(qty), align: 'center' },
        { text: fmtDate(so.order_date || so.created_at), align: 'center' },
        { text: 'N/A', align: 'center' },
      ], 28);
    }
    y += 14;

    // SECTION A – MATERIAL
    drawSection('Section A: Material');

    const CHECK_W = 72;
    const LN_W    = 30;
    const OP_W    = 80;
    const DESC_W  = cW - LN_W - OP_W - CHECK_W;
    const A_COLS  = [LN_W, OP_W, DESC_W, CHECK_W];
    const SUB_W   = DESC_W / 3;

    drawTblHdr(A_COLS,
      ['Line', 'Operation', 'Description', 'Check off once\ncomplete'],
      ['center','left','center','center']);

    const A_ROW_H = 22;
    const drawSectionABlock = (lineNum, opName, subHeaders, subValues, bg, isCompleted) => {
      const blockH = A_ROW_H * 2;
      doc.rect(margin, y, cW, blockH).fill(bg);
      doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
         .text(String(lineNum), margin + 5, y + (blockH - 8) / 2, { width: LN_W - 10, align: 'center', lineBreak: false });
      doc.fontSize(8).font('Helvetica-Bold').fillColor(C_DARK)
         .text(opName, margin + LN_W + 5, y + (blockH - 8) / 2, { width: OP_W - 10, align: 'left', lineBreak: false });
      const descX = margin + LN_W + OP_W;
      subHeaders.forEach((h, i) => {
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
           .text(h, descX + i * SUB_W + 4, y + 6, { width: SUB_W - 8, align: 'center', lineBreak: false });
      });
      subValues.forEach((v, i) => {
        doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
           .text(String(v || '-'), descX + i * SUB_W + 4, y + A_ROW_H + 6, { width: SUB_W - 8, align: 'center', lineBreak: false });
      });
      doc.lineWidth(1.5).rect(margin, y, cW, blockH).strokeColor(C_BORDER).stroke();
      doc.lineWidth(1.5).moveTo(margin + LN_W + OP_W, y + A_ROW_H).lineTo(margin + LN_W + OP_W + DESC_W, y + A_ROW_H).strokeColor(C_BORDER).stroke();
      doc.lineWidth(1.5).strokeColor(C_BORDER);
      [LN_W, LN_W + OP_W, LN_W + OP_W + DESC_W].forEach(ox => {
        doc.moveTo(margin + ox, y).lineTo(margin + ox, y + blockH).stroke();
      });
      subHeaders.forEach((_, i) => {
        if (i < subHeaders.length - 1) {
          doc.lineWidth(1.0).moveTo(descX + (i + 1) * SUB_W, y).lineTo(descX + (i + 1) * SUB_W, y + blockH).strokeColor('#888').stroke();
        }
      });
      if (isCompleted) drawTick(margin + LN_W + OP_W + DESC_W + CHECK_W / 2, y + blockH / 2, 8);
      y += blockH;
    };

    const matSize = fp.raw_material_dimension || project.part_size || '-';
    drawSectionABlock(1, 'Material Specs', ['Size', 'Type', 'Heat'], [matSize, matType || '-', heatNum], '#FFFFFF', !!_pfSectionACompleted.material);
    drawSectionABlock(2, 'Saw', ['Saw Cut or Bar Feed?', 'Qty', 'Cut Length'],
      [_pfForm0.sawCutOrBarFeed || 'Saw Cut', String(qty), _pfForm0.cutLength || '-'],
      C_ALT, !!_pfSectionACompleted.saw);
    y += 14;

    // SECTION B – TRAVELER
    checkPage(60);
    drawSection('Section B: Traveler');

    const INIT_W    = 60;
    const DATE_W    = 60;
    const B_CHECK_W = 62;
    const B_COLS    = [LN_W, 80, 0, 70, INIT_W, DATE_W, B_CHECK_W];
    B_COLS[2] = cW - B_COLS.reduce((a, b) => a + b, 0) + B_COLS[2];
    drawTblHdr(B_COLS,
      ['Line', 'Operation', 'Description', 'Required\nOperation(s)?', 'Operator', 'Date', 'Check off once\ncomplete'],
      ['center','left','left','center','center','center','center']);

    const B_ROW_H = 26;
    const sectionBOps = _pfSectionB.length > 0 ? _pfSectionB : ops;
    if (sectionBOps.length > 0) {
      sectionBOps.forEach((op, idx) => {
        const reqd = op.is_external ? 'External' : op.required_operation ? op.required_operation : (op.is_required === false ? 'No' : 'Yes — Manual');
        drawRow(B_COLS, [
          { text: String(idx + 1), align: 'center' },
          { text: modLabel(op.module_type || op.operation || op.operation_name || ''), bold: true },
          { text: op.description || '' },
          { text: reqd, align: 'center' },
          { text: op.initials || op.operator_initials || op.operator || '', align: 'center' },
          { text: op.opDate || op.op_date || op.date || '', align: 'center' },
          { text: '', align: 'center' },
        ], B_ROW_H, idx % 2 === 0 ? '#FFFFFF' : C_ALT);
        if (op.completed) {
          const tickX = margin + B_COLS.slice(0, 6).reduce((a, b) => a + b, 0) + B_COLS[6] / 2;
          drawTick(tickX, y - B_ROW_H / 2, 7);
        }
      });
    } else {
      const emptyCount = project.production_traveler_type === 'anodizing_industry' ? 19 : 7;
      for (let i = 0; i < emptyCount; i++) {
        drawRow(B_COLS, [{ text: String(i + 1), align: 'center' }, '', '', '', '', '', ''], B_ROW_H, i % 2 === 0 ? '#FFFFFF' : C_ALT);
      }
    }
    y += 14;

    // SECTION C – GENERAL NOTES
    checkPage(60);
    drawSection('Section C: General Notes');
    const GN_ROW_H = 40;
    if (y + GN_ROW_H > pageH - FOOTER_H - margin) { doc.addPage(); y = margin; }
    doc.rect(margin, y, cW, GN_ROW_H).fill('#FFFFFF');
    doc.lineWidth(1.5).rect(margin, y, cW, GN_ROW_H).strokeColor(C_BORDER).stroke();
    const generalNotes = (_pfForm0.generalNotes || '').trim();
    if (generalNotes) {
      doc.fontSize(8).font('Helvetica').fillColor(C_DARK)
         .text(generalNotes, margin + 6, y + 6, { width: cW - 12, height: GN_ROW_H - 12, lineBreak: true });
    }
    y += GN_ROW_H + 14;

    drawGlobalFooter(doc, companySettings);
    doc.end();
  });
}

module.exports = { generateProductionTravellerPdf };
