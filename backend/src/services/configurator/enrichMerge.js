'use strict';

/**
 * enrichMerge.js — pure helper functions for the catalog enrichment pipeline.
 *
 * Exported:
 *   mergeSpec(existingSpec, row)  -> merged specifications object
 *   decidePrice(existingPriceStatus, existingPrice, row)
 *                                 -> { price, price_status }
 *
 * Rules (never clobber existing non-empty):
 *   - name, description, image_url: existing wins if non-empty
 *   - FIRM price is untouched; ESTIMATED/PENDING_RFQ may be updated by
 *     cheapest(vendorOffers, listPrice)
 *   - vendorOffers: dedupe by vendor+sku, newest seenAt wins
 *   - qualityRating, popularity, productUrl, datasheetUrl, model3dUrl,
 *     priceSource, catalogNumber, manufacturer: scraped fills empty slots
 */

// --- Vendor-offer merge -------------------------------------------------------

/**
 * Merge two arrays of vendor offers, deduping by (vendor, sku).
 * When the same vendor+sku appears in both, the one with the newer seenAt wins.
 */
function mergeVendorOffers(existingOffers, newOffers) {
  const existing = Array.isArray(existingOffers) ? existingOffers : [];
  const incoming = Array.isArray(newOffers) ? newOffers : [];

  const map = new Map();

  for (const offer of existing) {
    const key = `${String(offer.vendor || '').toLowerCase()}|${String(offer.sku || '').toLowerCase()}`;
    map.set(key, offer);
  }

  for (const offer of incoming) {
    const key = `${String(offer.vendor || '').toLowerCase()}|${String(offer.sku || '').toLowerCase()}`;
    if (map.has(key)) {
      const prev = map.get(key);
      const prevDate = prev.seenAt ? new Date(prev.seenAt).getTime() : 0;
      const newDate  = offer.seenAt ? new Date(offer.seenAt).getTime() : 0;
      if (newDate >= prevDate) {
        map.set(key, offer);
      }
    } else {
      map.set(key, offer);
    }
  }

  return Array.from(map.values());
}

// --- mergeSpec ----------------------------------------------------------------

/**
 * Merge an enrichment row's spec fields into the existing specifications object.
 * Existing non-empty values always win over scraped values.
 */
function mergeSpec(existingSpec, row) {
  const ex = existingSpec && typeof existingSpec === 'object' ? existingSpec : {};
  const out = { ...ex };

  const mergedOffers = mergeVendorOffers(ex.vendorOffers, row.vendorOffers);
  if (mergedOffers.length > 0) {
    out.vendorOffers = mergedOffers;
  }

  if (row.manufacturerPartNumber != null && row.manufacturerPartNumber !== '') {
    if (!ex.catalogNumber) {
      out.catalogNumber = row.manufacturerPartNumber;
    }
  }

  if (row.manufacturer != null && row.manufacturer !== '') {
    if (!ex.manufacturer) {
      out.manufacturer = row.manufacturer;
    }
  }

  if (row.spec && typeof row.spec === 'object') {
    for (const [k, v] of Object.entries(row.spec)) {
      if (v == null || v === '') continue;
      if (ex[k] == null || ex[k] === '') {
        out[k] = v;
      }
    }
  }

  const scalarFields = [
    ['qualityRating', row.qualityRating],
    ['popularity',    row.popularity],
    ['productUrl',    row.productUrl],
    ['datasheetUrl',  row.datasheetUrl],
    ['model3dUrl',    row.model3dUrl],
  ];
  for (const [k, v] of scalarFields) {
    if (v != null && v !== '') {
      if (ex[k] == null || ex[k] === '') {
        out[k] = v;
      }
    }
  }

  if (!ex.priceSource) {
    out.priceSource = 'web';
  }

  return out;
}

// --- decidePrice --------------------------------------------------------------

/**
 * Decide the updated price and price_status given current state and an
 * enrichment row.
 *
 * Rules:
 *   - FIRM price is NEVER touched.
 *   - If cheapest(vendorOffers, listPrice) is available -> price + ESTIMATED.
 *   - Otherwise leave existing as-is.
 */
function decidePrice(existingPriceStatus, existingPrice, row) {
  if (existingPriceStatus === 'FIRM') {
    return { price: existingPrice, price_status: 'FIRM' };
  }

  const candidates = [];

  if (Array.isArray(row.vendorOffers)) {
    for (const offer of row.vendorOffers) {
      if (typeof offer.price === 'number' && offer.price > 0) {
        candidates.push(offer.price);
      }
    }
  }

  if (typeof row.listPrice === 'number' && row.listPrice > 0) {
    candidates.push(row.listPrice);
  }

  if (candidates.length > 0) {
    const cheapest = Math.min(...candidates);
    return { price: cheapest, price_status: 'ESTIMATED' };
  }

  return { price: existingPrice, price_status: existingPriceStatus || 'PENDING_RFQ' };
}

module.exports = { mergeSpec, decidePrice, mergeVendorOffers };
