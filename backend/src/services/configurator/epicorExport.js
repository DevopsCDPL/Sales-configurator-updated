'use strict';

/**
 * epicorExport.js — Phase F: TPS's exact "EPICOR IMPORT" sheet layout,
 * generated from an issued V2 quotation revision.
 *
 * Operations map 1:1 to the labour buckets (workbook-verified):
 *   10 COPPRFAB=CU · 20 SBAssy=ASM · 30 CPAssy=CNT · 40 QA=QC ·
 *   50 Test=TST · 60 ENGIN=ENG+CAD
 * Material estimate = quoted material total (incl. copper estimate).
 */

const ExcelJS = require('exceljs');
const models = require('../../models');

const OPS = [
  [10, 'COPPRFAB', 'CU'],
  [20, 'SBAssy', 'ASM'],
  [30, 'CPAssy', 'CNT'],
  [40, 'QA', 'QC'],
  [50, 'Test', 'TST'],
  [60, 'ENGIN', 'ENG'], // + CAD merged below
];

async function buildEpicorWorkbook(quotationId) {
  const quotation = await models.ConfiguratorQuotation.findByPk(quotationId);
  if (!quotation) {
    const err = new Error('quotation not found');
    err.status = 404;
    throw err;
  }
  const q = quotation.pricing_spec?.quote;
  if (!q) {
    const err = new Error('quotation has no V2 pricing payload');
    err.status = 422;
    throw err;
  }
  const hours = q.labor_hours || {};
  const units = quotation.pricing_spec?.multiUnit?.units || 1;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('EPICOR IMPORT');

  ws.addRow(['LABOR EIMPORT']).font = { bold: true };
  ws.addRow(['Operation', 'Operation', 'Qty/Parent', 'Hours Per Machine', 'Addl Setup Qty', 'Addl Setup Hrs', 'Prod. Std']).font = { bold: true };
  for (const [code, name, bucket] of OPS) {
    let h = Number(hours[bucket]) || 0;
    if (bucket === 'ENG') h += Number(hours.CAD) || 0;
    ws.addRow([code, name, 1, 0, 0, 0, Math.round(h * 100) / 100]);
  }

  ws.addRow([]);
  ws.addRow(['MATERIAL ESTIMATE']).font = { bold: true };
  ws.addRow([
    'Mtl', 'Part', 'Desc', 'Unit Cost', 'Unit Price', 'Extended Price',
    'Require Ref Des', 'Base Part', 'Qty Bearing', 'Base Revision', 'Price Per',
    'Prefix', 'Find Number', 'Attribute Set', 'Suffix', 'Scrap', 'Qty/Parent',
  ]).font = { bold: true };
  ws.addRow([
    10, 'ESTIMATED MATERIAL', `MATERIAL ESTIMATE ${quotation.quotation_number || ''}`.trim(),
    Number(q.totals?.material_total) || 0, 0, 0,
    1, '', false, '', '', '', '', '', '', 0, units,
  ]);

  ws.columns.forEach((c) => { c.width = 16; });
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Epicor_Import_${(quotation.quotation_number || quotation.id.slice(0, 8)).replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`;
  return { buffer: Buffer.from(buffer), filename };
}

module.exports = { buildEpicorWorkbook };
