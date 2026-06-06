'use strict';

/**
 * categoryUtils.js — port of `config/backend/app/services/category_utils.py`
 * + the EXPANSIONS synonym map from `routers/components.py`.
 */

function normalizeCategory(name) {
  if (!name) return '';
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function canonicalDisplay(name) {
  if (!name) return '';
  return String(name).toUpperCase().trim().replace(/\s+/g, ' ');
}

/**
 * Synonym expansion — verbatim from Python EXPANSIONS map.
 * Key = canonical name (UPPER); value = list of acceptable synonyms.
 */
const EXPANSIONS = {
  'CU':              ['COPPER BUSSING', 'COPPER BUSBAR', 'COPPER'],
  'SPD':             ['SURGE PROTECTION DEVICE', 'SURGE PROTECTION'],
  'ATS':             ['AUTOMATIC TRANSFER SWITCH'],
  'WIRE CABLE':      ['WIRE & CABLE', 'WIRE AND CABLE', 'WIRE'],
  'CIRCUIT BREAKER': ['CIRCUIT BREAKERS', 'BREAKER', 'BREAKERS'],
  'CONTROLS':        ['CONTROL'],
  'CONDUIT':         ['CONDUIT & FITTINGS', 'CONDUIT AND FITTINGS'],
  'ENCLOSURE':       ['ENCLOSURES'],
  'CAMLOCK':         ['CAM LOCK'],
  'STANDARD BOM':    ['STANDARD PRODUCT', 'STANDARD BOM ITEM', 'STANDARD BOM ITEMS'],
};

/**
 * Build a Set of normalized synonyms for a query category.
 */
function expandCategory(rawCategory) {
  const canon = canonicalDisplay(rawCategory);
  const norm = normalizeCategory(rawCategory);
  const variants = new Set([canon, norm]);
  // direct lookup
  const direct = EXPANSIONS[canon];
  if (direct) {
    for (const v of direct) {
      variants.add(canonicalDisplay(v));
      variants.add(normalizeCategory(v));
    }
  }
  // reverse lookup — if user typed a synonym, accept the canonical
  for (const [canonKey, syns] of Object.entries(EXPANSIONS)) {
    if (syns.some((s) => normalizeCategory(s) === norm)) {
      variants.add(canonKey);
      variants.add(normalizeCategory(canonKey));
      for (const s of syns) {
        variants.add(canonicalDisplay(s));
        variants.add(normalizeCategory(s));
      }
    }
  }
  return Array.from(variants).filter(Boolean);
}

module.exports = {
  normalizeCategory,
  canonicalDisplay,
  expandCategory,
  EXPANSIONS,
};
