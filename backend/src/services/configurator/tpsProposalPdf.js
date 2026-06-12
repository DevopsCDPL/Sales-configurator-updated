'use strict';

/**
 * tpsProposalPdf.js — CLIENT-FACING proposal, faithful to
 * "TPS Proposal Template_4 Items, 2 block_V4".
 *
 * Items = switchboards of the configuration that have an ISSUED
 * quotation (latest revision), max 4. Sell prices ONLY — no costs,
 * labour rates or margins ever appear here (the other PDF is the
 * internal cost sheet). Sections: Summary · System Overview ·
 * Schedule+Notes · BOM parameter blocks (2 items per block) ·
 * Elevation placeholder · Terms & Conditions.
 */

const PDFDocument = require('pdfkit');
const models = require('../../models');
const v2Quote = require('./v2QuoteService');
const {
  COLORS, TABLE, FOOTER_H, drawGlobalHeader, drawGlobalFooter,
  drawTableHeader, drawDataRow, drawSectionTitle, SIDE_MARGIN,
} = require('../../utils/pdfTemplate');
const { drawElevation } = require('./elevationPdf');

const usd = (n) => `$ ${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
};

function voltageLabel(code) {
  const m = String(code || '').match(/^(\d+)/);
  return m ? `${m[1]} VAC` : String(code || '—');
}
function phaseWire(code) {
  const c = String(code || '');
  if (/-1$/.test(c)) return '1 Phase, 3 Wire';
  return /Y|HL/.test(c) ? '3 Phase, 4 Wire' : '3 Phase, 3 Wire';
}

/** Collect everything the proposal needs for one board. */
async function buildItem(board) {
  const quotes = await v2Quote.listBoardQuotes(board.id);
  const quote = quotes[0] ?? null; // latest revision
  if (!quote) return null;

  const sections = await models.ConfiguratorSystemSection.findAll({
    where: { switchboard_id: board.id }, order: [['section_number', 'ASC']],
  });
  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { switchboard_id: board.id }, order: [['created_at', 'ASC']],
  });

  const bd = board.board_data || {};
  const frames = sections.map((s) => s.layout?.frame).filter(Boolean);
  const heightIn = Math.max(90, ...frames.map((f) => Number(f.height_in) || 0));
  const widthIn = frames.reduce((a, f) => a + (Number(f.width_in) || 0), 0);
  const depthIn = Math.max(0, ...frames.map((f) => Number(f.depth_in) || 0));

  const mu = quote.pricing_spec?.multiUnit;
  const unitPrice = mu ? mu.perUnitPrice : Number(quote.grand_total) || 0;
  const qty = mu ? mu.units : 1;

  const deviceLines = lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER');
  const sectionBlocks = sections.map((s) => {
    const devs = deviceLines.filter((d) => d.section_id === s.id);
    const maxA = Math.max(0, ...devs.map((d) => Number(d.meta?.ratedA) || 0));
    const role = (s.setup?.role ?? 'FEEDER').toUpperCase();
    return {
      sectionIndex: s.section_number,
      description: `${maxA || Number(bd.mainBusRating) || ''}A ${role}`,
      devices: devs.map((d) => ({
        description: d.name || d.part_number || 'Circuit breaker',
        ratedA: d.meta?.ratedA ?? '—',
        poles: d.meta?.poles ?? 3,
        kA: d.meta?.interruptingKA ?? '—',
        mounting: d.meta?.mounting ?? 'Fixed',
        designation: d.meta?.designation ?? '',
        qty: Number(d.quantity) || 1,
      })),
    };
  });

  return {
    board, quote, unitPrice, qty,
    _sections: sections,
    _deviceLines: deviceLines,
    name: board.name,
    productLine: board.board_type === 'SWITCHBOARD_UL891' ? 'UL 891 Switchboard' : (board.board_type || 'Switchboard'),
    dims: widthIn ? `${heightIn}" x ${widthIn}" x ${depthIn}"` : '—',
    voltage: voltageLabel(bd.voltageSystemCode),
    phaseWire: phaseWire(bd.voltageSystemCode),
    busA: bd.mainBusRating ? `${bd.mainBusRating} A` : '—',
    sccr: bd.shortCircuitRating ? `${bd.shortCircuitRating} kAIC` : '—',
    nema: bd.nemaType || 'NEMA 1',
    cert: 'UL 891',
    finish: 'ANSI 61 - Powder Coated',
    access: bd.accessType || 'Front Access',
    cableEntry: bd.cableEntry || 'Top',
    cableExit: bd.cableExit || 'Bottom',
    busMaterial: bd.busMaterial === 'Aluminium' ? 'AL - Silver Plated' : 'CU - Silver Plated',
    neutral: `${String(bd.neutralRating ?? '100').replace('%', '')}%`,
    groundBus: '1/4" x 2"',
    serviceEntrance: board.service_entrance ? 'Yes' : 'No',
    sectionBlocks,
  };
}

const NOTES = [
  'Commodity Price Escalation Clause: In the event of an increase in the costs of copper and sheet metal exceeding 8% from one year to the next, an additional charge will be applied. This additional charge, or "adder", will be calculated based on the percentage increase above the 8% threshold.',
  'Freight Not Included.',
  'Every day not approved by client delays ship date by a minimum of one day.',
  'Send purchase orders to email: TPS-SalesPM@TierPowerSystems.com',
];

const TERMS = require('./tpsProposalTerms');

async function buildProposalPdf(configurationId, { companyId = null, user = null } = {}) {
  const configuration = await models.ConfiguratorConfiguration.findByPk(configurationId);
  if (!configuration) { const e = new Error('configuration not found'); e.status = 404; throw e; }
  const project = configuration.project_id ? await models.Project.findByPk(configuration.project_id).catch(() => null) : null;
  let client = null;
  if (project?.client_id && models.Client) client = await models.Client.findByPk(project.client_id).catch(() => null);

  const boards = await models.ConfiguratorSwitchboard.findAll({
    where: { configuration_id: configurationId }, order: [['board_index', 'ASC']],
  });
  const items = [];
  for (const b of boards) {
    const it = await buildItem(b);
    if (it) items.push(it);
    if (items.length >= 4) break;
  }
  if (!items.length) { const e = new Error('no issued quotations on any switchboard of this configuration — issue a quote first'); e.status = 422; throw e; }

  let companySettings = {};
  try {
    const settingsService = require('../settingsService');
    if (companyId) companySettings = await settingsService.getCompanySettings(companyId);
  } catch { /* unbranded */ }

  const proposalNo = `TPS Proposal ${project?.project_number || configuration.code || configuration.id.slice(0, 6)}`;
  const today = new Date();
  const validThru = new Date(today.getTime() + 15 * 24 * 3600 * 1000);
  const sched = items[0].quote.pricing_spec?.quote?.schedule || {};

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({
      buffer: Buffer.concat(chunks),
      filename: `${proposalNo.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`,
    }));
    doc.on('error', reject);

    const margin = SIDE_MARGIN || 30;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const cW = pageW - 2 * margin;
    const newPage = () => { drawGlobalFooter(doc, companySettings); doc.addPage(); return drawGlobalHeader(doc, companySettings, 'PROPOSAL') + 6; };
    const ensure = (y, need) => (y + need + FOOTER_H > pageH - margin ? newPage() : y);

    try {
      let y = drawGlobalHeader(doc, companySettings, 'PROPOSAL');
      y += 8;

      /* ── To / Prepared By ── */
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
      doc.text('To', margin, y); doc.text('Prepared By', margin + cW / 2, y);
      y += 14;
      doc.fontSize(8.5).font('Helvetica');
      const toLines = [
        client?.name || project?.client_name || '(Client)',
        `POC: ${client?.contact_person || '-'}`,
        `Email: ${client?.email || '-'}`,
        `Phone: ${client?.phone || '-'}`,
      ];
      const byLines = [
        companySettings.companyName || 'Tier Power Systems LLC',
        `POC: ${user?.name || user?.email || '-'} | Sales Engineer`,
        `Email: ${user?.email || '-'}`,
        `Phone: ${companySettings.phone || '-'}`,
      ];
      toLines.forEach((t, i) => doc.text(t, margin, y + i * 11, { width: cW / 2 - 10 }));
      byLines.forEach((t, i) => doc.text(t, margin + cW / 2, y + i * 11, { width: cW / 2 }));
      y += 4 * 11 + 8;
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text(`Proposal No : ${proposalNo}`, margin, y);
      doc.text(`Proposal Date: ${fmtDate(today)}`, margin + cW / 2, y);
      y += 12;
      doc.text(`Project : ${project?.project_name || configuration.name || '-'}`, margin, y);
      doc.text(`Valid Thru : ${fmtDate(validThru)}`, margin + cW / 2, y);
      y += 20;

      /* ── 1. Summary ── */
      drawSectionTitle(doc, margin, y, 1, 'Summary:');
      y += 16;
      const sumCols = [30, cW - 30 - 90 - 70 - 95, 90, 70, 95];
      const sumAligns = ['center', 'left', 'right', 'center', 'right'];
      y += drawTableHeader(doc, margin, y, cW, sumCols, ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'], sumAligns);
      let grand = 0;
      items.forEach((it, i) => {
        const total = it.unitPrice * it.qty;
        grand += total;
        y += drawDataRow(doc, margin, y, cW, sumCols, [
          String(i + 1), `${it.name} — ${it.productLine}`, usd(it.unitPrice), String(it.qty), usd(total),
        ], TABLE.ROW_H, i % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE, sumAligns);
      });
      y += drawDataRow(doc, margin, y, cW, sumCols, [
        '', { text: 'Grand Total', bold: true }, '', '', { text: usd(grand), bold: true },
      ], TABLE.ROW_H, COLORS.GT_BG, sumAligns);
      y += 16;

      /* ── 2. System Overview ── */
      y = ensure(y, 220);
      drawSectionTitle(doc, margin, y, 2, 'System Overview:');
      y += 16;
      const labelW = 120;
      const itemW = (cW - 30 - labelW) / items.length;
      const ovCols = [30, labelW, ...items.map(() => itemW)];
      const ovAligns = ['center', 'left', ...items.map(() => 'left')];
      y += drawTableHeader(doc, margin, y, cW, ovCols, ['#', 'Description', ...items.map((it, i) => `Item - ${i + 1}`)], ovAligns);
      const ovRows = [
        ['Product Name', (it) => `${it.name}`],
        ['Est. Dimensions (H x W x D)', (it) => it.dims],
        ['Voltage Rating', (it) => it.voltage],
        ['Current Rating', (it) => it.busA],
        ['Phase / Wire', (it) => it.phaseWire],
        ['Short Circuit Rating', (it) => it.sccr],
        ['Enclosure Type', (it) => it.nema],
        ['Certification', (it) => it.cert],
        ['Finish', (it) => it.finish],
        ['Accessibility', (it) => it.access],
        ['Cable Entry', (it) => it.cableEntry],
        ['Cable Exit', (it) => it.cableExit],
      ];
      ovRows.forEach(([label, fn], i) => {
        y = ensure(y, TABLE.ROW_H);
        y += drawDataRow(doc, margin, y, cW, ovCols,
          [String(i + 1), label, ...items.map((it) => String(fn(it)))],
          TABLE.ROW_H, i % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE, ovAligns);
      });
      y += 16;

      /* ── 3. Project Schedule & Commercial Notes ── */
      y = ensure(y, 200);
      drawSectionTitle(doc, margin, y, 3, 'Project Schedule & Commercial Notes:');
      y += 16;
      const scCols = [40, cW - 40 - 140, 140];
      const scAligns = ['center', 'left', 'right'];
      y += drawTableHeader(doc, margin, y, cW, scCols, ['S.No.', 'Description', 'Date'], scAligns);
      const schedRows = [
        ['PO release date', sched.order_date],
        ['Long lead submittal issued to client', sched.long_lead_sub_date],
        ['Client approved long lead submittal', sched.long_lead_approve_date],
        ['Approval drawings issued to client', sched.eng_sub_date],
        ['Client returning approval drawings', sched.release_date],
        ['Shipment date', sched.rts_date],
      ];
      schedRows.forEach(([label, d], i) => {
        y += drawDataRow(doc, margin, y, cW, scCols, [String(i + 1), label, fmtDate(d) || 'TBD'],
          TABLE.ROW_H, i % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE, scAligns);
      });
      y += 10;
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK).text('Notes:', margin, y);
      y += 12;
      doc.font('Helvetica').fontSize(8);
      for (const note of NOTES) {
        const h = doc.heightOfString(`• ${note}`, { width: cW - 10 });
        y = ensure(y, h + 4);
        doc.text(`• ${note}`, margin + 6, y, { width: cW - 10 });
        y += h + 4;
      }

      /* ── 4+. Bill of Materials — item pairs ── */
      let sectionNo = 4;
      for (let p = 0; p < items.length; p += 2) {
        const pair = items.slice(p, p + 2);
        y = newPage();
        drawSectionTitle(doc, margin, y, sectionNo++, `Bill of Materials: Item ${p + 1}${pair[1] ? ` & ${p + 2}` : ''}`);
        y += 16;
        const pLabelW = 150;
        const pItemW = (cW - 90 - pLabelW) / pair.length;
        const pCols = [90, pLabelW, ...pair.map(() => pItemW)];
        const pAligns = ['left', 'left', ...pair.map(() => 'left')];
        y += drawTableHeader(doc, margin, y, cW, pCols, ['Section', 'Parameter', ...pair.map((_, i) => `Item - ${p + i + 1}`)], pAligns);

        const paramRows = [
          ['System', 'Description', (it) => `${it.name} — ${it.productLine}`],
          ['', 'Source', () => 'Pulled from quotation'],
          ['Electrical', 'Voltage', (it) => it.voltage],
          ['', 'Connection', (it) => it.phaseWire.replace(' Phase, ', 'P').replace(' Wire', 'W')],
          ['', 'Bus Ampacity', (it) => it.busA],
          ['', 'Short Circuit Rating (kA)', (it) => it.sccr],
          ['Bus Config', 'Bus Material', (it) => it.busMaterial],
          ['', 'Neutral Bus', (it) => it.neutral],
          ['', 'Ground Bus', (it) => it.groundBus],
          ['Enclosure', 'Enclosure Type', (it) => it.nema],
          ['', 'Certification', (it) => it.cert],
          ['', 'Service Entrance', (it) => it.serviceEntrance],
          ['', 'Finish / Color', (it) => it.finish],
          ['Access', 'Accessibility', (it) => it.access],
          ['Cable Mgmt', 'Cable Entry In', (it) => it.cableEntry],
          ['', 'Cable Exit Out', (it) => it.cableExit],
        ];
        let rowIdx = 0;
        const writeRow = (group, label, values, bold = false) => {
          const cellH = Math.max(TABLE.ROW_H, ...values.map((v) =>
            doc.heightOfString(String(v), { width: pItemW - 8 }) + 10));
          y = ensure(y, cellH);
          y += drawDataRow(doc, margin, y, cW, pCols,
            [group, bold ? { text: label, bold: true } : label, ...values.map(String)],
            cellH, rowIdx % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE, pAligns);
          rowIdx += 1;
        };
        for (const [group, label, fn] of paramRows) {
          writeRow(group, label, pair.map((it) => fn(it)));
        }

        // Per-section breaker blocks — rows align across the pair
        const maxSections = Math.max(...pair.map((it) => it.sectionBlocks.length));
        for (let si = 0; si < maxSections; si++) {
          const blocks = pair.map((it) => it.sectionBlocks[si] ?? null);
          writeRow(`Section ${si + 1}`, 'Section Description', blocks.map((b) => b?.description ?? '—'), true);
          const maxDev = Math.max(...blocks.map((b) => b?.devices.length ?? 0));
          for (let di = 0; di < maxDev; di++) {
            const devs = blocks.map((b) => b?.devices[di] ?? null);
            writeRow('', `Breaker ${di + 1} (${devs.find(Boolean)?.designation ?? ''})`,
              devs.map((d) => d ? `${d.description}` : '—'));
            writeRow('', '  Rating / Poles / kAIC',
              devs.map((d) => d ? `${d.ratedA} A / ${d.poles}P / ${d.kA} kA` : '—'));
            writeRow('', '  Mounting / Qty',
              devs.map((d) => d ? `${d.mounting} / ${String(d.qty).padStart(2, '0')}` : '—'));
          }
        }
      }

      /* ── §6 Elevation drawings (parametric pdfkit twin) ── */
      y = newPage();
      drawSectionTitle(doc, margin, y, sectionNo++, 'Elevation drawings (estimate only)');
      y += 14;
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(COLORS.TEXT_MED)
        .text('Parametric estimate — subject to revision with engineering submittal.', margin, y, { width: cW });
      y += 14;

      // One elevation per board, stacked vertically
      for (const it of items) {
        // Need at least 180 pts for a useful elevation; move to new page if tight
        y = ensure(y, 180);
        const elvMaxH = Math.min(260, pageH - margin - FOOTER_H - y);
        const region  = { x: margin, y, maxWidth: cW, maxHeight: elvMaxH };
        const consumed = drawElevation(doc, region, it);
        y += consumed + 18;
      }

      /* ── Terms and Conditions ── */
      y = newPage();
      drawSectionTitle(doc, margin, y, sectionNo++, 'Terms And Conditions of Sale:');
      y += 18;
      for (const [title, body] of TERMS) {
        doc.fontSize(8).font('Helvetica-BoldOblique').fillColor(COLORS.TEXT_DARK);
        let h = doc.heightOfString(title, { width: cW });
        y = ensure(y, h + 30);
        doc.text(title, margin, y, { width: cW });
        y += h + 2;
        doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.TEXT_DARK);
        h = doc.heightOfString(body, { width: cW });
        if (y + h + FOOTER_H > pageH - margin) {
          // flow long bodies across pages
          const words = body.split(' ');
          let chunk = '';
          for (const w of words) {
            const t = chunk ? chunk + ' ' + w : w;
            if (doc.heightOfString(t, { width: cW }) > (pageH - margin - FOOTER_H - y)) {
              doc.text(chunk, margin, y, { width: cW });
              y = newPage();
              doc.font('Helvetica').fontSize(6.8);
              chunk = w;
            } else chunk = t;
          }
          doc.text(chunk, margin, y, { width: cW });
          y += doc.heightOfString(chunk, { width: cW }) + 6;
        } else {
          doc.text(body, margin, y, { width: cW });
          y += h + 6;
        }
      }

      drawGlobalFooter(doc, companySettings);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildProposalPdf };
