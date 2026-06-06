/**
 * Shared PDF header layout for all generated documents.
 *
 * Layout:
 *   Left:  Company Logo
 *   Right: Company Name, Address, Phone, Website
 *   Logo height matches info block height.
 *
 * Two divider lines below header:
 *   Line 1 --- 2.65 cm from top  (--- 75 pt)
 *   Line 2 --- 3.2 cm from top   (--- 90.7 pt)
 *
 * Page margins:
 *   Top    = 2.75 cm (--- 78 pt)  --- but header starts slightly inside
 *   Bottom = 1.5 cm  (--- 42.5 pt)
 */

const settingsService = require('../services/settingsService');

// Convert cm to PDF points (1 cm --- 28.3465 pt)
const CM = 28.3465;
const TOP_MARGIN    = Math.round(2.75 * CM);   // --- 78 pt
const BOTTOM_MARGIN = Math.round(1.5 * CM);    // --- 43 pt
const LINE1_Y       = Math.round(2.65 * CM);   // --- 75 pt from top
const LINE2_Y       = Math.round(3.2 * CM);    // --- 91 pt from top
const SIDE_MARGIN   = 40;                       // left/right margin

/**
 * Draw the standard header on the current page.
 *
 * @param {PDFDocument} doc          - pdfkit document instance
 * @param {object}      companySettings - { name, address, phone, email, website, logo, tax_id }
 * @param {string}      title        - document title (e.g. "PACKING LIST")
 * @returns {number} y --- vertical position below the header where body content should start
 */
function drawGlobalHeader(doc, companySettings, title, options) {
  const pageW = doc.page.width;
  const cW    = pageW - 2 * SIDE_MARGIN;

  // --- Measure info block height first (for logo alignment) ---
  const HEADER_TOP = 14;                 // top padding from page edge
  const LOGO_MAX_W = 220;
  const NAME_H     = 16;                 // company name line spacing
  const INFO_LINE_H = 11;               // address/phone/website line spacing

  const addrLines = (companySettings.address || '').split(/\n/).filter(Boolean);
  const telFax = [
    companySettings.phone ? `Tel: ${companySettings.phone}` : null,
    companySettings.tax_id   ? `Tax ID: ${companySettings.tax_id}`
      : companySettings.tax_id ? `Tax ID: ${companySettings.tax_id}` : null,
  ].filter(Boolean).join(' | ');
  const infoLineCount = addrLines.length + (telFax ? 1 : 0) + (companySettings.website ? 1 : 0);
  const infoBlockH = NAME_H + infoLineCount * INFO_LINE_H;

  // Logo height = info block height (tops and bottoms aligned)
  const blockH = Math.max(infoBlockH, 60);  // minimum 60pt

  // --- Logo (left side) ---
  // Priority: base64 data (DB, always company-specific) > file path > text fallback
  let logoRendered = false;
  if (companySettings.logo_data) {
    try {
      const b64Match = companySettings.logo_data.match(/^data:[^;]+;base64,(.+)$/);
      if (b64Match) {
        doc.image(Buffer.from(b64Match[1], 'base64'), SIDE_MARGIN, HEADER_TOP, {
          fit: [LOGO_MAX_W, blockH],
          align: 'left',
          valign: 'center',
        });
        logoRendered = true;
      }
    } catch (e) {
      // base64 logo unreadable --- try file fallback
    }
  }
  if (!logoRendered) {
    const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);
    if (logoAbsPath) {
      try {
        doc.image(logoAbsPath, SIDE_MARGIN, HEADER_TOP, {
          fit: [LOGO_MAX_W, blockH],
          align: 'left',
          valign: 'center',
        });
        logoRendered = true;
      } catch (e) {
        // logo file unreadable --- skip
      }
    }
  }
  // Fallback: show company name in logo area if no logo available
  if (!logoRendered && companySettings.name) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(companySettings.name, SIDE_MARGIN, HEADER_TOP + (blockH - 14) / 2, {
         width: LOGO_MAX_W, lineBreak: true,
       });
  }

  // --- Company info (right side, vertically centred to match logo) ---
  const infoX = SIDE_MARGIN + LOGO_MAX_W + 20;
  const infoW = cW - LOGO_MAX_W - 20;

  let iy = HEADER_TOP + Math.max(0, (blockH - infoBlockH) / 2);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a')
     .text(companySettings.name || '', infoX, iy, { width: infoW, align: 'right', lineBreak: false });
  iy += NAME_H;

  doc.fontSize(8).font('Helvetica').fillColor('#333333');
  addrLines.forEach(line => {
    doc.text(line.trim(), infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += INFO_LINE_H;
  });

  if (telFax) {
    doc.text(telFax, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += INFO_LINE_H;
  }
  if (companySettings.website) {
    doc.text(companySettings.website, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += INFO_LINE_H;
  }

  // --- Single divider line ---
  const dividerY = Math.max(LINE1_Y, HEADER_TOP + blockH + 4);
  doc.lineWidth(1.5)
     .moveTo(SIDE_MARGIN, dividerY)
     .lineTo(SIDE_MARGIN + cW, dividerY)
     .strokeColor('#000000')
     .stroke();

  // --- Document title below divider line ---
  let y = dividerY + 12;
  if (title) {
    const tfs = (options && options.titleFontSize) || 14;
    doc.fontSize(tfs).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(title, SIDE_MARGIN, y, { width: cW, align: 'center', lineBreak: false });
    y += tfs + 8;
  }

  return y;
}

/**
 * Draw page footer on every page (call after doc content is done, before doc.end()).
 */
function drawGlobalFooter(doc, companySettings) {
  const pageW  = doc.page.width;
  const pageH  = doc.page.height;
  const cW     = pageW - 2 * SIDE_MARGIN;
  const fy     = pageH - BOTTOM_MARGIN;
  const range  = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.lineWidth(0.4)
       .moveTo(SIDE_MARGIN, fy - 10)
       .lineTo(SIDE_MARGIN + cW, fy - 10)
       .strokeColor('#CCCCCC')
       .stroke();
    doc.fontSize(7).font('Helvetica').fillColor('#888888')
       .text(companySettings.name || '', SIDE_MARGIN, fy - 6, { width: cW / 2, lineBreak: false });
    doc.fontSize(7).font('Helvetica').fillColor('#888888')
       .text(`Page ${i + 1} of ${range.count}`, SIDE_MARGIN, fy - 6, { width: cW, align: 'right', lineBreak: false });
  }
}

module.exports = {
  drawGlobalHeader,
  drawGlobalFooter,
  TOP_MARGIN,
  BOTTOM_MARGIN,
  SIDE_MARGIN,
  LINE1_Y,
  LINE2_Y,
};
