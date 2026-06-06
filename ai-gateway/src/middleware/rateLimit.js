/**
 * Per-user rate limiter for /ai/chat.
 *
 * Defaults: 30 requests / minute per user (configurable via env).
 * Key derived from req.user.id (set by authMiddleware) — falls back to IP if
 * auth is disabled in dev. This means abusive users get throttled even if
 * they're behind the same NAT.
 *
 * Returns the standard error envelope on 429.
 */

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { fail } = require("../lib/errors");
const logger = require("../lib/logger");

const WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS || 60 * 1000);
const MAX = Number(process.env.AI_RATE_MAX || 30);

const chatLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Prefer authenticated user id; fall back to IP (IPv6-safe via helper).
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  handler: (req, res) => {
    logger.warn(
      { user_id: req.user?.id, ip: req.ip, request_id: req.id },
      "rate limit hit"
    );
    res.status(429).json(
      fail(
        "RATE_LIMITED",
        `Too many requests. Try again in ${Math.ceil(WINDOW_MS / 1000)}s.`,
        { requestId: req.id }
      )
    );
  },
});

module.exports = { chatLimiter };
