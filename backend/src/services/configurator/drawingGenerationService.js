'use strict';

/**
 * drawingGenerationService.js — proxy to the SolidWorks drawing-generation API.
 *
 * Wraps the legacy `config/backend/app/routers/solidworks.py` proxy with:
 *   • Per-call timeout (default 30s, configurable via env)
 *   • Graceful 503 fallback when the upstream is unreachable
 *   • Automatic injection of `ngrok-skip-browser-warning: true` header
 *
 * NEVER throws on connection-refused / timeout — converts to
 * `{ ok: false, status: 503, fallback: true, error: '...' }` so the
 * controller can return a safe JSON response.
 *
 * NOTE: This is a thin pass-through. SLD diagrams are a SEPARATE
 * concept (see `ConfiguratorSldDocument`) and are NOT created here.
 */

const logger = require('../../utils/logger');

const SW_URL          = process.env.SOLIDWORKS_API_URL || 'http://localhost:5100';
const SW_TIMEOUT_MS   = Number(process.env.SOLIDWORKS_TIMEOUT_MS) || 30000;

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'ngrok-skip-browser-warning': 'true',
};

async function _request(method, pathSuffix, { json, query } = {}) {
  let url = `${SW_URL.replace(/\/$/, '')}${pathSuffix}`;
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams(query).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SW_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...DEFAULT_HEADERS,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
      signal: ac.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else if (contentType.startsWith('text/')) {
      body = await res.text().catch(() => null);
    } else {
      body = await res.arrayBuffer().catch(() => null);
    }
    return { ok: res.ok, status: res.status, body, headers: res.headers, contentType };
  } catch (err) {
    const isAbort = err.name === 'AbortError';
    logger.warn({ err: err.message, url, isAbort },
      '[configurator/drawing] upstream unreachable — returning fallback');
    return {
      ok: false,
      status: 503,
      fallback: true,
      error: isAbort ? 'SolidWorks API timed out' : `SolidWorks API unreachable: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  return _request('GET', '/api/health');
}

async function listJobs() {
  return _request('GET', '/Drawings/jobs');
}

async function getJob(jobId) {
  return _request('GET', `/Drawings/jobs/${encodeURIComponent(jobId)}`);
}

async function listJobFiles(jobId) {
  return _request('GET', `/Drawings/jobs/${encodeURIComponent(jobId)}/files`);
}

async function downloadJobFile(jobId, filename) {
  return _request('GET', `/Drawings/jobs/${encodeURIComponent(jobId)}/download`, {
    query: { file: filename },
  });
}

const ALLOWED_BREAKERS = ['ABB', 'SCHNEIDER', 'SIEMENS'];

async function createDrawing({ folderName, panelCount, circuitBreakerBrand }) {
  if (!folderName || folderName.length < 1 || folderName.length > 200) {
    const err = new Error('folderName must be 1..200 chars'); err.status = 422; throw err;
  }
  if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 20) {
    const err = new Error('panelCount must be an integer 1..20'); err.status = 422; throw err;
  }
  const brand = String(circuitBreakerBrand || '').toUpperCase();
  if (!ALLOWED_BREAKERS.includes(brand)) {
    const err = new Error(`circuitBreakerBrand must be one of ${ALLOWED_BREAKERS.join(', ')}`);
    err.status = 422; throw err;
  }

  return _request('POST', '/Drawings/create', {
    json: { folderName, panelCount, circuitBreakerBrand: brand },
  });
}

module.exports = {
  health,
  listJobs,
  getJob,
  listJobFiles,
  downloadJobFile,
  createDrawing,
  ALLOWED_BREAKERS,
};
