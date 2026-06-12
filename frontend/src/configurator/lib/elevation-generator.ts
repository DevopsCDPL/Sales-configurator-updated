/**
 * elevation-generator.ts — parametric FRONT ELEVATION (estimate only).
 *
 * Drawn purely from the saved design: section frames side by side with
 * bus zone, device zone (breaker fronts stacked top-down) and cable
 * zone. No CAD required — this is the proposal §6 "estimate only" view.
 * Hardcoded dark-theme colors (black/grey/sky-blue standard).
 */

export interface ElevationSection {
  sectionIndex: number;
  widthIn: number;
  heightIn: number;
  topBusZoneIn: number;
  bottomCableZoneIn: number;
  devices: { designation: string; ratedA: number | null; heightIn: number }[];
}

export interface ElevationInput {
  title: string;
  sections: ElevationSection[];
}

const COL = {
  bg: '#0F1722', frame: '#5B6B85', frameFill: '#141D2B',
  bus: 'rgba(0,200,255,0.12)', busLine: '#00c8ff',
  cable: 'rgba(148,163,184,0.08)',
  device: '#00c8ff', deviceFill: 'rgba(0,200,255,0.18)',
  text: '#E2E8F0', sub: '#94A3B8', dim: '#64748B',
};

export function generateElevation(input: ElevationInput): { svg: string; widthIn: number; heightIn: number } {
  const S = 4.2; // px per inch
  const pad = 46;
  const secs = input.sections;
  if (!secs.length) return { svg: '', widthIn: 0, heightIn: 0 };

  const totalWIn = secs.reduce((a, s) => a + s.widthIn, 0);
  const maxHIn = Math.max(...secs.map((s) => s.heightIn));
  const W = totalWIn * S + pad * 2;
  const H = maxHIn * S + pad * 2 + 26;

  const el: string[] = [];
  el.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">`);
  el.push(`<rect width="${W}" height="${H}" fill="${COL.bg}" rx="8"/>`);
  el.push(`<text x="${pad}" y="24" fill="${COL.text}" font-size="13" font-weight="700">${esc(input.title)} — Front Elevation (estimate only)</text>`);

  let x = pad;
  const yTop = pad + 10;
  for (const s of secs) {
    const w = s.widthIn * S;
    const h = s.heightIn * S;
    const y = yTop + (maxHIn - s.heightIn) * S;

    // enclosure
    el.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COL.frameFill}" stroke="${COL.frame}" stroke-width="1.5"/>`);
    // bus zone
    const busH = s.topBusZoneIn * S;
    el.push(`<rect x="${x}" y="${y}" width="${w}" height="${busH}" fill="${COL.bus}"/>`);
    el.push(`<line x1="${x}" y1="${y + busH}" x2="${x + w}" y2="${y + busH}" stroke="${COL.busLine}" stroke-width="0.75" stroke-dasharray="4 3"/>`);
    el.push(`<text x="${x + w / 2}" y="${y + busH / 2 + 3}" fill="${COL.busLine}" font-size="8.5" text-anchor="middle">BUS</text>`);
    // cable zone
    const cabH = s.bottomCableZoneIn * S;
    el.push(`<rect x="${x}" y="${y + h - cabH}" width="${w}" height="${cabH}" fill="${COL.cable}"/>`);
    el.push(`<text x="${x + w / 2}" y="${y + h - cabH / 2 + 3}" fill="${COL.dim}" font-size="8.5" text-anchor="middle">CABLE</text>`);
    // devices stacked from below bus zone
    let dy = y + busH + 6;
    for (const d of s.devices) {
      const dh = Math.max(d.heightIn * S, 18);
      const dw = w - 18;
      if (dy + dh > y + h - cabH - 4) break; // overflow safety (estimate view)
      el.push(`<rect x="${x + 9}" y="${dy}" width="${dw}" height="${dh}" rx="3" fill="${COL.deviceFill}" stroke="${COL.device}" stroke-width="1.2"/>`);
      el.push(`<text x="${x + w / 2}" y="${dy + dh / 2 - 2}" fill="${COL.text}" font-size="9.5" font-weight="700" text-anchor="middle">${esc(d.designation)}</text>`);
      if (d.ratedA) el.push(`<text x="${x + w / 2}" y="${dy + dh / 2 + 10}" fill="${COL.sub}" font-size="8.5" text-anchor="middle">${d.ratedA} A</text>`);
      dy += dh + 6;
    }
    // section label + width dim
    el.push(`<text x="${x + w / 2}" y="${y - 6}" fill="${COL.sub}" font-size="9.5" text-anchor="middle">SECTION ${s.sectionIndex}</text>`);
    el.push(`<text x="${x + w / 2}" y="${yTop + maxHIn * S + 16}" fill="${COL.dim}" font-size="9" text-anchor="middle">${s.widthIn}"</text>`);
    x += w;
  }
  // overall dims
  el.push(`<line x1="${pad}" y1="${yTop + maxHIn * S + 22}" x2="${pad + totalWIn * S}" y2="${yTop + maxHIn * S + 22}" stroke="${COL.dim}" stroke-width="0.75"/>`);
  el.push(`<text x="${pad + (totalWIn * S) / 2}" y="${yTop + maxHIn * S + 34}" fill="${COL.sub}" font-size="9.5" text-anchor="middle">OVERALL ${totalWIn}" W × ${maxHIn}" H</text>`);
  el.push('</svg>');

  return { svg: el.join(''), widthIn: totalWIn, heightIn: maxHIn };
}

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
