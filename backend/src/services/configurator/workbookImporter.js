'use strict';

/**
 * workbookImporter.js — TPS_Estimate_23XX.xlsm → system data.
 *
 * Extracts from the exact workbook TPS estimates with today:
 *   COMPONENTS  → configurator_components (cost + 7 labour-hour buckets)
 *   CU_LOOKUP   → bus_schedule (phase) + neutral_bus_schedule versions,
 *                 copper $/lb into costing_defaults
 *   LOOKUP      → labour rates into costing_defaults
 * Idempotent: components upsert by (category, name); standards tables
 * get a NEW version (never overwritten).
 */

const ExcelJS = require('exceljs');
const models = require('../../models');
const { getCostingDefaults } = require('./costingDefaults');

// exceljs cells can be {formula, result}, {richText}, Date, …
const unwrap = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if (v instanceof Date) return v;
    if ('text' in v) return v.text;
  }
  return v;
};
const num = (v) => {
  const n = Number(unwrap(v));
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => {
  const u = unwrap(v);
  return u == null ? null : String(u).trim() || null;
};

async function saveStandardsVersion(tableKey, rows, notes) {
  const current = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: tableKey, is_current: true },
    order: [['version', 'DESC']],
  });
  if (current) await current.update({ is_current: false });
  return models.ConfiguratorEngineeringStandard.create({
    table_key: tableKey,
    version: (current?.version ?? 0) + 1,
    rows,
    notes,
    is_current: true,
  });
}

async function importTpsWorkbook(buffer, { companyId = null } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = { componentsCreated: 0, componentsUpdated: 0, busScheduleRows: 0, neutralRows: 0, copperPricePerLb: null, ratesFound: {}, warnings: [] };

  /* ── 1. COMPONENTS sheet → catalog with labour hours ── */
  const comp = wb.getWorksheet('COMPONENTS');
  if (comp) {
    const rows = [];
    comp.eachRow((row, rn) => {
      if (rn < 3) return; // title + header
      const cls = str(row.getCell(1).value);
      const desc = str(row.getCell(2).value);
      if (!cls || !desc) return;
      rows.push({
        category: cls.toUpperCase(),
        name: desc,
        mat: num(row.getCell(3).value),
        lbr_cu: num(row.getCell(4).value), lbr_asm: num(row.getCell(5).value),
        lbr_cnt: num(row.getCell(6).value), lbr_qc: num(row.getCell(7).value),
        lbr_tst: num(row.getCell(8).value), lbr_eng: num(row.getCell(9).value),
        lbr_cad: num(row.getCell(10).value),
        comments: str(row.getCell(12).value),
      });
    });
    for (const r of rows) {
      const existing = await models.ConfiguratorComponent.findOne({
        where: { category: r.category, name: r.name },
      });
      const fields = {
        price: r.mat, mat_cost: r.mat, material_cost: r.mat,
        lbr_cu: r.lbr_cu, lbr_asm: r.lbr_asm, lbr_cnt: r.lbr_cnt,
        lbr_qc: r.lbr_qc, lbr_tst: r.lbr_tst, lbr_eng: r.lbr_eng, lbr_cad: r.lbr_cad,
        price_status: r.mat > 0 ? 'FIRM' : 'PENDING_RFQ',
      };
      if (existing) {
        await existing.update(fields);
        out.componentsUpdated += 1;
      } else {
        await models.ConfiguratorComponent.create({
          category: r.category,
          name: r.name,
          description: r.comments,
          is_active: true,
          specifications: { importedFrom: 'TPS_Estimate_23XX', importedAt: new Date().toISOString() },
          company_id: companyId,
          ...fields,
        }).catch((e) => out.warnings.push(`component ${r.name}: ${e.message}`));
        out.componentsCreated += 1;
      }
    }
  } else out.warnings.push('COMPONENTS sheet not found');

  /* ── 2. CU_LOOKUP → copper price + phase/neutral bus schedules ── */
  const cu = wb.getWorksheet('CU_LOOKUP');
  if (cu) {
    // copper $/lb sits next to "COST PER LBS."
    cu.eachRow((row) => {
      const a = str(row.getCell(2).value);
      if (a && /COST PER LBS/i.test(a)) out.copperPricePerLb = num(row.getCell(3).value) || null;
    });

    const phase = [];
    const neutral = [];
    let mode = null;
    cu.eachRow((row) => {
      const b = str(row.getCell(2).value);
      if (b && /THRU BUS AND/i.test(b)) { mode = 'phase'; return; }
      if (b && /NEUTRAL THRU/i.test(b)) { mode = 'neutral'; return; }
      const amp = num(row.getCell(2).value);
      if (!amp) return;
      if (mode === 'phase') {
        const bars = num(row.getCell(3).value), w = num(row.getCell(4).value);
        if (bars && w) phase.push({
          ratingA: amp, material: 'Cu', barsPerPhase: bars, barThk_in: 0.25, barW_in: w,
          plating: 'Tin', bracing_kA: 65, neutralPct: 100,
          seed: false, verified: true, source: 'TPS_Estimate_23XX',
        });
      } else if (mode === 'neutral') {
        const pct = num(row.getCell(3).value), bars = num(row.getCell(4).value), w = num(row.getCell(5).value);
        if (bars && w) neutral.push({
          ratingA: amp, neutralPct: pct, bars, barThk_in: 0.25, barW_in: w,
          seed: false, verified: true, source: 'TPS_Estimate_23XX',
        });
      }
    });
    if (phase.length) {
      await saveStandardsVersion('bus_schedule', phase, 'Imported from TPS_Estimate_23XX.xlsm CU_LOOKUP');
      out.busScheduleRows = phase.length;
    }
    if (neutral.length) {
      await saveStandardsVersion('neutral_bus_schedule', neutral, 'Imported from TPS_Estimate_23XX.xlsm CU_LOOKUP');
      out.neutralRows = neutral.length;
    }
  } else out.warnings.push('CU_LOOKUP sheet not found');

  /* ── 3. LOOKUP rates + copper price → costing_defaults new version ── */
  const lk = wb.getWorksheet('LOOKUP');
  if (lk) {
    const rates = {};
    lk.eachRow((row) => {
      const k = str(row.getCell(1).value);
      const v = num(row.getCell(2).value);
      if (k && /^LBR (CU|ASM|CNT|QC|TST|ENG|CAD)$/i.test(k) && v > 0) {
        rates['lbr_' + k.split(' ')[1].toLowerCase() + '_rate'] = v;
      }
    });
    out.ratesFound = rates;
    const cur = await getCostingDefaults();
    const next = { ...cur, ...rates };
    if (out.copperPricePerLb) next.copper_price_per_lb = out.copperPricePerLb;
    next.seed = false;
    next.source = 'TPS_Estimate_23XX.xlsm import';
    await saveStandardsVersion('costing_defaults', [next], 'Imported from TPS_Estimate_23XX.xlsm LOOKUP/CU_LOOKUP');
  } else out.warnings.push('LOOKUP sheet not found');

  return out;
}

module.exports = { importTpsWorkbook };
