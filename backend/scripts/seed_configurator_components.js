/**
 * Seed Configurator Components
 *
 * Imports the configurator component master into `configurator_components`
 * and `configurator_component_categories`.
 *
 * Sources (first one found wins):
 *   1. CSV at `config/components.csv` (preferred — produced by Phase 0
 *      export of the configurator master).
 *   2. The legacy `config/backend/TPS_Estimate_23XX.xlsm` workbook
 *      (parsed via exceljs, sheet "Components" if present, else the
 *      first sheet).
 *
 * If NEITHER is found we exit 0 with a warning so a freshly-cloned
 * Forge install can still boot — Phase 1 acceptance only requires the
 * schema, not the data.
 *
 * Idempotent: keyed on `(company_id, part_number)` when a part number
 * exists, falling back to `(company_id, name, category)`. Re-running
 * is safe and updates pricing fields in place.
 *
 * Usage:
 *   SEED_COMPANY_ID=<uuid> node backend/scripts/seed_configurator_components.js
 *   node backend/scripts/seed_configurator_components.js --company-id <uuid>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ── Argument parsing ────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { companyId: process.env.SEED_COMPANY_ID || null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--company-id' || a === '--companyId') {
      args.companyId = argv[++i];
    } else if (a.startsWith('--company-id=')) {
      args.companyId = a.split('=')[1];
    }
  }
  return args;
}

// LBR-* labour column mapping (matches config/backend/scripts/import_components_from_csv.py)
const LABOR_KEYS = [
  ['LBR CU',  'lbr_cu'],
  ['LBR ASM', 'lbr_asm'],
  ['LBR CNT', 'lbr_cnt'],
  ['LBR QC',  'lbr_qc'],
  ['LBR TST', 'lbr_tst'],
  ['LBR ENG', 'lbr_eng'],
  ['LBR CAD', 'lbr_cad'],
];

function normalizeKey(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[$,]/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractPartNumber(row) {
  // Heuristic: prefer a literal "PART NUMBER" / "PN" / "P/N" column, then
  // regex-scan DESCRIPTION + COMMENTS for an SKU-looking token.
  const direct = row['PART NUMBER'] || row['PART_NUMBER'] || row['PN'] || row['P/N'];
  if (direct) return String(direct).trim();
  const blob = `${row.DESCRIPTION || ''} ${row.COMMENTS || ''}`;
  const m = blob.match(/\b[A-Z][A-Z0-9]{2,}(?:[-/][A-Z0-9]+)+\b/);
  return m ? m[0] : null;
}

function normalizeCategory(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// ── Row readers ─────────────────────────────────────────────────────
async function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map(h => normalizeKey(h));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] != null ? cells[j].trim() : '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line) {
  // Minimal CSV parser (handles quoted fields with commas, doubled quotes)
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') { inQuotes = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

async function readXlsm(filePath) {
  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch (e) {
    console.error('[seed-configurator] exceljs is required to read xlsm files. Install with: npm install exceljs');
    throw e;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath).catch(async () => {
    // xlsm is technically the macro variant of xlsx; exceljs xlsx reader
    // works for it but a few releases fail on the macro stream. Fall
    // back to copying to a .xlsx temp file is overkill — try the
    // streaming reader instead.
    const stream = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { entries: 'emit', sharedStrings: 'cache' });
    await stream.read();
  });
  let sheet = wb.getWorksheet('Components') || wb.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  let headers = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values.slice(1); // ExcelJS pads index 0
    if (rowNumber === 1) {
      headers = values.map(v => normalizeKey(v));
      return;
    }
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const cell = values[j];
      obj[headers[j]] = cell == null ? '' : (typeof cell === 'object' && cell.result != null ? cell.result : cell);
    }
    rows.push(obj);
  });
  return rows;
}

async function loadSourceRows() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const csvPath = path.join(repoRoot, 'config', 'components.csv');
  const xlsmPath = path.join(repoRoot, 'config', 'backend', 'TPS_Estimate_23XX.xlsm');

  if (fs.existsSync(csvPath)) {
    console.log(`[seed-configurator] reading CSV: ${csvPath}`);
    return { rows: await readCsv(csvPath), source: 'csv' };
  }
  if (fs.existsSync(xlsmPath)) {
    console.log(`[seed-configurator] reading XLSM: ${xlsmPath}`);
    return { rows: await readXlsm(xlsmPath), source: 'xlsm' };
  }
  console.warn('[seed-configurator] no source file found (config/components.csv or config/backend/TPS_Estimate_23XX.xlsm). Skipping.');
  return { rows: [], source: null };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  if (!args.companyId) {
    console.error('[seed-configurator] --company-id <uuid> (or SEED_COMPANY_ID env) is required.');
    process.exit(1);
  }

  const { rows, source } = await loadSourceRows();
  if (rows.length === 0) {
    // Acceptance: must boot cleanly even without seed data
    process.exit(0);
  }

  const {
    sequelize,
    ConfiguratorComponent,
    ConfiguratorComponentCategory,
  } = require('../src/models');
  const tenantContext = require('../src/middleware/tenantContext');

  await sequelize.authenticate();
  console.log(`[seed-configurator] connected. parsing ${rows.length} rows from ${source}.`);

  const categoryCache = new Map(); // normalized_name -> id
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await tenantContext.runWithTenantContext(args.companyId, async () => {
    const tx = await sequelize.transaction();
    try {
      for (const raw of rows) {
        // Normalize keys (case-insensitive lookup)
        const row = {};
        for (const k of Object.keys(raw)) row[normalizeKey(k)] = raw[k];

        const klass = String(row.CLASS || row.CATEGORY || '').trim();
        const description = String(row.DESCRIPTION || row.NAME || '').trim();
        if (!klass && !description) { skipped++; continue; }

        const normalized = normalizeCategory(klass);
        let categoryId = categoryCache.get(normalized);
        if (!categoryId && normalized) {
          const [cat] = await ConfiguratorComponentCategory.findOrCreate({
            where: { company_id: args.companyId, normalized_name: normalized },
            defaults: {
              company_id: args.companyId,
              name: klass,
              normalized_name: normalized,
            },
            transaction: tx,
          });
          categoryId = cat.id;
          categoryCache.set(normalized, categoryId);
        }

        const partNumber = extractPartNumber(row);
        const matCost = toNumber(row['MAT COST']);
        const labour = {};
        for (const [colName, dbField] of LABOR_KEYS) {
          labour[dbField] = toNumber(row[colName]);
        }

        const payload = {
          company_id: args.companyId,
          part_number: partNumber || null,
          name: description || klass || partNumber || 'Unnamed component',
          category: klass || null,
          component_type: normalized || null,
          description,
          mat_cost: matCost,
          material_cost: matCost,
          excel_date: String(row.DATE || '').trim() || null,
          comments: String(row.COMMENTS || '').trim() || null,
          ...labour,
          specifications: {},
          is_active: true,
        };

        // Lookup: prefer (company_id, part_number); fallback (company_id, name, category)
        const where = partNumber
          ? { company_id: args.companyId, part_number: partNumber }
          : { company_id: args.companyId, name: payload.name, category: payload.category };

        const existing = await ConfiguratorComponent.findOne({ where, transaction: tx });
        if (existing) {
          await existing.update(payload, { transaction: tx });
          updated++;
        } else {
          await ConfiguratorComponent.create(payload, { transaction: tx });
          created++;
        }
      }

      await tx.commit();
      console.log(`[seed-configurator] done. created=${created} updated=${updated} skipped=${skipped} categories=${categoryCache.size}`);
    } catch (err) {
      await tx.rollback();
      console.error('[seed-configurator] FAILED, transaction rolled back:', err);
      process.exitCode = 2;
    }
  });

  await sequelize.close();
}

main().catch((err) => {
  console.error('[seed-configurator] fatal:', err);
  process.exit(2);
});
