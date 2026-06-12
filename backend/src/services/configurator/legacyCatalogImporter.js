'use strict';

/**
 * legacyCatalogImporter — loads the 267-part catalog recovered from the
 * old sales-configurator app (backend/src/seeds/legacyComponentsSeed.json)
 * into configurator_components.
 *
 * Idempotent: upserts by part_number. Used in two places:
 *   1. Boot migration 20260612000001-seed-legacy-catalog (runs ONCE, tracked
 *      in SequelizeMeta) — so fresh databases get the legacy catalog
 *      permanently, no user action needed. After that, users maintain the
 *      catalog via the Excel download/upload round-trip; deleted legacy
 *      parts stay deleted because the migration never re-runs.
 *   2. POST /catalog/import-legacy (kept as a buttonless admin endpoint
 *      for manual re-sync if ever needed).
 */

const seed = require('../../seeds/legacyComponentsSeed.json');

const JUNK = /^(demo|test)$|^test_|_demo_/i;
const ACCESSORY = /Cradle|Shunt Trip|UV Coil|Remote Reset|^Motor - |Aux Contacts|Kirk Key|Padlock|ATS Built In|Power Supply - |^RELT|Modbus Comm|Signaling Module|^Lugs .*MCB/i;
const UNKNOWN = /Load Center|Panel Board|Panelboard/i;

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Map one legacy seed row to a ConfiguratorComponent payload. */
function mapRow(row) {
  const price = Number(row.price) || 0;
  const old = row.specifications || {};
  const spec = { ...old, priceSource: 'vendor-import', legacySource: 'sales-configurator-v1' };
  if (row.subcategory && !spec.manufacturer) spec.manufacturer = row.subcategory;
  if (row.subcategory && !spec.subcategory) spec.subcategory = row.subcategory;
  if (row.type && !spec.legacyType) spec.legacyType = row.type;
  const hay = [row.name, row.description, row.type, old.sec1Desc].filter(Boolean).join(' ');
  if (!spec.deviceClass) {
    if (/MCCB/i.test(hay)) spec.deviceClass = 'MCCB';
    else if (/\bNW\b|Masterpact|Emax|\bACB\b/i.test(hay)) spec.deviceClass = 'ACB';
  }
  if (old.frameAmps && !spec.ratedCurrentA) spec.ratedCurrentA = num(old.frameAmps);
  if (old.breakerKic && !spec.interruptingKA) spec.interruptingKA = num(old.breakerKic);
  if (old.poles && !spec.poles) spec.poles = num(old.poles);
  if (old.breakerVoltage && !spec.voltageRating) spec.voltageRating = String(old.breakerVoltage);
  if (old.protectFunc && !spec.protectionFunctions) spec.protectionFunctions = String(old.protectFunc);
  if (old.cbDesc && !spec.catalogNumber && /^[A-Za-z0-9-]{8,}$/.test(String(old.cbDesc))) spec.catalogNumber = String(old.cbDesc);
  Object.keys(spec).forEach((k) => { if (spec[k] === undefined || spec[k] === '') delete spec[k]; });

  let category = row.category;
  if (category === 'CIRCUIT BREAKER') {
    const n = String(row.name || '');
    if (ACCESSORY.test(n)) category = 'CB ACCESSORIES';
    else if (UNKNOWN.test(n)) category = 'UNKNOWN PARTS';
  }

  return {
    name: row.name,
    category,
    part_number: row.part_number,
    description: row.description ?? null,
    price,
    mat_cost: price,
    lbr_cu: Number(row.lbr_cu) || 0, lbr_asm: Number(row.lbr_asm) || 0, lbr_cnt: Number(row.lbr_cnt) || 0,
    lbr_qc: Number(row.lbr_qc) || 0, lbr_tst: Number(row.lbr_tst) || 0, lbr_eng: Number(row.lbr_eng) || 0,
    lbr_cad: Number(row.lbr_cad) || 0,
    price_status: price > 0 ? 'FIRM' : 'PENDING_RFQ',
    specifications: spec,
    is_active: true,
  };
}

/**
 * @param {Model} ConfiguratorComponent sequelize model
 * @param {Object} opts { companyId }
 * @returns {Promise<{created:number, updated:number, skipped:number, total:number}>}
 */
async function importLegacyCatalog(ConfiguratorComponent, { companyId = null } = {}) {
  let created = 0, updated = 0, skipped = 0;
  for (const row of seed) {
    if (JUNK.test(String(row.name || '').trim())) { skipped += 1; continue; }
    const payload = mapRow(row);
    const existing = await ConfiguratorComponent.findOne({ where: { part_number: row.part_number } });
    if (existing) {
      payload.specifications = { ...(existing.specifications || {}), ...payload.specifications };
      await existing.update(payload).catch(() => {});
      updated += 1;
    } else {
      let ok = true;
      await ConfiguratorComponent.create({ ...payload, company_id: companyId }).catch(() => { ok = false; });
      if (ok) created += 1; else skipped += 1;
    }
  }
  const total = await ConfiguratorComponent.count();
  return { created, updated, skipped, total };
}

module.exports = { importLegacyCatalog };
