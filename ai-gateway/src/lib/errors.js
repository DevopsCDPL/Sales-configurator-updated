/**
 * Standardized response + error envelope.
 *
 * All AI Gateway responses follow this shape:
 *   { status: "ok" | "error",
 *     code:   "OK" | "VALIDATION_ERROR" | "UNAUTHORIZED" | "RATE_LIMITED" | ...,
 *     data?:  <object>,
 *     error?: { message, details? },
 *     request_id: <string>      // echoed for cross-system tracing
 *   }
 *
 * Throw an `AppError` anywhere in the request pipeline; the error middleware
 * will convert it to this envelope with the right HTTP status.
 */

class AppError extends Error {
  constructor(code, message, { status = 400, details } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: { status: 400 },
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  RATE_LIMITED: { status: 429 },
  UPSTREAM_TIMEOUT: { status: 504 },
  UPSTREAM_ERROR: { status: 502 },
  INTERNAL_ERROR: { status: 500 },
});

/** Build a successful envelope. */
function ok(data, { code = "OK", requestId } = {}) {
  return {
    status: "ok",
    code,
    data,
    request_id: requestId,
  };
}

/** Build an error envelope (without HTTP-sending it). */
function fail(code, message, { details, requestId } = {}) {
  return {
    status: "error",
    code,
    error: { message, ...(details ? { details } : {}) },
    request_id: requestId,
  };
}

module.exports = { AppError, ERROR_CODES, ok, fail };
