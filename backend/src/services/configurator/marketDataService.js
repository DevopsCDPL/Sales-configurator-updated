'use strict';

/**
 * marketDataService.js — COMEX copper price provider.
 *
 * Direct port of `config/backend/app/services/market_data.py`. Scrapes
 * `comexlive.org/copper/` (HTML), with provider-switch fallback to a
 * deterministic "demo" price for offline / CI environments.
 *
 * Cached in-memory (per-process) for `MARKETDATA_CACHE_TTL` seconds.
 * Snapshots are persisted via `ConfiguratorComexCopperSnapshot` so
 * historical lookups survive process restarts.
 */

const { ConfiguratorComexCopperSnapshot } = require('../../models');
const logger = require('../../utils/logger');

const PROVIDER         = (process.env.MARKETDATA_PROVIDER || 'comexlive').toLowerCase();
const COMEX_URL        = process.env.COMEXLIVE_COPPER_URL || 'https://comexlive.org/copper/';
const HTTP_TIMEOUT_MS  = (Number(process.env.COMEXLIVE_HTTP_TIMEOUT) || 20) * 1000;
const USER_AGENT       = process.env.COMEXLIVE_USER_AGENT
  || 'Mozilla/5.0 (compatible; ForgeConfigurator/1.0)';
const CACHE_TTL_MS     = (Number(process.env.MARKETDATA_CACHE_TTL) || 600) * 1000;

const _cache = { value: null, expiresAt: 0 };

/**
 * Extract the first plausible spot price from comexlive.org HTML.
 * Mirrors the Python regex extraction: looks for "$X.YYY" near "Copper".
 */
function _extractPriceFromHtml(html) {
  // Try to find a "data-..." or simple "$X.YY" near "Copper Price" / "USD/lb"
  const candidates = [
    /Copper[^$]{0,80}\$\s*([0-9]+\.[0-9]{2,4})/i,
    /\$\s*([0-9]+\.[0-9]{2,4})\s*(?:USD)?\s*\/\s*lb/i,
    /"price"\s*:\s*"([0-9]+\.[0-9]{2,4})"/i,
    /\bprice\b[^0-9]{0,20}([0-9]+\.[0-9]{2,4})/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m && m[1]) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > 0 && v < 100) return v;
    }
  }
  return null;
}

async function _fetchComexLive() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(COMEX_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`comexlive HTTP ${res.status}`);
    const html = await res.text();
    const price = _extractPriceFromHtml(html);
    if (!price) throw new Error('Could not parse price from comexlive HTML');
    return { price, source: 'comexlive.org' };
  } finally {
    clearTimeout(timer);
  }
}

function _demoPrice() {
  // Stable seasonal-ish demo — keeps tests deterministic on a given day.
  const day = new Date().toISOString().slice(0, 10);
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  const base = 4.20;
  const jitter = (h % 60) / 100; // 0.00 - 0.59
  return { price: Number((base + jitter).toFixed(4)), source: 'demo' };
}

/**
 * Get current copper spot price.
 *   { price, currency: 'USD', unit: 'USD/lb', source, asOf }
 *
 * Caches in-process for CACHE_TTL_MS.
 * Persists a daily snapshot via ConfiguratorComexCopperSnapshot when companyId is supplied.
 */
async function getCopperPrice({ companyId } = {}) {
  const now = Date.now();
  if (_cache.value && _cache.expiresAt > now) {
    return _cache.value;
  }

  let priceInfo;
  try {
    if (PROVIDER === 'demo') {
      priceInfo = _demoPrice();
    } else if (PROVIDER === 'comexlive') {
      priceInfo = await _fetchComexLive();
    } else {
      // metalsapi / quandl not yet ported — fall back to demo
      logger.warn({ provider: PROVIDER }, '[marketdata] provider not implemented; using demo');
      priceInfo = _demoPrice();
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[marketdata] live fetch failed; falling back to demo');
    priceInfo = _demoPrice();
  }

  const payload = {
    price: priceInfo.price,
    currency: 'USD',
    unit: 'USD/lb',
    source: priceInfo.source,
    asOf: new Date().toISOString(),
  };

  _cache.value = payload;
  _cache.expiresAt = now + CACHE_TTL_MS;

  if (companyId) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await ConfiguratorComexCopperSnapshot.findOrCreate({
        where: { company_id: companyId, captured_on: today },
        defaults: {
          company_id: companyId,
          captured_on: today,
          price_per_lb: priceInfo.price,
          currency: 'USD',
          source: priceInfo.source,
          raw_payload: { fetched_at: payload.asOf },
        },
      });
    } catch (err) {
      logger.warn({ err: err.message }, '[marketdata] snapshot persist failed (non-fatal)');
    }
  }

  return payload;
}

/**
 * Get historical snapshot for a specific date (YYYY-MM-DD).
 * Falls through to live price when no snapshot exists for today.
 */
async function getCopperPriceForDate(date, { companyId } = {}) {
  const iso = String(date).slice(0, 10);
  if (companyId) {
    const snap = await ConfiguratorComexCopperSnapshot.findOne({
      where: { company_id: companyId, captured_on: iso },
    });
    if (snap) {
      return {
        price: Number(snap.price_per_lb),
        currency: snap.currency || 'USD',
        unit: 'USD/lb',
        source: snap.source || 'snapshot',
        asOf: iso,
      };
    }
  }
  // No snapshot — only return live for today; otherwise null.
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return getCopperPrice({ companyId });
  return null;
}

module.exports = {
  getCopperPrice,
  getCopperPriceForDate,
  _extractPriceFromHtml, // exported for unit tests
};
