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

/** Parse "Fixed 3P -301 x 276 x 209mm" → inches {h,w,d} (mm source). */
function parseDims(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const mm2in = (x) => Math.round((Number(x) / 25.4) * 100) / 100;
  return { h: mm2in(m[1]), w: mm2in(m[2]), d: mm2in(m[3]) };
}

/** CB decoder workbook (CB_Selection sheet): enrich breaker catalog with
 *  manufacturer catalog numbers, dimensions, prices. Match by
 *  (frameModel, ratedA, mounting, poles); never rewrites part_number. */
async function importCbDecoder(wb, out) {
  const ws = wb.getWorksheet('CB_Selection');
  const comps = await models.ConfiguratorComponent.findAll({ where: { category: 'CIRCUIT BREAKER' } });
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = [];
  ws.eachRow((row, rn) => { if (rn >= 4) rows.push(row); });

  for (const row of rows) {
    const get = (i) => unwrap(row.getCell(i).value);
    const frame = str(get(5));
    if (!frame) continue;
    const type = str(get(2)) || 'MCCB';
    const manufacturer = String(str(get(3)) || '').replace(/_/g, ' ');
    const series = str(get(4));
    const ratedA = parseInt(String(get(6)), 10) || 0;
    const kA = parseInt(String(get(7)), 10) || 0;
    const poles = parseInt(String(get(8)), 10) || 3;
    const voltage = str(get(9));
    const tripUnit = str(get(10));
    const protection = str(get(11));
    const mounting = /draw|with/i.test(String(get(12) || '')) ? 'Drawout' : 'Fixed';
    const application = str(get(13));
    const mfrRef = str(get(14));
    const dims = parseDims(get(15));
    const price = Number(String(get(16) || '').replace(/[^0-9.]/g, '')) || null;
    if (!ratedA) { out.cbUnmatched += 1; continue; }

    const spec = {
      manufacturer, series, frameModel: frame,
      deviceClass: ['ACB', 'ICCB', 'MCCB', 'MCB'].includes(String(type).toUpperCase()) ? String(type).toUpperCase() : 'MCCB',
      ratedCurrentA: ratedA, interruptingKA: kA, poles,
      voltageRating: voltage, tripUnitType: tripUnit, protectionFunctions: protection,
      mounting, applicationType: application,
      ...(mfrRef ? { catalogNumber: mfrRef } : {}),
      source: 'CB Decoder.xlsx',
    };
    const fields = {
      specifications: spec,
      ...(dims ? { dims_h_in: dims.h, dims_w_in: dims.w, dims_d_in: dims.d } : {}),
      ...(price ? { price, mat_cost: price, material_cost: price, price_status: 'FIRM' } : {}),
    };

    // Match existing: frame prefix + rating + poles + mounting
    const match = comps.find((c) => {
      const sp = c.specifications || {};
      const fm = norm(sp.frameModel);
      return fm && (norm(frame).startsWith(fm) || fm.startsWith(norm(frame)))
        && (parseInt(sp.ratedCurrentA, 10) || 0) === ratedA
        && (parseInt(sp.poles, 10) || 3) === poles
        && String(sp.mounting || 'Fixed') === mounting;
    });

    if (match) {
      await match.update({
        ...fields,
        specifications: { ...(match.specifications || {}), ...spec, ...(price ? { priceSource: 'vendor-import' } : {}) },
      }).catch((e) => out.warnings.push(`CB ${frame}: ${e.message}`));
      out.cbEnriched += 1;
    } else {
      const partNumber = [String(manufacturer).replace(/\s+/g, '_'), frame.replace(/\s+/g, ''), ratedA, poles + 'P', mounting].join('-');
      const exists = comps.find((c) => c.part_number === partNumber);
      if (exists) { out.cbEnriched += 1; await exists.update(fields).catch(() => {}); }
      else {
        await models.ConfiguratorComponent.create({
          category: 'CIRCUIT BREAKER',
          component_type: 'CIRCUIT_BREAKER',
          part_number: partNumber,
          name: [manufacturer, series, frame].filter(Boolean).join(' '),
          is_active: true,
          price: price ?? 0, mat_cost: price ?? 0, material_cost: price ?? 0,
          price_status: price ? 'FIRM' : 'PENDING_RFQ',
          standards_regime: /UL|ANSI/i.test(String(voltage)) ? 'UL' : 'IEC',
          ...(dims ? { dims_h_in: dims.h, dims_w_in: dims.w, dims_d_in: dims.d } : {}),
          specifications: { ...spec, ...(price ? { priceSource: 'vendor-import' } : {}) },
        }).catch((e) => out.warnings.push(`CB create ${frame}: ${e.message}`));
        out.cbCreated += 1;
      }
    }
    if (mfrRef) out.cbWithCatalogNumber += 1;
    if (price) out.cbPriced += 1;
  }
}

/** Guess a category for free-text MasterPricing rows. */
function guessCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/(e\d\.\d|xt\d|ekip|mtz|masterpact|3va|3wl|breaker|micrologic)/.test(t)) return 'CIRCUIT BREAKER';
  if (/(enclosure|saginaw|rittal|hoffman|sce-|nema|subpan|junction box|wallmount)/.test(t)) return 'ENCLOSURE';
  if (/(flexibus|copper bu|erico|bus bar|busbar)/.test(t)) return 'BUSSING';
  if (/(camlock|camlok)/.test(t)) return 'CAMLOCK';
  if (/(lug)/.test(t)) return 'LUGS';
  if (/(ct\b|current transformer)/.test(t)) return 'CURRENT TRANSFORMER';
  if (/(spd|surge)/.test(t)) return 'SPD';
  if (/(relay)/.test(t)) return 'RELAY';
  if (/(wire|cable)/.test(t)) return 'WIRE CABLE';
  if (/(switch)/.test(t)) return 'SWITCH';
  if (/(light)/.test(t)) return 'LIGHT';
  return 'HARDWARE';
}

/** Pull a leading part-number-looking token from "PN , description". */
function extractPartNumber(text) {
  const first = String(text || '').split(',')[0].trim();
  if (first.length >= 4 && first.length <= 40 && !/\s{2,}/.test(first)
      && /\d/.test(first) && !/\s.*\s.*\s/.test(first)) {
    return first.replace(/\s+/g, '');
  }
  return null;
}

/** MasterPricing sheet: 700+ free-text priced rows (price book). */
async function importMasterPricing(wb, out) {
  const ws = wb.getWorksheet('MasterPricing');
  if (!ws) return;
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
  const existing = await models.ConfiguratorComponent.findAll({ attributes: ['id', 'name', 'price'] });
  const byName = new Map(existing.map((c) => [norm(c.name), c]));

  const rows = [];
  ws.eachRow((row) => {
    const text = str(unwrap(row.getCell(3).value));
    const price = num(row.getCell(4).value);
    if (text && price > 0 && text.length >= 6) rows.push({ text, price });
  });

  const seen = new Set();
  for (const r of rows) {
    const key = norm(r.text);
    if (seen.has(key)) { out.mpSkipped += 1; continue; }
    seen.add(key);
    const match = byName.get(key);
    if (match) {
      if (Number(match.price) !== r.price) {
        await match.update({ price: r.price, mat_cost: r.price, material_cost: r.price, price_status: 'FIRM', specifications: { ...(match.specifications || {}), priceSource: 'vendor-import' } }).catch(() => {});
        out.mpUpdated += 1;
      } else out.mpSkipped += 1;
      continue;
    }
    await models.ConfiguratorComponent.create({
      category: guessCategory(r.text),
      name: r.text.slice(0, 250),
      part_number: extractPartNumber(r.text),
      is_active: true,
      price: r.price, mat_cost: r.price, material_cost: r.price,
      price_status: 'FIRM',
      specifications: { importedFrom: 'TPS_Estimate_23XX MasterPricing', importedAt: new Date().toISOString(), priceSource: 'vendor-import' },
    }).catch((e) => out.warnings.push(`mp ${r.text.slice(0, 30)}: ${e.message}`));
    out.mpCreated += 1;
  }
}

async function importTpsWorkbook(buffer, { companyId = null } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = { componentsCreated: 0, componentsUpdated: 0, busScheduleRows: 0, neutralRows: 0, copperPricePerLb: null, ratesFound: {}, cbEnriched: 0, cbCreated: 0, cbWithCatalogNumber: 0, cbPriced: 0, cbUnmatched: 0, mpCreated: 0, mpUpdated: 0, mpSkipped: 0, warnings: [] };

  // CB decoder workbook? (CB_Selection sheet) — enrichment path
  if (wb.getWorksheet('CB_Selection')) {
    await importCbDecoder(wb, out);
    return out;
  }

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
        await existing.update({ ...fields, specifications: { ...(existing.specifications || {}), priceSource: 'vendor-import' } });
        out.componentsUpdated += 1;
      } else {
        await models.ConfiguratorComponent.create({
          category: r.category,
          name: r.name,
          description: r.comments,
          is_active: true,
          specifications: { importedFrom: 'TPS_Estimate_23XX', importedAt: new Date().toISOString(), priceSource: 'vendor-import' },
          company_id: companyId,
          ...fields,
        }).catch((e) => out.warnings.push(`component ${r.name}: ${e.message}`));
        out.componentsCreated += 1;
      }
    }
  } else out.warnings.push('COMPONENTS sheet not found');

  /* ── 1b. MasterPricing price book (755 free-text rows) ── */
  await importMasterPricing(wb, out);

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
