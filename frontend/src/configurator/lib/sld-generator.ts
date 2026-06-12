/**
 * sld-generator.ts — Phase C spec §6 (generated read-only one-line diagram)
 *
 * Pure SVG renderer from configuration topology. Regenerated as the
 * final Event Engine pipeline step — never stale, never hand-edited.
 * Simplified ANSI one-line symbols; dark-theme friendly via CSS vars
 * with print-safe fallbacks.
 */

import type { SectionRole } from './safety-rules';

export interface SldDevice {
  designation: string;       // M1, T1, F1…
  role: SectionRole;
  ratingA: number | null;
  frameModel?: string;
  tripUnit?: string;
  sectionIndex: number;
  busSegment: number;        // 0-based; ties split segments
}

export interface SldInput {
  title: string;             // project / board name
  configCode: string;        // CFG-0001 Rev B
  voltageSystem: string;
  mainBusRatingA: number | null;
  sccrKA: number | null;
  devices: SldDevice[];
  busSegments: number;       // 1 for single bus; 2 for main-tie-main
}

const FG = '#E2E8F0';
const MUTED = '#64748B';
const ACCENT = '#00c8ff';
const BG = 'transparent';

const COL_W = 110;
const BUS_Y = 150;
const MAIN_Y = 40;
const FEEDER_LEN = 95;
const PAD_X = 60;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** ANSI-style LV breaker: line with open square. */
function breakerGlyph(x: number, y: number, down: boolean): string {
  const dir = down ? 1 : -1;
  const s = 12;
  return [
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + dir * 18}" stroke="${FG}" stroke-width="1.6"/>`,
    `<rect x="${x - s / 2}" y="${y + dir * 18 - (down ? 0 : s)}" width="${s}" height="${s}" fill="none" stroke="${FG}" stroke-width="1.6"/>`,
    `<line x1="${x}" y1="${y + dir * (18 + s)}" x2="${x}" y2="${y + dir * (18 + s + 18)}" stroke="${FG}" stroke-width="1.6"/>`,
  ].join('');
}

export function generateSld(input: SldInput): { svg: string; warnings: string[] } {
  const warnings: string[] = [];
  const mains = input.devices.filter((d) => d.role === 'MAIN');
  const ties = input.devices.filter((d) => d.role === 'TIE');
  const feeders = input.devices.filter((d) => d.role === 'FEEDER');

  if (!mains.length) warnings.push('SLD: no MAIN device — diagram incomplete');

  const segCount = Math.max(1, input.busSegments);
  const perSeg: SldDevice[][] = Array.from({ length: segCount }, () => []);
  for (const f of feeders) perSeg[Math.min(f.busSegment, segCount - 1)].push(f);

  const segWidths = perSeg.map((fs) => Math.max(fs.length, 1) * COL_W + 40);
  const tieGap = ties.length ? 80 : 0;
  const width = PAD_X * 2 + segWidths.reduce((a, b) => a + b, 0) + tieGap * (segCount - 1);
  const height = BUS_Y + FEEDER_LEN + 130;

  const el: string[] = [];
  el.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${BG}"/>`);

  // Title block
  el.push(`<text x="${PAD_X}" y="22" fill="${FG}" font-size="15" font-weight="700" font-family="Arial">${esc(input.title)}</text>`);
  el.push(`<text x="${PAD_X}" y="40" fill="${MUTED}" font-size="11" font-family="Arial">${esc(input.configCode)}  •  ${esc(input.voltageSystem)}  •  Bus ${input.mainBusRatingA ?? '—'} A  •  SCCR ${input.sccrKA ?? '—'} kA  •  ONE-LINE (AUTO-GENERATED)</text>`);

  // Bus segments
  let segX = PAD_X;
  const segRanges: { x1: number; x2: number }[] = [];
  for (let s = 0; s < segCount; s++) {
    const x1 = segX;
    const x2 = segX + segWidths[s];
    segRanges.push({ x1, x2 });
    el.push(`<line x1="${x1}" y1="${BUS_Y}" x2="${x2}" y2="${BUS_Y}" stroke="${ACCENT}" stroke-width="4"/>`);
    segX = x2 + tieGap;
  }

  // Mains (one per segment when counts align, else spread on segment 0)
  mains.forEach((m, i) => {
    const seg = segRanges[Math.min(i, segRanges.length - 1)];
    const x = (seg.x1 + seg.x2) / 2;
    el.push(`<line x1="${x}" y1="${MAIN_Y + 18}" x2="${x}" y2="${MAIN_Y + 18}" stroke="${FG}"/>`);
    el.push(`<circle cx="${x}" cy="${MAIN_Y + 8}" r="7" fill="none" stroke="${MUTED}" stroke-width="1.4"/>`);
    el.push(`<text x="${x + 14}" y="${MAIN_Y + 12}" fill="${MUTED}" font-size="10" font-family="Arial">SOURCE</text>`);
    el.push(`<line x1="${x}" y1="${MAIN_Y + 15}" x2="${x}" y2="${MAIN_Y + 30}" stroke="${FG}" stroke-width="1.6"/>`);
    el.push(breakerGlyph(x, MAIN_Y + 30, true));
    el.push(`<line x1="${x}" y1="${MAIN_Y + 78}" x2="${x}" y2="${BUS_Y}" stroke="${FG}" stroke-width="1.6"/>`);
    el.push(`<text x="${x + 12}" y="${MAIN_Y + 56}" fill="${FG}" font-size="11" font-weight="700" font-family="Arial">${esc(m.designation)}</text>`);
    el.push(`<text x="${x + 12}" y="${MAIN_Y + 70}" fill="${MUTED}" font-size="10" font-family="Arial">${m.ratingA ?? '—'} A ${esc(m.frameModel ?? '')}</text>`);
  });

  // Ties between segments
  ties.forEach((t, i) => {
    const left = segRanges[Math.min(i, segRanges.length - 2)];
    const right = segRanges[Math.min(i + 1, segRanges.length - 1)];
    const xm = (left.x2 + right.x1) / 2;
    el.push(`<line x1="${left.x2}" y1="${BUS_Y}" x2="${xm - 15}" y2="${BUS_Y}" stroke="${FG}" stroke-width="1.6"/>`);
    el.push(`<rect x="${xm - 7}" y="${BUS_Y - 6}" width="14" height="12" fill="none" stroke="${FG}" stroke-width="1.6"/>`);
    el.push(`<line x1="${xm + 15}" y1="${BUS_Y}" x2="${right.x1}" y2="${BUS_Y}" stroke="${FG}" stroke-width="1.6"/>`);
    el.push(`<text x="${xm}" y="${BUS_Y - 14}" fill="${FG}" font-size="11" font-weight="700" text-anchor="middle" font-family="Arial">${esc(t.designation)}</text>`);
    el.push(`<text x="${xm}" y="${BUS_Y + 26}" fill="${MUTED}" font-size="10" text-anchor="middle" font-family="Arial">${t.ratingA ?? '—'} A N.O.</text>`);
  });

  // Feeders below
  perSeg.forEach((fs, s) => {
    const { x1 } = segRanges[s];
    fs.forEach((f, i) => {
      const x = x1 + 40 + i * COL_W;
      el.push(`<line x1="${x}" y1="${BUS_Y}" x2="${x}" y2="${BUS_Y + 14}" stroke="${FG}" stroke-width="1.6"/>`);
      el.push(breakerGlyph(x, BUS_Y + 14, true));
      el.push(`<line x1="${x}" y1="${BUS_Y + 62}" x2="${x}" y2="${BUS_Y + FEEDER_LEN}" stroke="${FG}" stroke-width="1.6"/>`);
      // load arrow
      el.push(`<path d="M ${x - 5} ${BUS_Y + FEEDER_LEN} L ${x + 5} ${BUS_Y + FEEDER_LEN} L ${x} ${BUS_Y + FEEDER_LEN + 9} Z" fill="${FG}"/>`);
      el.push(`<text x="${x}" y="${BUS_Y + FEEDER_LEN + 26}" fill="${FG}" font-size="11" font-weight="700" text-anchor="middle" font-family="Arial">${esc(f.designation)}</text>`);
      el.push(`<text x="${x}" y="${BUS_Y + FEEDER_LEN + 40}" fill="${MUTED}" font-size="10" text-anchor="middle" font-family="Arial">${f.ratingA ?? '—'} A</text>`);
      el.push(`<text x="${x}" y="${BUS_Y + FEEDER_LEN + 53}" fill="${MUTED}" font-size="9" text-anchor="middle" font-family="Arial">SEC ${f.sectionIndex}</text>`);
    });
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${el.join('')}</svg>`;
  return { svg, warnings };
}
