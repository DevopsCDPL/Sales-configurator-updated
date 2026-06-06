/**
 * Shared PDF design constants and helpers.
 *
 * Based on the Proposal/Quotation reference design.
 * All PDFs should use these values for a consistent look.
 */

const { drawGlobalHeader, drawGlobalFooter, SIDE_MARGIN } = require('./pdfHeader');

// ------ Colour palette ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const COLORS = {
  TABLE_HEAD:      '#1F2937',   // dark gray table header background
  TABLE_HEAD_TEXT: '#FFFFFF',   // white text on table header
  BORDER:          '#000000',   // black strong outer borders
  BORDER_LIGHT:    '#000000',   // black inner dividers / light borders
  BORDER_MED:      '#333333',   // medium gray borders (column dividers in header)
  ROW_ALT:         '#F3F4F6',   // light gray alternating row tint
  ROW_WHITE:       '#FFFFFF',
  TEXT_DARK:       '#000000',   // all text black
  TEXT_MED:        '#000000',   // all text black
  TEXT_LIGHT:      '#000000',   // all text black
  TEXT_LABEL:      '#000000',   // all text black
  GT_BG:           '#F3F4F6',   // light gray grand-total row fill
  GT_BORDER:       '#000000',   // black grand-total border
  ACCENT:          '#1F2937',   // dark gray accent (matches table header)
  SECTION_TITLE:   '#000000',   // section heading black
};

// ------ Typography & table sizing ---------------------------------------------------------------------------------------------------------------------------------------------
const TABLE = {
  HDR_H:        22,    // table header row height
  HDR_FONT:     8.5,   // header font size
  DATA_FONT:    8,     // data row font size
  ROW_H:        22,    // default data row height
  BORDER_W:     0.5,   // outer border line width
  DIVIDER_W:    0.3,   // inner column divider line width
  CELL_PAD:     4,     // horizontal cell padding
};

const FOOTER_H = 30;   // reserve space for footer

// ------ Helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Draw a standard table header row.
 * @returns {number} header height added
 */
function drawTableHeader(doc, x, y, totalWidth, colWidths, headers, aligns) {
  const H = TABLE.HDR_H;
  doc.rect(x, y, totalWidth, H).fill(COLORS.TABLE_HEAD);
  doc.lineWidth(TABLE.BORDER_W).rect(x, y, totalWidth, H).strokeColor(COLORS.BORDER).stroke();
  let cx = x;
  headers.forEach((h, i) => {
    doc.fontSize(TABLE.HDR_FONT).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
       .text(h, cx + TABLE.CELL_PAD, y + (H - TABLE.HDR_FONT) / 2, {
         width: colWidths[i] - TABLE.CELL_PAD * 2,
         align: aligns?.[i] || 'center',
         lineBreak: false,
       });
    if (i < headers.length - 1) {
      doc.lineWidth(TABLE.DIVIDER_W)
         .moveTo(cx + colWidths[i], y)
         .lineTo(cx + colWidths[i], y + H)
         .strokeColor(COLORS.BORDER_MED)
         .stroke();
    }
    cx += colWidths[i];
  });
  return H;
}

/**
 * Draw a standard data row with cell text.
 * @param {Array} cells - string or { text, bold, align, color }
 * @returns {number} row height added
 */
function drawDataRow(doc, x, y, totalWidth, colWidths, cells, rowH, bg, aligns) {
  rowH = rowH || TABLE.ROW_H;
  bg   = bg   || COLORS.ROW_WHITE;

  doc.rect(x, y, totalWidth, rowH).fill(bg);
  doc.lineWidth(TABLE.BORDER_W).rect(x, y, totalWidth, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();

  let cx = x;
  cells.forEach((cell, i) => {
    const txt = typeof cell === 'object' ? (cell.text || '') : String(cell ?? '');
    const fnt = (typeof cell === 'object' && cell.bold) ? 'Helvetica-Bold' : 'Helvetica';
    const aln = aligns?.[i] || (typeof cell === 'object' && cell.align) || 'left';
    const clr = (typeof cell === 'object' && cell.color) || COLORS.TEXT_DARK;

    doc.fontSize(TABLE.DATA_FONT).font(fnt).fillColor(clr)
       .text(txt, cx + TABLE.CELL_PAD, y + 4, {
         width: colWidths[i] - TABLE.CELL_PAD * 2,
         align: aln,
         lineBreak: true,
         height: rowH - 8,
         ellipsis: true,
       });
    if (i < cells.length - 1) {
      doc.lineWidth(TABLE.DIVIDER_W)
         .moveTo(cx + colWidths[i], y)
         .lineTo(cx + colWidths[i], y + rowH)
         .strokeColor(COLORS.BORDER_LIGHT)
         .stroke();
    }
    cx += colWidths[i];
  });
  return rowH;
}

/**
 * Draw a numbered section title (e.g. "1. Summary").
 */
function drawSectionTitle(doc, margin, y, num, title) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
  doc.text(`${num}. ${title}`, margin, y);
}

module.exports = {
  COLORS,
  TABLE,
  FOOTER_H,
  drawGlobalHeader,
  drawGlobalFooter,
  drawTableHeader,
  drawDataRow,
  drawSectionTitle,
  SIDE_MARGIN,
};
