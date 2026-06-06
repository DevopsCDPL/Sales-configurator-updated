'use strict';
/**
 * Shared PDF header / footer for all generated documents (pdf-service edition).
 *
 * Identical layout to the Node backend pdfHeader.js – but this version has
 * NO database dependency.  The logo is supplied as a base64 data-URL in
 * companySettings.logo_data (passed directly from the java-backend request).
 *
 * Layout:
 *   Left:  Company Logo
 *   Right: Company Name, Address, Phone, Website
 *   Logo height matches info block height.
 *
 *   Single divider line ~2.65 cm from page top.
 *   Document title centred below divider.
 *
 * Page margins:
 *   Top    = 2.75 cm (~78 pt)
 *   Bottom = 1.5  cm (~43 pt)
 */

// Convert cm to PDF points (1 cm = 28.3465 pt)
const CM            = 28.3465;
const TOP_MARGIN    = Math.round(2.75 * CM);  // ~78 pt
const BOTTOM_MARGIN = Math.round(1.5  * CM);  // ~43 pt
const LINE1_Y       = Math.round(2.65 * CM);  // ~75 pt
const SIDE_MARGIN   = 40;

/**
 * Draw the standard header on the CURRENT page of doc.
 *
 * @param {import('pdfkit')} doc
 * @param {object}  companySettings  – { name, address, phone, website, tax_id, logo_data }
 * @param {string}  title            – document title (e.g. "QUOTATION")
 * @param {object}  [options]
 * @param {number}  [options.titleFontSize=14]
 * @returns {number} y position where body content should start
 */
function drawGlobalHeader(doc, companySettings, title, options = {}) {
  const pageW    = doc.page.width;
  const cW       = pageW - 2 * SIDE_MARGIN;
  const LOGO_MAX_W = 220;
  const HEADER_TOP = 14;   // pt from page top edge
  const NAME_H     = 16;
  const INFO_LINE_H = 11;

  // ── Measure info block height so we can vertically align logo to match ──
  const addrLines = (companySettings.address || '').split(/\n/).filter(Boolean);
  const telFax = [
    companySettings.phone   ? `Tel: ${companySettings.phone}`   : null,
    companySettings.tax_id  ? `Tax ID: ${companySettings.tax_id}` : null,
  ].filter(Boolean).join(' | ');

  const infoLineCount = addrLines.length + (telFax ? 1 : 0) + (companySettings.website ? 1 : 0);
  const infoBlockH    = NAME_H + infoLineCount * INFO_LINE_H;
  const blockH        = Math.max(infoBlockH, 60);

  // ── Logo (left side) ──────────────────────────────────────────────────
  let logoRendered = false;

  if (companySettings.logo_data) {
    try {
      const b64Match = companySettings.logo_data.match(/^data:[^;]+;base64,(.+)$/);
      if (b64Match) {
        doc.image(Buffer.from(b64Match[1], 'base64'), SIDE_MARGIN, HEADER_TOP, {
          fit:    [LOGO_MAX_W, blockH],
          align:  'left',
          valign: 'center',
        });
        logoRendered = true;
      }
    } catch (_e) {
      // base64 image unreadable — fall through to text fallback
    }
  }

  if (!logoRendered && companySettings.name) {
    // Text fallback when no logo is supplied
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(companySettings.name, SIDE_MARGIN, HEADER_TOP + (blockH - 14) / 2, {
         width: LOGO_MAX_W, lineBreak: true,
       });
  }

  // ── Company info (right side) ─────────────────────────────────────────
  const infoX = SIDE_MARGIN + LOGO_MAX_W + 20;
  const infoW = cW - LOGO_MAX_W - 20;
  let   iy    = HEADER_TOP + Math.max(0, (blockH - infoBlockH) / 2);

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a')
     .text(companySettings.name || '', infoX, iy, { width: infoW, align: 'right', lineBreak: false });
  iy += NAME_H;

  doc.fontSize(8).font('Helvetica').fillColor('#333333');
  for (const line of addrLines) {
    doc.text(line.trim(), infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += INFO_LINE_H;
  }
  if (telFax) {
    doc.text(telFax, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += INFO_LINE_H;
  }
  if (companySettings.website) {
    doc.text(companySettings.website, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
  }

  // ── Divider line ──────────────────────────────────────────────────────
  const dividerY = Math.max(LINE1_Y, HEADER_TOP + blockH + 4);
  doc.lineWidth(1.5)
     .moveTo(SIDE_MARGIN, dividerY)
     .lineTo(SIDE_MARGIN + cW, dividerY)
     .strokeColor('#000000')
     .stroke();

  // ── Document title ────────────────────────────────────────────────────
  let y = dividerY + 12;
  if (title) {
    const tfs = options.titleFontSize || 14;
    doc.fontSize(tfs).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(title, SIDE_MARGIN, y, { width: cW, align: 'center', lineBreak: false });
    y += tfs + 8;
  }

  return y;
}

/**
 * Draw the footer on every page already buffered in doc.
 * Call BEFORE doc.end() once all content has been added.
 *
 * @param {import('pdfkit')} doc
 * @param {object} companySettings – { name }
 */
function drawGlobalFooter(doc, companySettings) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cW    = pageW - 2 * SIDE_MARGIN;
  const fy    = pageH - BOTTOM_MARGIN;
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);

    doc.lineWidth(0.4)
       .moveTo(SIDE_MARGIN, fy - 10)
       .lineTo(SIDE_MARGIN + cW, fy - 10)
       .strokeColor('#CCCCCC')
       .stroke();

    doc.fontSize(7).font('Helvetica').fillColor('#888888')
       .text(companySettings.name || '', SIDE_MARGIN, fy - 6, {
         width: cW / 2, lineBreak: false,
       });

    doc.fontSize(7).font('Helvetica').fillColor('#888888')
       .text(`Page ${i + 1} of ${range.count}`, SIDE_MARGIN, fy - 6, {
         width: cW, align: 'right', lineBreak: false,
       });
  }
}

module.exports = {
  drawGlobalHeader,
  drawGlobalFooter,
  TOP_MARGIN,
  BOTTOM_MARGIN,
  SIDE_MARGIN,
};
