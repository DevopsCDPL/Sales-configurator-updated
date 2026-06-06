'use strict';

/**
 * pdfQuotationService.js — server-side PDF generation for configurator quotations.
 *
 * Generates a multi-page A4 PDF using pdfkit + the shared Forge
 * pdfTemplate (header / footer / table helpers) so the look-and-feel
 * matches existing project quotations.
 *
 * Pipeline:
 *   compiled  →  buffer (in-memory)  →  R2 upload  →  Document row
 *
 * The compiled-quotation argument is the object returned by
 * `quotationCompiler.compileQuotation(...)`.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const settingsService = require('../settingsService');
const r2 = require('../r2StorageService');
const { Document } = require('../../models');
const tenantContext = require('../../middleware/tenantContext');
const {
  COLORS, TABLE, FOOTER_H,
  drawGlobalHeader, drawGlobalFooter,
  drawTableHeader, drawDataRow, drawSectionTitle, SIDE_MARGIN,
} = require('../../utils/pdfTemplate');

const fmtCurrency = (n) => {
  const v = Number(n) || 0;
  return `$${v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};
const fmtNum = (n, d = 2) => (Number(n) || 0).toFixed(d);
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

/**
 * Build the PDF buffer for a compiled quotation.
 *
 * @param {object} compiled            output of quotationCompiler.compileQuotation()
 * @param {object} ctx
 * @param {object} ctx.quotation       ConfiguratorQuotation row (DB)
 * @param {object} ctx.configuration   ConfiguratorConfiguration row (DB) — optional
 * @param {object} ctx.project         Project row (DB) — optional
 * @param {object} ctx.companySettings result of settingsService.getCompanySettings(...)
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function renderQuotationPdf(compiled, ctx) {
  const { quotation, configuration, project, companySettings } = ctx;
  const margin = SIDE_MARGIN || 30;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({
      buffer: Buffer.concat(chunks),
      filename: buildFilename(quotation, project),
    }));
    doc.on('error', reject);

    try {
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const cW    = pageW - 2 * margin;

      let y = drawGlobalHeader(doc, companySettings || {}, 'CONFIGURATOR QUOTATION');

      // ── Header info block ──────────────────────────────────────────────
      y += 6;
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.TEXT_DARK);
      const proposalNo = quotation.quotation_number || quotation.code || `CFG-${quotation.id?.slice?.(0, 8) || 'NEW'}`;
      const customer   = quotation.customer_name || (project && project.client && project.client.name) || '';
      const dateStr    = fmtDate(quotation.created_at || new Date());
      const projName   = (project && project.project_name) || (configuration && configuration.name) || '';

      const leftLines  = [`Quotation #: ${proposalNo}`, `Date: ${dateStr}`, `Configuration: ${configuration?.code || ''}`];
      const rightLines = [`Customer: ${customer}`, `Project: ${projName}`, `Currency: USD`];
      leftLines.forEach((t, i) => doc.text(t, margin, y + i * 12));
      rightLines.forEach((t, i) => doc.text(t, margin + cW / 2, y + i * 12));
      y += leftLines.length * 12 + 8;

      // ── 1. BOM table ───────────────────────────────────────────────────
      drawSectionTitle(doc, margin, y, 1, 'Bill of Materials');
      y += 16;
      const bomCols = [40, 90, cW - 40 - 90 - 60 - 70 - 70, 60, 70, 70];
      const bomHeaders = ['#', 'Part #', 'Description', 'Qty', 'Unit Cost', 'Total'];
      const bomAligns  = ['center', 'left', 'left', 'right', 'right', 'right'];
      y += drawTableHeader(doc, margin, y, cW, bomCols, bomHeaders, bomAligns);

      const items = compiled.items || [];
      items.forEach((it, idx) => {
        if (y + TABLE.ROW_H + FOOTER_H > pageH - margin) {
          drawGlobalFooter(doc, companySettings || {});
          doc.addPage();
          y = drawGlobalHeader(doc, companySettings || {}, 'CONFIGURATOR QUOTATION (cont.)');
          y += 6;
          y += drawTableHeader(doc, margin, y, cW, bomCols, bomHeaders, bomAligns);
        }
        const bg = idx % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE;
        y += drawDataRow(doc, margin, y, cW, bomCols, [
          String(it.line_number),
          it.part_number || '',
          it.description || '',
          fmtNum(it.quantity, 0),
          fmtCurrency(it.unit_cost),
          fmtCurrency(it.total_cost),
        ], TABLE.ROW_H, bg, bomAligns);
      });

      // ── 2. Labour summary ──────────────────────────────────────────────
      y += 12;
      if (y + 80 + FOOTER_H > pageH - margin) {
        drawGlobalFooter(doc, companySettings || {});
        doc.addPage();
        y = drawGlobalHeader(doc, companySettings || {}, 'CONFIGURATOR QUOTATION (cont.)') + 6;
      }
      drawSectionTitle(doc, margin, y, 2, 'Labour Summary');
      y += 16;
      const labCols = [cW * 0.35, cW * 0.20, cW * 0.20, cW * 0.25];
      const labHeaders = ['Category', 'Hours', 'Rate ($/hr)', 'Cost'];
      const labAligns = ['left', 'right', 'right', 'right'];
      y += drawTableHeader(doc, margin, y, cW, labCols, labHeaders, labAligns);

      const lab = compiled.labour || { hours: {}, costs: {}, rates: {}, totals: {} };
      const cats = ['CU', 'ASM', 'CNT', 'QC', 'TST', 'ENG', 'CAD'];
      cats.forEach((c, idx) => {
        const bg = idx % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE;
        y += drawDataRow(doc, margin, y, cW, labCols, [
          c,
          fmtNum(lab.hours?.[c] || 0, 2),
          fmtCurrency(lab.rates?.[c] || 0),
          fmtCurrency(lab.costs?.[c] || 0),
        ], TABLE.ROW_H, bg, labAligns);
      });
      y += drawDataRow(doc, margin, y, cW, labCols, [
        { text: 'TOTAL', bold: true },
        { text: fmtNum(lab.totals?.hours_total || 0, 2), bold: true },
        '',
        { text: fmtCurrency(lab.totals?.cost_total || 0), bold: true },
      ], TABLE.ROW_H, COLORS.GT_BG, labAligns);

      // ── 3. Pricing totals ──────────────────────────────────────────────
      y += 12;
      if (y + 140 + FOOTER_H > pageH - margin) {
        drawGlobalFooter(doc, companySettings || {});
        doc.addPage();
        y = drawGlobalHeader(doc, companySettings || {}, 'CONFIGURATOR QUOTATION (cont.)') + 6;
      }
      drawSectionTitle(doc, margin, y, 3, 'Pricing Summary');
      y += 16;
      const sumCols = [cW * 0.65, cW * 0.35];
      const sumAligns = ['left', 'right'];
      const t = compiled.totals || {};
      const lines = [
        ['Material Total',         fmtCurrency(t.material_total)],
        ['Section Cost Total',     fmtCurrency(t.section_cost_total)],
        ['Overhead',               fmtCurrency(t.overhead_amount)],
        ['Copper Cost',            fmtCurrency(t.copper_cost)],
        ['Total Cost',             fmtCurrency(t.total_cost)],
        ['Target Price',           fmtCurrency(t.target_price)],
        ['Rounded / Quoted Price', fmtCurrency(t.rounded_price)],
        ['Profit',                 fmtCurrency(t.actual_profit)],
        ['Gross Margin',           `${((t.actual_gm || 0) * 100).toFixed(2)}%`],
      ];
      lines.forEach((row, idx) => {
        const isLast = idx === lines.length - 3; // Quoted price highlighted
        const bg = isLast ? COLORS.GT_BG : (idx % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE);
        y += drawDataRow(doc, margin, y, cW, sumCols, [
          { text: row[0], bold: isLast },
          { text: row[1], bold: isLast },
        ], TABLE.ROW_H, bg, sumAligns);
      });

      // ── 4. Schedule ────────────────────────────────────────────────────
      const sched = compiled.quote?.schedule || {};
      if (sched.order_date) {
        y += 12;
        if (y + 120 + FOOTER_H > pageH - margin) {
          drawGlobalFooter(doc, companySettings || {});
          doc.addPage();
          y = drawGlobalHeader(doc, companySettings || {}, 'CONFIGURATOR QUOTATION (cont.)') + 6;
        }
        drawSectionTitle(doc, margin, y, 4, 'Schedule');
        y += 16;
        const scCols = [cW * 0.5, cW * 0.5];
        const scLines = [
          ['Order Date',          fmtDate(sched.order_date)],
          ['Long-Lead Submittal', fmtDate(sched.long_lead_sub_date)],
          ['Long-Lead Approve',   fmtDate(sched.long_lead_approve_date)],
          ['Engineering Submittal', fmtDate(sched.eng_sub_date)],
          ['Release for Production', fmtDate(sched.release_date)],
          ['Ready to Ship',       fmtDate(sched.rts_date)],
        ];
        scLines.forEach((r, idx) => {
          const bg = idx % 2 ? COLORS.ROW_ALT : COLORS.ROW_WHITE;
          y += drawDataRow(doc, margin, y, cW, scCols, [r[0], r[1]], TABLE.ROW_H, bg, ['left', 'left']);
        });
      }

      drawGlobalFooter(doc, companySettings || {});
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function buildFilename(quotation, project) {
  const code = (quotation.quotation_number || quotation.code || `CFG-${quotation.id || 'NEW'}`)
    .replace(/[^a-zA-Z0-9_\-]/g, '-');
  const proj = ((project && project.project_name) || 'Configuration')
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  return `Configurator_Quotation_${proj}_${code}_${stamp}.pdf`;
}

/**
 * Generate the PDF, push it to R2, and persist a Document row.
 *
 * Returns:
 *   { document_id, file_path, file_name, r2_url, size }
 *
 * This function is tenant-aware: companyId must be passed explicitly
 * (typically from req.tenantScope.company_id) and is propagated to
 * R2 storage + the Document row. It does NOT rely on AsyncLocalStorage
 * being active — safe to invoke from background jobs.
 */
async function generateAndStoreQuotationPdf({
  compiled, quotation, configuration, project, companyId, userId,
}) {
  if (!quotation) throw new Error('generateAndStoreQuotationPdf: quotation required');
  if (!companyId) throw new Error('generateAndStoreQuotationPdf: companyId required');

  const companySettings = await settingsService.getCompanySettings(companyId);
  const { buffer, filename } = await renderQuotationPdf(compiled, {
    quotation, configuration, project, companySettings,
  });

  // Build R2 key — scoped under the company / project folder when possible
  let r2Key = null;
  if (r2.isConfigured()) {
    try {
      const names = await r2.resolveNames(companyId, project?.id || null);
      r2Key = r2.buildR2Key(
        names.companyName || 'Company',
        names.projectName || 'Configurations',
        'quotations',
        filename,
        { companyId, projectId: project?.id },
      );
      await r2.upload(buffer, r2Key, 'application/pdf');
    } catch (err) {
      // Non-fatal — proceed without R2 (Document row will store local path only)
      const logger = require('../../utils/logger');
      logger.warn({ err: err.message }, '[configurator] R2 upload failed; falling back to DB-only record');
      r2Key = null;
    }
  }

  // Persist a Document row inside the active tenant context
  const filePath = r2Key || `configurator/quotations/${quotation.id}/${filename}`;
  const docPayload = {
    project_id:    project?.id || null,
    module_type:   'configurator',
    reference_id:  quotation.id,
    document_type: 'configurator_quotation',
    description:   `Configurator quotation ${quotation.quotation_number || ''}`.trim(),
    size:          buffer.length,
    file_path:     filePath,
    file_name:     filename,
    file_type:     'generated',
    status:        'final',
    workflow_stage:'configuration/quotation',
    r2_url:        r2Key,
    company_id:    companyId,
    generated_by:  userId || null,
    generated_at:  new Date(),
  };

  // Run inside tenant context so beforeFind/beforeCreate hooks honor scope
  const created = await tenantContext.runWithTenantContext(companyId, async () => {
    return Document.create(docPayload);
  });

  return {
    document_id: created.id,
    file_path:   created.file_path,
    file_name:   created.file_name,
    r2_url:      created.r2_url,
    size:        created.size,
    buffer,
  };
}

module.exports = {
  renderQuotationPdf,
  generateAndStoreQuotationPdf,
};
