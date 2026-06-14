'use strict';

/**
 * standardsService.js — central accessor for Engineering Standards
 * (Standards Phase 1).
 *
 * Callers ask for a table_key and always get usable rows:
 *   1. the CURRENT DB version's `rows` for that key (company-scoped if a
 *      company row exists, else global), OR
 *   2. if no DB row exists, the SEED default from engineeringStandardsSeed.
 *
 * Returns [] only when the key is unknown (no DB row AND no seed entry).
 *
 * NOTE: Phase 1 only. No engine is wired to this yet — v2BomService keeps
 * its own stdRows(). Phase 2 migrates callers here.
 */

const models = require('../../models');
const seed = require('../../seeds/engineeringStandardsSeed');

/** All keys this service knows about = union of seed keys (extensible). */
function knownKeys() {
  return Object.keys(seed);
}

/** Seed default for a key, or [] if the key has no seed entry. */
function seedRows(tableKey) {
  const rows = seed[tableKey];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Resolve the current DB version's rows for a key, preferring a
 * company-scoped row over the global (company_id = null) row.
 * Returns null if no DB row found (so the caller can fall back to seed).
 */
async function dbRows(tableKey, companyId = null) {
  if (!models.ConfiguratorEngineeringStandard) return null;

  // Company-scoped current version takes precedence when a companyId is given.
  if (companyId) {
    const scoped = await models.ConfiguratorEngineeringStandard.findOne({
      where: { table_key: tableKey, is_current: true, company_id: companyId },
      order: [['version', 'DESC']],
    });
    if (scoped && Array.isArray(scoped.rows)) return scoped.rows;
  }

  // Fall back to the global current version.
  const global = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: tableKey, is_current: true, company_id: null },
    order: [['version', 'DESC']],
  });
  if (global && Array.isArray(global.rows)) return global.rows;

  return null;
}

/**
 * getStandard(tableKey, companyId?) → rows.
 * DB current version (company-scoped, else global) → else seed default.
 * Returns [] only if the key is unknown.
 */
async function getStandard(tableKey, companyId = null) {
  let fromDb = null;
  try {
    fromDb = await dbRows(tableKey, companyId);
  } catch (_err) {
    // DB unreachable / model not migrated — fall through to seed.
    fromDb = null;
  }
  if (Array.isArray(fromDb)) return fromDb;
  return seedRows(tableKey);
}

/**
 * getStandards(companyId?) → { <tableKey>: rows, ... } for ALL known keys
 * (DB-or-seed). For the future Standards module / UI.
 */
async function getStandards(companyId = null) {
  const out = {};
  for (const key of knownKeys()) {
    // eslint-disable-next-line no-await-in-loop
    out[key] = await getStandard(key, companyId);
  }
  return out;
}

/**
 * Phase 4 — provenance/seed-status helpers.
 * A key is "seed" (unverified default) when no DB version row exists for it,
 * so getStandard falls back to the seed. Used to flag provisional values on
 * INTERNAL outputs (BOM / Pricing) and to warn before issuing.
 */

/** Cost/engineering keys that actually feed BOM, quote and proposal math. */
function costAffectingKeys() {
  return [
    'copper_grades', 'copper_cost', 'copper_estimator', 'ground_bus',
    'enclosure_costing', 'load_calc', 'breaker_rules', 'termination_factors',
    'proposal_settings', 'bus_schedule', 'frame_library', 'packing_settings',
    'safety_items_map',
  ].filter((k) => knownKeys().includes(k));
}

/** Like dbRows but reports where the rows came from. */
async function dbRowsMeta(tableKey, companyId = null) {
  if (!models.ConfiguratorEngineeringStandard) return null;
  if (companyId) {
    const scoped = await models.ConfiguratorEngineeringStandard.findOne({
      where: { table_key: tableKey, is_current: true, company_id: companyId },
      order: [['version', 'DESC']],
    });
    if (scoped && Array.isArray(scoped.rows)) {
      return { rows: scoped.rows, source: 'tenant', version: scoped.version };
    }
  }
  const global = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: tableKey, is_current: true, company_id: null },
    order: [['version', 'DESC']],
  });
  if (global && Array.isArray(global.rows)) {
    return { rows: global.rows, source: 'global', version: global.version };
  }
  return null;
}

/** getStandardMeta(key, companyId?) -> { rows, source: tenant|global|seed, version }. */
async function getStandardMeta(tableKey, companyId = null) {
  let meta = null;
  try {
    meta = await dbRowsMeta(tableKey, companyId);
  } catch (_err) {
    meta = null;
  }
  if (meta) return meta;
  return { rows: seedRows(tableKey), source: 'seed', version: 0 };
}

/**
 * seedStatus(companyId?, keys?) -> { known, seedKeys, tenantKeys, globalKeys, verified }.
 * seedKeys are still on unverified seed defaults for this tenant.
 */
async function seedStatus(companyId = null, keys = null) {
  const list = Array.isArray(keys) && keys.length ? keys : knownKeys();
  const seedKeys = [];
  const tenantKeys = [];
  const globalKeys = [];
  for (const key of list) {
    // eslint-disable-next-line no-await-in-loop
    const meta = await getStandardMeta(key, companyId);
    if (meta.source === 'tenant') tenantKeys.push(key);
    else if (meta.source === 'global') globalKeys.push(key);
    else seedKeys.push(key);
  }
  return { known: list, seedKeys, tenantKeys, globalKeys, verified: seedKeys.length === 0 };
}

/** firstRow(rows) — convenience for single-row tables. */
function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = {
  getStandard, getStandards, firstRow, knownKeys, seedRows,
  getStandardMeta, seedStatus, costAffectingKeys,
};
