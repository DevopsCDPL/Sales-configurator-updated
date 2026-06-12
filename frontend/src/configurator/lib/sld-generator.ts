/**
 * sld-generator.ts -- SUBMITTAL-GRADE single-line diagram generator.
 *
 * Pure SVG renderer from configuration topology, drawn to low-voltage
 * one-line conventions per ANSI/IEEE Y32.2 (IEEE 315):
 *   - Utility service entrance with system-voltage + AFC callout.
 *   - LV power circuit breaker symbol with drawout chevrons for
 *     drawout (cradle) breakers, plain frame for fixed-mount.
 *   - Heavy main bus with rating + ground / neutral notation.
 *   - Section-ordered feeder taps with AF/AT, poles, trip class and
 *     load name, terminated with a load arrow.
 *   - Bus-tie breaker drawn IN the bus run between segments.
 *   - Dashed section boundaries with SECTION n labels.
 *   - Bordered title block (project, board, drawing no, rev, date, NTS).
 *
 * Monochrome line-work on a WHITE sheet so it prints / exports cleanly,
 * independent of the dark app theme. No external libraries.
 *
 * Signature contract (do NOT break): the exported generateSld(input)
 * returns { svg, warnings }, and SldDevice / SldInput keep their
 * existing field names. New fields are OPTIONAL so prior call-sites and
 * tests continue to compile and render.
 */

import type { SectionRole } from './safety-rules';

export interface SldDevice {
  designation: string;        // M1, T1, F1...
  role: SectionRole;
  ratingA: number | null;     // trip / sensor rating (AT)
  frameModel?: string;
  tripUnit?: string;          // e.g. LSIG, LSI
  sectionIndex: number;
  busSegment: number;         // 0-based; ties split segments

  // -- submittal-grade extras (optional, backward compatible) --
  frameA?: number | null;     // breaker frame ampacity (AF); falls back to ratingA
  poles?: number;             // 2 / 3 / 4
  mounting?: string;          // 'Drawout' | 'Fixed' (substring match on 'draw')
  interruptingKA?: number | null;
  loadDescription?: string;   // connected-load name shown under feeders
  normallyOpen?: boolean;     // tie default state (N.O. / N.C.)
}

export interface SldInput {
  title: string;              // project / board name
  configCode: string;         // CFG-0001 Rev B
  voltageSystem: string;      // raw system code, e.g. 480Y/277
  mainBusRatingA: number | null;
  sccrKA: number | null;
  devices: SldDevice[];
  busSegments: number;        // 1 single bus; 2 main-tie-main

  // -- submittal-grade extras (optional, backward compatible) --
  projectName?: string;       // title-block project line
  boardName?: string;         // title-block board line (defaults to title)
  drawingNo?: string;         // defaults to SLD-<boardName>
  revision?: string;          // title-block rev
  dateStr?: string;           // title-block date (else today)
  serviceEntrance?: boolean;  // draw service-entrance ground + SE note
  availableFaultKA?: number | null; // AFC callout; else sccrKA; else omit
  frequencyHz?: number;       // service frequency (default 60)
  wires?: number;             // 3 or 4; drives the n-wire label
}

/* -- monochrome print palette -- */
const INK = '#111111';        // primary line-work
const SOFT = '#555555';       // secondary text
const FAINT = '#999999';      // section separators / hairlines
const SHEET = '#FFFFFF';      // drawing sheet
const FONT = 'Arial, Helvetica, sans-serif';

/* -- layout constants -- */
const MARGIN = 36;            // sheet inner margin
const SERVICE_TOP = 64;       // y of utility tap origin
const BUS_Y = 250;            // main bus elevation
const COL_W = 132;            // horizontal pitch between feeders
const BREAKER_W = 26;         // CB symbol width
const BREAKER_H = 30;         // CB symbol height
const FEEDER_DROP = 150;      // bus -> load arrow drop
const MAX_PER_ROW = 14;       // wrap to a 2nd bus row beyond this many feeders
const ROW_GAP = 360;          // vertical gap between wrapped bus rows
const TITLE_W = 300;          // title-block width
const TITLE_H = 132;          // title-block height

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isDrawout(d: SldDevice): boolean {
  return /draw/i.test(d.mounting ?? '');
}

/** Human service label, e.g. "480Y/277V 3PH 4W 60Hz". */
function serviceLabel(input: SldInput): string {
  const code = (input.voltageSystem || '').trim();
  const hz = input.frequencyHz ?? 60;
  const single = /-1$/.test(code);
  const phase = single ? '1PH' : '3PH';
  let wires = input.wires;
  if (!wires) wires = /y/i.test(code) ? 4 : 3;
  const base = code.replace(/-1$/, '');
  return `${base}V ${phase} ${wires}W ${hz}Hz`.replace(/\s+/g, ' ').trim();
}

/* -- primitive helpers -- */
function line(x1: number, y1: number, x2: number, y2: number, w = 1.4, color = INK, dash?: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function txt(x: number, y: number, s: string, opts: { size?: number; color?: string; bold?: boolean; anchor?: 'start' | 'middle' | 'end' } = {}): string {
  const { size = 10, color = INK, bold = false, anchor = 'start' } = opts;
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="${FONT}"${bold ? ' font-weight="700"' : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;
}

/**
 * IEEE 315 protective-ground symbol: a vertical lead descending to three
 * horizontal bars of decreasing width.
 */
function drawGround(x: number, yTop: number): string {
  const e: string[] = [];
  const yBar = yTop + 12;
  e.push(line(x, yTop, x, yBar, 1.4));
  e.push(line(x - 9, yBar, x + 9, yBar, 1.6));
  e.push(line(x - 6, yBar + 4, x + 6, yBar + 4, 1.6));
  e.push(line(x - 3, yBar + 8, x + 3, yBar + 8, 1.6));
  return e.join('');
}

export interface BreakerOpts {
  drawout: boolean;
  designation?: string;
  ratings?: string;   // "1600AF / 1200AT"
  poles?: string;     // "3P"
  trip?: string;      // "LSIG"
  device?: string;    // frame model
  labelSide?: 'right' | 'left';
}

/**
 * Conventional LV power circuit breaker symbol: an open square frame on
 * the conductor. Drawout (cradle-mounted) breakers get the chevron
 * brackets (double-angle) flanking the frame; fixed breakers are plain.
 * The conductor passes vertically through (yTop = bus/source side,
 * returns yBottom = load side).
 */
function drawBreaker(x: number, yTop: number, o: BreakerOpts): { svg: string; yBottom: number } {
  const e: string[] = [];
  const boxTop = yTop + 8;
  const boxBot = boxTop + BREAKER_H;
  const hw = BREAKER_W / 2;

  e.push(line(x, yTop, x, boxTop, 1.4));
  e.push(line(x, boxBot, x, boxBot + 8, 1.4));

  e.push(`<rect x="${x - hw}" y="${boxTop}" width="${BREAKER_W}" height="${BREAKER_H}" fill="${SHEET}" stroke="${INK}" stroke-width="1.6"/>`);

  if (o.drawout) {
    const cy = boxTop + BREAKER_H / 2;
    const bx = hw + 7;
    const ch = 8;
    e.push(`<polyline points="${x - bx + 4},${cy - ch} ${x - bx},${cy} ${x - bx + 4},${cy + ch}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
    e.push(`<polyline points="${x - bx + 9},${cy - ch} ${x - bx + 5},${cy} ${x - bx + 9},${cy + ch}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
    e.push(`<polyline points="${x + bx - 4},${cy - ch} ${x + bx},${cy} ${x + bx - 4},${cy + ch}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
    e.push(`<polyline points="${x + bx - 9},${cy - ch} ${x + bx - 5},${cy} ${x + bx - 9},${cy + ch}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
  }

  const side = o.labelSide ?? 'right';
  const lx = side === 'right' ? x + hw + (o.drawout ? 14 : 8) : x - hw - (o.drawout ? 14 : 8);
  const anchor = side === 'right' ? 'start' : 'end';
  let ly = boxTop + 2;
  const labels: { s: string; bold?: boolean; color?: string }[] = [];
  if (o.designation) labels.push({ s: o.designation, bold: true });
  if (o.ratings) labels.push({ s: o.ratings, color: SOFT });
  const pt = [o.poles, o.trip].filter(Boolean).join('  ');
  if (pt) labels.push({ s: pt, color: SOFT });
  if (o.device) labels.push({ s: o.device, color: FAINT });
  for (const l of labels) {
    e.push(txt(lx, ly + 9, l.s, { size: l.bold ? 10.5 : 9, bold: l.bold, color: l.color ?? INK, anchor: anchor as any }));
    ly += 12;
  }

  return { svg: e.join(''), yBottom: boxBot + 8 };
}

/** Format AF/AT ratings string from a device. */
function ratingsStr(d: SldDevice): string {
  const at = d.ratingA;
  const af = d.frameA ?? d.ratingA;
  if (af && at && af !== at) return `${af}AF / ${at}AT`;
  if (at) return `${at}AF / ${at}AT`;
  return '-';
}

export function generateSld(input: SldInput): { svg: string; warnings: string[] } {
  const warnings: string[] = [];
  const mains = input.devices.filter((d) => d.role === 'MAIN');
  const ties = input.devices.filter((d) => d.role === 'TIE');
  const feeders = input.devices.filter((d) => d.role === 'FEEDER');

  if (!mains.length) warnings.push('SLD: no MAIN device - diagram incomplete');

  const segCount = Math.max(1, input.busSegments);

  const perSeg: SldDevice[][] = Array.from({ length: segCount }, () => []);
  for (const f of feeders) perSeg[Math.min(Math.max(0, f.busSegment), segCount - 1)].push(f);
  for (const fs of perSeg) fs.sort((a, b) => (a.sectionIndex - b.sectionIndex) || a.designation.localeCompare(b.designation));

  const totalFeeders = feeders.length;
  const wrap = segCount === 1 && totalFeeders > MAX_PER_ROW;

  const TIE_GAP = ties.length ? 96 : 0;
  const slotW = COL_W;

  type Row = { segments: SldDevice[][]; y: number };
  const rows: Row[] = [];
  if (wrap) {
    const chunks: SldDevice[][] = [];
    for (let i = 0; i < perSeg[0].length; i += MAX_PER_ROW) chunks.push(perSeg[0].slice(i, i + MAX_PER_ROW));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((c, i) => rows.push({ segments: [c], y: BUS_Y + i * ROW_GAP }));
  } else {
    rows.push({ segments: perSeg, y: BUS_Y });
  }

  const rowRunWidth = (segs: SldDevice[][]) => {
    let w = 0;
    segs.forEach((fs, i) => {
      w += Math.max(fs.length, 1) * slotW + 48;
      if (i < segs.length - 1) w += TIE_GAP;
    });
    return w;
  };
  const maxRun = Math.max(...rows.map((r) => rowRunWidth(r.segments)), COL_W);
  const contentW = Math.max(maxRun, TITLE_W + 120);
  const width = MARGIN * 2 + contentW;

  const lastRow = rows[rows.length - 1];
  const height = lastRow.y + FEEDER_DROP + 80 + TITLE_H + 24;

  const el: string[] = [];
  el.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${SHEET}"/>`);
  el.push(`<rect x="${MARGIN / 2}" y="${MARGIN / 2}" width="${width - MARGIN}" height="${height - MARGIN}" fill="none" stroke="${INK}" stroke-width="1.2"/>`);

  const firstRow = rows[0];
  const firstRunW = rowRunWidth(firstRow.segments);
  const runX0 = MARGIN + Math.max(0, (contentW - firstRunW) / 2);

  const seg0Count = Math.max(firstRow.segments[0].length, 1);
  const seg0X0 = runX0 + 48;
  const serviceX = seg0X0 + (seg0Count * slotW) / 2 - slotW / 2;

  el.push(`<circle cx="${serviceX}" cy="${SERVICE_TOP}" r="8" fill="${SHEET}" stroke="${INK}" stroke-width="1.4"/>`);
  el.push(line(serviceX - 6, SERVICE_TOP - 6, serviceX + 6, SERVICE_TOP + 6, 1.2));
  el.push(txt(serviceX + 16, SERVICE_TOP - 4, 'UTILITY SERVICE', { size: 10, bold: true }));
  el.push(txt(serviceX + 16, SERVICE_TOP + 9, serviceLabel(input), { size: 9.5, color: SOFT }));
  const afc = input.availableFaultKA ?? input.sccrKA;
  if (afc != null) {
    const vbase = (input.voltageSystem || '').replace(/-1$/, '').split('/')[0];
    el.push(txt(serviceX + 16, SERVICE_TOP + 22, `AFC: ${afc}kA${vbase ? ` @ ${vbase}V` : ''}`, { size: 9.5, color: SOFT }));
  }

  el.push(line(serviceX, SERVICE_TOP + 8, serviceX, SERVICE_TOP + 28, 1.4));

  const mainForSeg = (segIdx: number): SldDevice | undefined =>
    mains.find((m) => m.busSegment === segIdx) ?? (segCount === 1 ? mains[0] : mains[segIdx]);

  const tbX = width - MARGIN / 2 - TITLE_W;
  const tbY = height - MARGIN / 2 - TITLE_H;

  if (input.serviceEntrance ?? false) {
    const gx = serviceX - 34;
    el.push(line(serviceX, SERVICE_TOP + 18, gx, SERVICE_TOP + 18, 1.2));
    el.push(line(gx, SERVICE_TOP + 18, gx, SERVICE_TOP + 30, 1.2));
    el.push(drawGround(gx, SERVICE_TOP + 30));
    el.push(txt(gx, SERVICE_TOP + 58, 'SE GND', { size: 8.5, color: SOFT, anchor: 'middle' }));
  }

  rows.forEach((row, rowIdx) => {
    const runW = rowRunWidth(row.segments);
    const rx0 = MARGIN + Math.max(0, (contentW - runW) / 2);
    const busY = row.y;

    let cursor = rx0;
    const segRanges: { x1: number; x2: number; feeders: SldDevice[] }[] = [];
    row.segments.forEach((fs, i) => {
      const w = Math.max(fs.length, 1) * slotW + 48;
      segRanges.push({ x1: cursor, x2: cursor + w, feeders: fs });
      cursor += w + (i < row.segments.length - 1 ? TIE_GAP : 0);
    });

    segRanges.forEach((sr) => {
      el.push(line(sr.x1, busY, sr.x2, busY, 4, INK));
    });

    if (rowIdx === 0 && segRanges.length) {
      el.push(txt(segRanges[0].x1, busY - 10, `${input.mainBusRatingA ?? '-'}A CU BUS`, { size: 10, bold: true }));
      el.push(txt(segRanges[0].x1, busY + 22, `SCCR ${input.sccrKA ?? '-'}kA`, { size: 9, color: SOFT }));
      const w = input.wires ?? (/y/i.test(input.voltageSystem) ? 4 : 3);
      if (w >= 4) {
        el.push(txt(segRanges[0].x1, busY + 34, 'NEUTRAL BAR 100%', { size: 8.5, color: SOFT }));
      }
    }

    if (rowIdx === 0) {
      segRanges.forEach((sr, si) => {
        const m = mainForSeg(si);
        const mx = (sr.x1 + sr.x2) / 2;
        if (!m) return;
        const topY = si === 0 ? SERVICE_TOP + 28 : SERVICE_TOP + 8;
        if (si !== 0) {
          el.push(`<circle cx="${mx}" cy="${SERVICE_TOP}" r="7" fill="${SHEET}" stroke="${INK}" stroke-width="1.3"/>`);
          el.push(txt(mx + 12, SERVICE_TOP + 3, 'SOURCE ' + (si + 1), { size: 8.5, color: SOFT }));
          el.push(line(mx, SERVICE_TOP + 7, mx, SERVICE_TOP + 8, 1.4));
        } else if (mx !== serviceX) {
          el.push(line(serviceX, SERVICE_TOP + 28, mx, SERVICE_TOP + 28, 1.4));
        }
        const b = drawBreaker(mx, topY, {
          drawout: isDrawout(m),
          designation: m.designation,
          ratings: ratingsStr(m),
          poles: m.poles ? `${m.poles}P` : undefined,
          trip: m.tripUnit,
          device: m.frameModel,
          labelSide: 'right',
        });
        el.push(b.svg);
        el.push(line(mx, b.yBottom, mx, busY, 1.4));
      });

      ties.forEach((t, ti) => {
        const left = segRanges[Math.min(ti, segRanges.length - 2)];
        const right = segRanges[Math.min(ti + 1, segRanges.length - 1)];
        if (!left || !right || left === right) return;
        const xm = (left.x2 + right.x1) / 2;
        const hw = BREAKER_W / 2;
        el.push(line(left.x2, busY, xm - hw - (isDrawout(t) ? 12 : 4), busY, 4, INK));
        el.push(line(xm + hw + (isDrawout(t) ? 12 : 4), busY, right.x1, busY, 4, INK));
        el.push(`<rect x="${xm - hw}" y="${busY - BREAKER_H / 2}" width="${BREAKER_W}" height="${BREAKER_H}" fill="${SHEET}" stroke="${INK}" stroke-width="1.6"/>`);
        if (isDrawout(t)) {
          const cyy = busY;
          for (const sgn of [-1, 1]) {
            const bx = hw + 7;
            el.push(`<polyline points="${xm + sgn * (bx - 4)},${cyy - 8} ${xm + sgn * bx},${cyy} ${xm + sgn * (bx - 4)},${cyy + 8}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
            el.push(`<polyline points="${xm + sgn * (bx - 9)},${cyy - 8} ${xm + sgn * (bx - 5)},${cyy} ${xm + sgn * (bx - 9)},${cyy + 8}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
          }
        }
        el.push(txt(xm, busY - hw - 16, t.designation, { size: 10.5, bold: true, anchor: 'middle' }));
        el.push(txt(xm, busY - hw - 4, ratingsStr(t), { size: 9, color: SOFT, anchor: 'middle' }));
        const noLabel = (t.normallyOpen ?? true) ? 'N.O.' : 'N.C.';
        el.push(txt(xm, busY + hw + 14, `TIE ${noLabel}`, { size: 9, color: SOFT, anchor: 'middle' }));
      });
    } else {
      const prev = rows[rowIdx - 1];
      const prevRunW = rowRunWidth(prev.segments);
      const prx0 = MARGIN + Math.max(0, (contentW - prevRunW) / 2);
      el.push(line(prx0 + 24, prev.y, prx0 + 24, busY, 1.6));
      el.push(line(prx0 + 24, busY, rx0, busY, 1.6));
      el.push(txt(rx0, busY - 8, `BUS (cont.) ${input.mainBusRatingA ?? '-'}A`, { size: 9, color: SOFT }));
    }

    segRanges.forEach((sr) => {
      sr.feeders.forEach((f, i) => {
        const fx = sr.x1 + 48 + i * slotW;
        const b = drawBreaker(fx, busY, {
          drawout: isDrawout(f),
          designation: f.designation,
          ratings: ratingsStr(f),
          poles: f.poles ? `${f.poles}P` : undefined,
          trip: f.tripUnit,
          device: f.frameModel,
          labelSide: 'right',
        });
        el.push(b.svg);
        const arrowY = busY + FEEDER_DROP;
        el.push(line(fx, b.yBottom, fx, arrowY, 1.4));
        el.push(`<path d="M ${fx - 5} ${arrowY - 9} L ${fx + 5} ${arrowY - 9} L ${fx} ${arrowY} Z" fill="${INK}"/>`);
        const load = (f.loadDescription || '').trim();
        if (load) el.push(txt(fx, arrowY + 14, load.length > 18 ? load.slice(0, 17) + '...' : load, { size: 9, anchor: 'middle' }));
        el.push(txt(fx, arrowY + (load ? 26 : 14), `SEC ${f.sectionIndex}`, { size: 8.5, color: FAINT, anchor: 'middle' }));
      });
    });

    if (rowIdx === 0) {
      const sepTop = SERVICE_TOP - 18;
      const sepBot = busY + FEEDER_DROP + 36;
      const allCols: { sec: number; x: number }[] = [];
      segRanges.forEach((sr) => {
        sr.feeders.forEach((f, i) => allCols.push({ sec: f.sectionIndex, x: sr.x1 + 48 + i * slotW }));
      });
      let gi = 0;
      while (gi < allCols.length) {
        const sec = allCols[gi].sec;
        let gj = gi;
        while (gj < allCols.length && allCols[gj].sec === sec) gj++;
        const xL = allCols[gi].x - slotW / 2;
        const xR = allCols[gj - 1].x + slotW / 2;
        if (gj < allCols.length) el.push(line(xR, sepTop, xR, sepBot, 0.9, FAINT, '4 4'));
        el.push(txt((xL + xR) / 2, sepTop + 2, `SECTION ${sec}`, { size: 8.5, color: FAINT, anchor: 'middle' }));
        gi = gj;
      }
    }
  });

  const boardNm = input.boardName ?? input.title;
  const projNm = input.projectName ?? input.title;
  const dwgNo = input.drawingNo ?? `SLD-${boardNm}`;
  const rev = input.revision ?? '-';
  const date = input.dateStr ?? new Date().toISOString().slice(0, 10);

  el.push(`<rect x="${tbX}" y="${tbY}" width="${TITLE_W}" height="${TITLE_H}" fill="${SHEET}" stroke="${INK}" stroke-width="1.4"/>`);
  const tbMidX = tbX + TITLE_W * 0.62;
  el.push(line(tbX, tbY + 28, tbX + TITLE_W, tbY + 28, 1));
  el.push(line(tbX, tbY + 52, tbX + TITLE_W, tbY + 52, 1));
  el.push(line(tbX, tbY + 76, tbX + TITLE_W, tbY + 76, 1));
  el.push(line(tbX, tbY + 100, tbX + TITLE_W, tbY + 100, 1));
  el.push(line(tbMidX, tbY + 76, tbMidX, tbY + TITLE_H, 1));

  el.push(txt(tbX + 8, tbY + 18, projNm.length > 38 ? projNm.slice(0, 37) + '...' : projNm, { size: 11, bold: true }));
  el.push(txt(tbX + 8, tbY + 44, `BOARD: ${boardNm}`, { size: 9.5 }));
  el.push(txt(tbX + 8, tbY + 68, `ONE-LINE DIAGRAM - ${esc(input.voltageSystem)}`, { size: 9, color: SOFT }));
  el.push(txt(tbX + 8, tbY + 92, `DWG: ${dwgNo}`, { size: 9 }));
  el.push(txt(tbMidX + 8, tbY + 92, `REV: ${rev}`, { size: 9 }));
  el.push(txt(tbX + 8, tbY + 116, `DATE: ${date}`, { size: 8.5, color: SOFT }));
  el.push(txt(tbX + 8, tbY + 127, 'GENERATED BY SWGPLAY', { size: 7.5, color: FAINT }));
  el.push(txt(tbMidX + 8, tbY + 116, 'SCALE: NTS', { size: 8.5, color: SOFT }));
  el.push(txt(tbMidX + 8, tbY + 127, `${input.configCode}`, { size: 7.5, color: FAINT }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" width="${Math.round(width)}" height="${Math.round(height)}">${el.join('')}</svg>`;
  return { svg, warnings };
}
