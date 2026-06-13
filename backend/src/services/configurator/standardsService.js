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

/** firstRow(rows) — convenience for single-row tables. */
function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = { getStandard, getStandards, firstRow, knownKeys, seedRows };
