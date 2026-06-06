/**
 * HTTP client with timeout + retry.
 *
 * - Default timeout: 15s (overridable per-call)
 * - Retries: idempotent calls only (GET / HEAD / OPTIONS), max `retries` attempts
 *            with exponential backoff (200ms, 600ms). Critical mutating calls
 *            (POST/PUT/PATCH/DELETE) are NEVER retried automatically — duplicate
 *            POs / invoices would be a disaster.
 * - Retries fire only on network errors and 5xx (NOT 4xx).
 *
 * Returns a structured outcome:
 *   { ok: true,  status, data }
 *   { ok: false, status, error, code: "TIMEOUT" | "NETWORK" | "HTTP_ERROR" }
 */

const axios = require("axios");
const logger = require("./logger");

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_HTTP_TIMEOUT_MS || 15000);
const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS"]);

function classifyError(err) {
  if (err.code === "ECONNABORTED" || /timeout/i.test(err.message || "")) return "TIMEOUT";
  if (!err.response) return "NETWORK";
  return "HTTP_ERROR";
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * @param {object} opts                axios request config
 * @param {object} [extra]
 * @param {number} [extra.timeout]     ms; default DEFAULT_TIMEOUT_MS
 * @param {number} [extra.retries]     max retries for idempotent verbs; default 2
 * @param {boolean}[extra.allowRetry]  force-allow retries for non-idempotent verbs (DANGEROUS)
 */
async function request(opts, extra = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const timeout = extra.timeout || DEFAULT_TIMEOUT_MS;
  const maxRetries = extra.retries == null ? 2 : extra.retries;
  const isIdempotent = IDEMPOTENT.has(method) || extra.allowRetry === true;

  const config = { ...opts, method, timeout };

  let attempt = 0;
  // attempt 0 = first try; up to maxRetries additional attempts for idempotent verbs.
  while (true) {
    try {
      const res = await axios.request(config);
      return { ok: true, status: res.status, data: res.data };
    } catch (err) {
      const code = classifyError(err);
      const status = err.response?.status || 0;
      const retryable =
        isIdempotent && attempt < maxRetries && (code === "TIMEOUT" || code === "NETWORK" || status >= 500);

      logger.warn(
        {
          method,
          url: opts.url,
          attempt,
          code,
          status,
          err: err.message,
          retryable,
        },
        "http call failed"
      );

      if (!retryable) {
        return {
          ok: false,
          status: status || 0,
          code,
          error:
            err.response?.data?.error ||
            err.response?.data?.message ||
            err.message ||
            "Unknown HTTP error",
        };
      }

      attempt += 1;
      const backoff = 200 * Math.pow(3, attempt - 1); // 200ms, 600ms
      await sleep(backoff);
    }
  }
}

module.exports = { request, DEFAULT_TIMEOUT_MS };
