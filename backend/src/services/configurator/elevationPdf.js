'use strict';

/**
 * elevationPdf.js — pdfkit twin of the front-elevation generator.
 *
 * Exports: drawElevation(doc, region, board)
 *
 *   region  : { x, y, maxWidth, maxHeight }  — points on the PDF page
 *   board   : the item object from tpsProposalPdf buildItem(), which already
 *             carries sections[] and lines[] loaded from the DB.  We derive
 *             ElevationSection data from:
 *               section.layout.frame.width_in / height_in / topBusZone_in / bottomCableZone_in
 *               deviceLines with category CIRCUIT BREAKER
 *
 * Layout math mirrors elevation-generator.ts proportional scaling:
 *   totalBoardWidth → maxWidth  (keep aspect, scale height the same factor)
 * Monochrome (no colour fills — black, mid-grey for zones, dark outlines).
 * Defensive: missing frame dims → equal-width placeholders + note.
 */

const MONO = {
  frame:    '#000000',
  frameFill:'#F8F8F8',
  zone:     '#EBEBEB',   // bus / cable zone tint
  zoneLine: '#555555',
  device:   '#DDDDDD',
  devBorder:'#000000',
  text:     '#000000',
  sub:      '#444444',
  dim:      '#777777',
};

const FALLBACK_W_IN = 24;   // inches used when frame dims are absent
const FALLBACK_H_IN = 90;
const FALLBACK_BUS_IN  = 12;
const FALLBACK_CABLE_IN = 12;

/**
 * Build the elevation-section descriptors from a buildItem() result.
 * Returns { sections, hasMissingDims }
 */
function buildElevationSections(item) {
  if (!item || !Array.isArray(item._sections)) return { sections: [], hasMissingDims: true };
  let hasMissingDims = false;

  const sections = item._sections.map((s) => {
    const frame  = s.layout?.frame || {};
    const wIn    = Number(frame.width_in)  || 0;
    const hIn    = Number(frame.height_in) || 0;
    if (!wIn || !hIn) hasMissingDims = true;

    const busIn   = Number(frame.topBusZone_in)       || (hIn * 0.12) || FALLBACK_BUS_IN;
    const cableIn = Number(frame.bottomCableZone_in)  || (hIn * 0.14) || FALLBACK_CABLE_IN;

    // Devices for this section
    const devs = (item._deviceLines || []).filter((d) => d.section_id === s.id)
      .map((d) => ({
        designation: d.meta?.designation || d.name || d.part_number || '—',
        ratedA:      d.meta?.ratedA ?? null,
        heightIn:    Number(d.meta?.heightIn) || 3,
      }));

    return {
      sectionIndex: s.section_number,
      widthIn:  wIn  || FALLBACK_W_IN,
      heightIn: hIn  || FALLBACK_H_IN,
      topBusZoneIn:      busIn,
      bottomCableZoneIn: cableIn,
      devices: devs,
    };
  });

  return { sections, hasMissingDims };
}

/**
 * drawElevation — renders a parametric front-elevation view onto the PDF.
 *
 * @param {object} doc       pdfkit PDFDocument instance
 * @param {object} region    { x, y, maxWidth, maxHeight } in PDF points
 * @param {object} item      buildItem() result (carries _sections, _deviceLines)
 * @returns {number}         actual height consumed (points) — caller advances y by this
 */
function drawElevation(doc, region, item) {
  const { x: rx, y: ry, maxWidth, maxHeight } = region;

  try {
    const { sections, hasMissingDims } = buildElevationSections(item);

    const titleH = 16;
    const bottomAnnotH = 28;   // room for width labels + overall dim line

    if (!sections.length) {
      doc.fontSize(8).font('Helvetica-Oblique').fillColor(MONO.sub)
        .text('(no sections — elevation cannot be drawn)', rx, ry, { width: maxWidth });
      return 20;
    }

    const totalWIn = sections.reduce((a, s) => a + s.widthIn, 0);
    const maxHIn   = Math.max(...sections.map((s) => s.heightIn));

    // Scale factor: fit totalWIn → maxWidth; apply same factor to height
    const drawH = maxHeight - titleH - bottomAnnotH;
    const scaleW = maxWidth / totalWIn;
    const scaleH = drawH / maxHIn;
    const S = Math.min(scaleW, scaleH);   // uniform scale (keep aspect)

    const boardW = totalWIn * S;
    const boardH = maxHIn   * S;
    const xOff   = rx + (maxWidth - boardW) / 2;   // center horizontally
    const yOff   = ry + titleH;

    // Title
    doc.fontSize(9).font('Helvetica-Bold').fillColor(MONO.text)
      .text(`FRONT ELEVATION — NTS  (${item.name || 'Board'})`, rx, ry, { width: maxWidth, align: 'center' });

    let sx = xOff;
    for (const sec of sections) {
      const sw  = sec.widthIn  * S;
      const sh  = sec.heightIn * S;
      const sy  = yOff + (maxHIn - sec.heightIn) * S;   // bottom-align sections

      // Enclosure outline
      doc.lineWidth(1).rect(sx, sy, sw, sh)
        .fill(MONO.frameFill).rect(sx, sy, sw, sh)
        .lineWidth(1.2).strokeColor(MONO.frame).stroke();

      // Bus zone (top)
      const busH   = sec.topBusZoneIn    * S;
      const cableH = sec.bottomCableZoneIn * S;
      doc.rect(sx, sy, sw, busH).fill(MONO.zone);
      doc.lineWidth(0.5).moveTo(sx, sy + busH).lineTo(sx + sw, sy + busH)
        .strokeColor(MONO.zoneLine).stroke();
      doc.fontSize(6.5).font('Helvetica').fillColor(MONO.dim)
        .text('BUS', sx, sy + busH / 2 - 3, { width: sw, align: 'center' });

      // Cable zone (bottom)
      doc.rect(sx, sy + sh - cableH, sw, cableH).fill(MONO.zone);
      doc.lineWidth(0.5).moveTo(sx, sy + sh - cableH)
        .lineTo(sx + sw, sy + sh - cableH).strokeColor(MONO.zoneLine).stroke();
      doc.fontSize(6.5).font('Helvetica').fillColor(MONO.dim)
        .text('CABLE', sx, sy + sh - cableH / 2 - 3, { width: sw, align: 'center' });

      // Devices stacked from below bus zone
      const devAreaTop    = sy + busH + 3;
      const devAreaBottom = sy + sh - cableH - 3;
      let dy = devAreaTop;
      for (const d of sec.devices) {
        const dh = Math.max(d.heightIn * S, 14);
        if (dy + dh > devAreaBottom) break;   // overflow safety
        const dw = sw - 10;
        doc.roundedRect(sx + 5, dy, dw, dh, 2).fill(MONO.device)
          .roundedRect(sx + 5, dy, dw, dh, 2)
          .lineWidth(0.8).strokeColor(MONO.devBorder).stroke();
        doc.fontSize(6.5).font('Helvetica-Bold').fillColor(MONO.text)
          .text(d.designation, sx + 5, dy + dh / 2 - (d.ratedA ? 5 : 3), { width: dw, align: 'center' });
        if (d.ratedA) {
          doc.fontSize(6).font('Helvetica').fillColor(MONO.sub)
            .text(`${d.ratedA} A`, sx + 5, dy + dh / 2 + 2, { width: dw, align: 'center' });
        }
        dy += dh + 4;
      }

      // Section number label (above)
      doc.fontSize(7).font('Helvetica').fillColor(MONO.sub)
        .text(`S${sec.sectionIndex}`, sx, sy - 11, { width: sw, align: 'center' });

      // Width label below enclosure
      const lblY = yOff + boardH + 4;
      doc.fontSize(6.5).font('Helvetica').fillColor(MONO.dim)
        .text(`${sec.widthIn}"`, sx, lblY, { width: sw, align: 'center' });

      sx += sw;
    }

    // Overall dimension line
    const dimY = yOff + boardH + 14;
    doc.lineWidth(0.5).strokeColor(MONO.dim)
      .moveTo(xOff, dimY).lineTo(xOff + boardW, dimY).stroke();
    // Arrow ticks
    doc.moveTo(xOff, dimY - 3).lineTo(xOff, dimY + 3).stroke();
    doc.moveTo(xOff + boardW, dimY - 3).lineTo(xOff + boardW, dimY + 3).stroke();
    doc.fontSize(7).font('Helvetica').fillColor(MONO.sub)
      .text(`OVERALL ${totalWIn}" W × ${maxHIn}" H`, xOff, dimY + 4, { width: boardW, align: 'center' });

    if (hasMissingDims) {
      const noteY = dimY + 13;
      doc.fontSize(6.5).font('Helvetica-Oblique').fillColor(MONO.dim)
        .text('(frame dimensions pending — widths are proportional placeholders)', rx, noteY, { width: maxWidth, align: 'center' });
    }

    const consumed = titleH + boardH + bottomAnnotH + (hasMissingDims ? 10 : 0);
    return consumed;

  } catch (err) {
    // Never crash the proposal — just leave a note
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(MONO.sub)
      .text(`(elevation drawing failed: ${String(err.message || err).slice(0, 120)})`, rx, ry, { width: maxWidth });
    return 18;
  }
}

module.exports = { drawElevation, buildElevationSections };
