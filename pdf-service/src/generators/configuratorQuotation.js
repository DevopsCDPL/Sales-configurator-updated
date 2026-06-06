'use strict';
/**
 * Configurator Quotation PDF generator.
 *
 * Generates a professionally laid-out quotation PDF from a compiled
 * configurator quotation.  Data is supplied entirely via the payload – no
 * database access.
 *
 * Expected payload shape:
 * {
 *   company:   { name, address, phone, website, tax_id, logo_data }
 *   quotation: { quotation_number, customer_name, issued_at, project_name,
 *                project_number, configuration_name, configuration_code, currency }
 *   items:     [{ line_no, part_number, description, category, quantity,
 *                 unit, unit_price, line_total }]
 *   labour:    { hours: { CU,… }, costs: { CU,… }, rates: { CU,… },
 *                totals: { hours_total, cost_total } }
 *   totals:    { material_total, section_cost_total, overhead_amount,
 *                total_cost, target_price, rounded_price,
 *                actual_profit, actual_gm }
 * }
 */

const PDFDocument = require('pdfkit');
const dayjs       = require('dayjs');
const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN, TOP_MARGIN } = require('../utils/pdfHeader');
const { COLORS, TABLE } = require('../utils/pdfTemplate');

const FOOTER_H = 30;

/**
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
function generateConfiguratorQuotationPdf(payload) {
  return new Promise((resolve, reject) => {
    const {
      company:   companySettings = {},
      quotation: quotationMeta   = {},
      items:     lineItems       = [],
      labour:    labourData      = {},
      totals:    totalsData      = {},
    } = payload;

    const doc    = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const M     = SIDE_MARGIN;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cW    = pageW - 2 * M;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const checkPage = (needed) => {
      if (y + needed > pageH - FOOTER_H - 8) {
        drawGlobalFooter(doc, companySettings);
        doc.addPage();
        y = drawGlobalHeader(doc, companySettings, 'CONFIGURATOR QUOTATION', { titleFontSize: 13 });
      }
    };

    const fmt = (n) => {
      const v = Number(n) || 0;
      return `$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const fmtQty = (n) => {
      const v = Number(n) || 0;
      return v % 1 === 0 ? String(v) : v.toFixed(2);
    };

    const drawHRule = (lw = 0.5, col = '#CCCCCC') =>
      doc.lineWidth(lw).moveTo(M, y).lineTo(M + cW, y).strokeColor(col).stroke();

    const drawBanner = (text) => {
      checkPage(20);
      doc.rect(M, y, cW, 17).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(0.4).rect(M, y, cW, 17).strokeColor(COLORS.BORDER).stroke();
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
         .text(text, M + 6, y + 4, { width: cW - 12, lineBreak: false });
      y += 17;
    };

    // ── Draw header ──────────────────────────────────────────────────────────
    let y = drawGlobalHeader(doc, companySettings, 'CONFIGURATOR QUOTATION', { titleFontSize: 13 });

    // ── Info strip ───────────────────────────────────────────────────────────
    {
      const stripH   = 56;
      const colW     = cW / 3;
      const currency = quotationMeta.currency || 'USD';

      doc.rect(M, y, cW, stripH).fill('#F9FAFB');
      doc.lineWidth(0.5).rect(M, y, cW, stripH).strokeColor(COLORS.BORDER).stroke();
      // inner vertical dividers
      doc.lineWidth(0.3).moveTo(M + colW, y).lineTo(M + colW, y + stripH).strokeColor('#BBBBBB').stroke();
      doc.lineWidth(0.3).moveTo(M + 2 * colW, y).lineTo(M + 2 * colW, y + stripH).strokeColor('#BBBBBB').stroke();

      const cell = (x, cy, label, value, colWidth) => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#6B7280')
           .text(label, x + 5, cy, { width: colWidth - 10, lineBreak: false });
        doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(value || '—', x + 5, cy + 9, { width: colWidth - 10, lineBreak: false });
      };

      const issuedStr = quotationMeta.issued_at
        ? dayjs(quotationMeta.issued_at).format('DD MMM YYYY')
        : dayjs().format('DD MMM YYYY');

      // Column 1
      cell(M,           y + 5,  'QUOTATION #',   quotationMeta.quotation_number,  colW);
      cell(M,           y + 31, 'DATE',           issuedStr,                       colW);
      // Column 2
      cell(M + colW,    y + 5,  'CUSTOMER',       quotationMeta.customer_name,     colW);
      cell(M + colW,    y + 31, 'PROJECT',        quotationMeta.project_name,      colW);
      // Column 3
      cell(M + 2*colW,  y + 5,  'CONFIGURATION',  quotationMeta.configuration_name || quotationMeta.configuration_code, colW);
      cell(M + 2*colW,  y + 31, 'CURRENCY',       currency,                        colW);

      y += stripH + 10;
    }

    // ── Bill of Materials ────────────────────────────────────────────────────
    drawBanner('1.  BILL OF MATERIALS');

    // Column layout: Line, Part #, Description, Category, Qty, Unit, Unit Price, Total
    const COL_W  = [28, 70, 0, 60, 28, 26, 58, 58]; // 0 = fill remaining
    const COL_FILL_IDX = 2;
    const fixed = COL_W.reduce((s, w) => s + w, 0);
    COL_W[COL_FILL_IDX] = cW - fixed;

    const COL_X  = [];
    let cx = M;
    COL_W.forEach(w => { COL_X.push(cx); cx += w; });

    const COL_HDR  = ['LINE', 'PART #', 'DESCRIPTION', 'CATEGORY', 'QTY', 'UNIT', 'UNIT PRICE', 'TOTAL'];
    const COL_ALGN = ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right'];
    const HDR_H    = TABLE.HDR_H;

    // Table header row
    checkPage(HDR_H + 20);
    doc.rect(M, y, cW, HDR_H).fill(COLORS.TABLE_HEAD);
    doc.lineWidth(TABLE.BORDER_W).rect(M, y, cW, HDR_H).strokeColor(COLORS.BORDER).stroke();
    COL_HDR.forEach((h, i) => {
      doc.fontSize(TABLE.HDR_FONT).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
         .text(h, COL_X[i] + TABLE.CELL_PAD, y + (HDR_H - TABLE.HDR_FONT) / 2, {
           width: COL_W[i] - TABLE.CELL_PAD * 2,
           align: COL_ALGN[i],
           lineBreak: false,
         });
      if (i > 0) {
        doc.lineWidth(TABLE.DIVIDER_W)
           .moveTo(COL_X[i], y).lineTo(COL_X[i], y + HDR_H)
           .strokeColor('#FFFFFF').stroke();
      }
    });
    y += HDR_H;

    // Data rows
    let rowFill = false;
    let materialSubtotal = 0;

    for (const item of lineItems) {
      const desc  = item.description || '—';
      const descW = COL_W[COL_FILL_IDX] - TABLE.CELL_PAD * 2;
      // measure how many lines the description takes
      const descLines = Math.ceil(doc.fontSize(TABLE.DATA_FONT).widthOfString(desc) / descW) || 1;
      const rowH = Math.max(TABLE.ROW_H, descLines * (TABLE.DATA_FONT + 3) + 8);

      checkPage(rowH);

      const rowColor = rowFill ? COLORS.ROW_ALT : COLORS.ROW_WHITE;
      doc.rect(M, y, cW, rowH).fill(rowColor);
      doc.lineWidth(0.4).rect(M, y, cW, rowH).strokeColor('#CCCCCC').stroke();
      rowFill = !rowFill;

      const cy = y + (rowH - TABLE.DATA_FONT) / 2;

      const cells = [
        { idx: 0, text: String(item.line_no || ''),          align: 'center' },
        { idx: 1, text: item.part_number || '—',             align: 'left'   },
        { idx: 2, text: desc,                                align: 'left'   },
        { idx: 3, text: item.category || '—',                align: 'left'   },
        { idx: 4, text: fmtQty(item.quantity),               align: 'center' },
        { idx: 5, text: item.unit || 'ea',                   align: 'center' },
        { idx: 6, text: fmt(item.unit_price),                align: 'right'  },
        { idx: 7, text: fmt(item.line_total),                align: 'right'  },
      ];

      cells.forEach(({ idx, text, align }) => {
        doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(text, COL_X[idx] + TABLE.CELL_PAD, cy, {
             width:     COL_W[idx] - TABLE.CELL_PAD * 2,
             align,
             lineBreak: false,
           });
        if (idx > 0) {
          doc.lineWidth(0.3)
             .moveTo(COL_X[idx], y).lineTo(COL_X[idx], y + rowH)
             .strokeColor('#DDDDDD').stroke();
        }
      });

      materialSubtotal += Number(item.line_total) || 0;
      y += rowH;
    }

    if (lineItems.length === 0) {
      checkPage(TABLE.ROW_H);
      doc.rect(M, y, cW, TABLE.ROW_H).fill(COLORS.ROW_WHITE);
      doc.lineWidth(0.4).rect(M, y, cW, TABLE.ROW_H).strokeColor('#CCCCCC').stroke();
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor('#9CA3AF')
         .text('No line items', M + TABLE.CELL_PAD, y + (TABLE.ROW_H - TABLE.DATA_FONT) / 2,
               { width: cW - TABLE.CELL_PAD * 2, align: 'center', lineBreak: false });
      y += TABLE.ROW_H;
    }

    y += 10;

    // ── Labour Summary ───────────────────────────────────────────────────────
    const labourHours = labourData.hours  || {};
    const labourCosts = labourData.costs  || {};
    const labourRates = labourData.rates  || {};
    const labourTotals= labourData.totals || {};

    const labourCategories = Object.keys(labourHours).filter(k => (Number(labourHours[k]) || 0) > 0);

    if (labourCategories.length > 0) {
      drawBanner('2.  LABOUR SUMMARY');

      const LBR_COLS  = [cW * 0.35, cW * 0.20, cW * 0.20, cW * 0.25];
      const LBR_HDR   = ['CATEGORY', 'RATE ($/HR)', 'HOURS', 'COST'];
      const LBR_ALGN  = ['left', 'right', 'right', 'right'];
      let lx = M;
      const LBR_X = LBR_COLS.map(w => { const x = lx; lx += w; return x; });

      checkPage(HDR_H + 20);
      doc.rect(M, y, cW, HDR_H).fill(COLORS.TABLE_HEAD);
      doc.lineWidth(TABLE.BORDER_W).rect(M, y, cW, HDR_H).strokeColor(COLORS.BORDER).stroke();
      LBR_HDR.forEach((h, i) => {
        doc.fontSize(TABLE.HDR_FONT).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
           .text(h, LBR_X[i] + TABLE.CELL_PAD, y + (HDR_H - TABLE.HDR_FONT) / 2, {
             width: LBR_COLS[i] - TABLE.CELL_PAD * 2,
             align: LBR_ALGN[i],
             lineBreak: false,
           });
        if (i > 0)
          doc.lineWidth(TABLE.DIVIDER_W).moveTo(LBR_X[i], y).lineTo(LBR_X[i], y + HDR_H).strokeColor('#FFFFFF').stroke();
      });
      y += HDR_H;

      let lbrFill = false;
      for (const cat of labourCategories) {
        const catLabel = cat.toUpperCase().replace(/_/g, ' ');
        const hours = Number(labourHours[cat]) || 0;
        const rate  = Number(labourRates[cat]) || 0;
        const cost  = Number(labourCosts[cat]) || 0;

        checkPage(TABLE.ROW_H);
        doc.rect(M, y, cW, TABLE.ROW_H).fill(lbrFill ? COLORS.ROW_ALT : COLORS.ROW_WHITE);
        doc.lineWidth(0.4).rect(M, y, cW, TABLE.ROW_H).strokeColor('#CCCCCC').stroke();
        lbrFill = !lbrFill;

        const cy = y + (TABLE.ROW_H - TABLE.DATA_FONT) / 2;
        const lbrCells = [
          { i: 0, t: catLabel,     a: 'left'  },
          { i: 1, t: fmt(rate),    a: 'right' },
          { i: 2, t: fmtQty(hours), a: 'right' },
          { i: 3, t: fmt(cost),    a: 'right' },
        ];
        lbrCells.forEach(({ i, t, a }) => {
          doc.fontSize(TABLE.DATA_FONT).font('Helvetica').fillColor(COLORS.TEXT_DARK)
             .text(t, LBR_X[i] + TABLE.CELL_PAD, cy, {
               width: LBR_COLS[i] - TABLE.CELL_PAD * 2,
               align: a,
               lineBreak: false,
             });
          if (i > 0)
            doc.lineWidth(0.3).moveTo(LBR_X[i], y).lineTo(LBR_X[i], y + TABLE.ROW_H).strokeColor('#DDDDDD').stroke();
        });
        y += TABLE.ROW_H;
      }

      // Labour totals row
      const totalHrs  = Number(labourTotals.hours_total) || 0;
      const totalCost = Number(labourTotals.cost_total)  || 0;
      const tRowH = TABLE.ROW_H;
      checkPage(tRowH);
      doc.rect(M, y, cW, tRowH).fill(COLORS.GT_BG);
      doc.lineWidth(TABLE.BORDER_W).rect(M, y, cW, tRowH).strokeColor(COLORS.BORDER).stroke();
      const tcy = y + (tRowH - TABLE.DATA_FONT) / 2;
      doc.fontSize(TABLE.DATA_FONT).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
         .text('TOTAL', LBR_X[0] + TABLE.CELL_PAD, tcy, { width: LBR_COLS[0] - TABLE.CELL_PAD*2, lineBreak: false });
      doc.text('', LBR_X[1] + TABLE.CELL_PAD, tcy, { width: LBR_COLS[1] - TABLE.CELL_PAD*2, align: 'right', lineBreak: false });
      doc.text(fmtQty(totalHrs),  LBR_X[2] + TABLE.CELL_PAD, tcy, { width: LBR_COLS[2] - TABLE.CELL_PAD*2, align: 'right', lineBreak: false });
      doc.text(fmt(totalCost),    LBR_X[3] + TABLE.CELL_PAD, tcy, { width: LBR_COLS[3] - TABLE.CELL_PAD*2, align: 'right', lineBreak: false });
      y += tRowH + 10;
    }

    // ── Pricing Summary ──────────────────────────────────────────────────────
    drawBanner(`${labourCategories.length > 0 ? '3' : '2'}.  PRICING SUMMARY`);

    const materialTotal = Number(totalsData.material_total)   || materialSubtotal;
    const labourTotal   = Number(labourTotals.cost_total)     || Number(totalsData.section_cost_total) - materialTotal || 0;
    const overhead      = Number(totalsData.overhead_amount)  || 0;
    const totalCost     = Number(totalsData.total_cost)       || 0;
    const grandTotal    = Number(totalsData.rounded_price)    || Number(totalsData.target_price) || totalCost;
    const profit        = Number(totalsData.actual_profit)    || 0;
    const gm            = Number(totalsData.actual_gm)        || 0;

    const summaryRows = [
      { label: 'Material Total',  value: fmt(materialTotal), bold: false },
      { label: 'Labour Total',    value: fmt(labourTotal),   bold: false },
      { label: 'Overhead',        value: fmt(overhead),      bold: false },
      { label: 'Total Cost',      value: fmt(totalCost),     bold: false },
      { label: 'Margin',          value: `${(gm * 100).toFixed(1)} %  (${fmt(profit)})`, bold: false },
      { label: 'GRAND TOTAL',     value: fmt(grandTotal),    bold: true  },
    ];

    const SUM_W      = cW * 0.5;
    const SUM_X_LEFT = M + cW - SUM_W;  // right-aligned block
    const SUM_ROW_H  = 18;
    const LABEL_W    = SUM_W * 0.55;
    const VALUE_W    = SUM_W - LABEL_W;

    for (const row of summaryRows) {
      checkPage(SUM_ROW_H);
      const bgColor = row.bold ? COLORS.GT_BG : COLORS.ROW_WHITE;
      doc.rect(SUM_X_LEFT, y, SUM_W, SUM_ROW_H).fill(bgColor);
      doc.lineWidth(0.4).rect(SUM_X_LEFT, y, SUM_W, SUM_ROW_H).strokeColor('#CCCCCC').stroke();
      doc.lineWidth(0.3).moveTo(SUM_X_LEFT + LABEL_W, y).lineTo(SUM_X_LEFT + LABEL_W, y + SUM_ROW_H).strokeColor('#BBBBBB').stroke();

      const fy = row.bold ? 8.5 : TABLE.DATA_FONT;
      const fontName = row.bold ? 'Helvetica-Bold' : 'Helvetica';
      const textY = y + (SUM_ROW_H - fy) / 2;
      doc.fontSize(fy).font(fontName).fillColor(COLORS.TEXT_DARK)
         .text(row.label, SUM_X_LEFT + TABLE.CELL_PAD, textY, {
           width: LABEL_W - TABLE.CELL_PAD * 2, align: 'left', lineBreak: false,
         })
         .text(row.value, SUM_X_LEFT + LABEL_W + TABLE.CELL_PAD, textY, {
           width: VALUE_W - TABLE.CELL_PAD * 2, align: 'right', lineBreak: false,
         });
      y += SUM_ROW_H;
    }

    y += 16;

    // ── Terms / Notes ────────────────────────────────────────────────────────
    const terms = quotationMeta.terms || '';
    const notes = quotationMeta.notes || '';

    if (terms || notes) {
      checkPage(30);
      drawBanner(`${labourCategories.length > 0 ? '4' : '3'}.  TERMS & NOTES`);
      checkPage(20);
      if (terms) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
           .text('Terms:', M + 4, y, { width: cW - 8 });
        y = doc.y + 2;
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(terms, M + 4, y, { width: cW - 8 });
        y = doc.y + 6;
      }
      if (notes) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK)
           .text('Notes:', M + 4, y, { width: cW - 8 });
        y = doc.y + 2;
        doc.fontSize(8).font('Helvetica').fillColor(COLORS.TEXT_DARK)
           .text(notes, M + 4, y, { width: cW - 8 });
        y = doc.y + 6;
      }
    }

    // ── Footer on all pages ──────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawGlobalFooter(doc, companySettings);
    }

    doc.end();
  });
}

module.exports = { generateConfiguratorQuotationPdf };
