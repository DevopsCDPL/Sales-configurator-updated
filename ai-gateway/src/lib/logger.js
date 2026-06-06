/**
 * Structured logger (pino).
 * Emits one JSON line per event; ready for ingestion by Loki/Datadog/CloudWatch.
 *
 * Usage:
 *   const log = require("./lib/logger");
 *   log.info({ user_id, intent, result }, "ai.exec ok");
 *   log.warn({ err: err.message }, "openai timeout, falling back");
 *
 * In dev (NODE_ENV !== "production") output is pretty-printed if pino-pretty
 * is installed; otherwise raw JSON. Either way the SAME structured fields are
 * emitted, so log shipping behaviour is identical.
 */

const pino = require("pino");

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

let transport;
if (process.env.NODE_ENV !== "production") {
  try {
    require.resolve("pino-pretty");
    transport = { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss.l" } };
  } catch { /* pretty not installed — fall through to raw JSON */ }
}

const logger = pino({
  level,
  base: { service: "ai-gateway" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.api_key",
      "*.apiKey",
    ],
    remove: true,
  },
  ...(transport ? { transport } : {}),
});

module.exports = logger;
