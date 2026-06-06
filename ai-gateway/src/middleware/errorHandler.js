/**
 * Centralised request-id assignment + error handler.
 *
 * - requestId(): attaches req.id (uuid v4) and echoes it as X-Request-Id.
 * - notFound(): catches unmatched routes.
 * - errorHandler(): converts AppError or any thrown value into the standard
 *   error envelope. Always logs with request_id so traces are correlatable.
 */

const { v4: uuidv4 } = require("uuid");
const { AppError, ERROR_CODES, fail } = require("../lib/errors");
const logger = require("../lib/logger");

function requestId(req, res, next) {
  req.id = req.headers["x-request-id"] || uuidv4();
  res.setHeader("X-Request-Id", req.id);
  next();
}

function notFound(req, _res, next) {
  next(new AppError("NOT_FOUND", `No route for ${req.method} ${req.path}`, { status: 404 }));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let appErr;
  if (err instanceof AppError) {
    appErr = err;
  } else {
    appErr = new AppError(
      "INTERNAL_ERROR",
      err?.message || "Internal server error",
      { status: err?.status || 500 }
    );
  }
  const httpStatus =
    appErr.status || ERROR_CODES[appErr.code]?.status || 500;

  logger[httpStatus >= 500 ? "error" : "warn"](
    {
      request_id: req.id,
      user_id: req.user?.id,
      route: `${req.method} ${req.path}`,
      code: appErr.code,
      status: httpStatus,
      err: appErr.message,
      stack: httpStatus >= 500 ? err?.stack : undefined,
    },
    "request failed"
  );

  res
    .status(httpStatus)
    .json(fail(appErr.code, appErr.message, { details: appErr.details, requestId: req.id }));
}

module.exports = { requestId, notFound, errorHandler };
