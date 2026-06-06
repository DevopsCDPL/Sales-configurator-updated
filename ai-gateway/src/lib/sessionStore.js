/**
 * Persistent session store.
 *
 * Strategy:
 *   - If REDIS_URL is set → use Redis (sessions survive restarts, multi-instance safe).
 *   - Otherwise          → in-process Map (dev / single-instance fallback).
 *
 * Public API is async + uniform across both backends so callers don't care
 * which one is in use.
 *
 * Keys: ai:session:<userId>     (session payload, JSON, TTL = SESSION_TTL_MS)
 *       ai:rl:<userId>:<bucket> (rate-limit counters; managed by middleware/rateLimit)
 */

const logger = require("./logger");

const SESSION_TTL_MS = Number(process.env.AI_SESSION_TTL_MS || 10 * 60 * 1000);
const SESSION_TTL_SEC = Math.ceil(SESSION_TTL_MS / 1000);
const KEY = (userId) => `ai:session:${userId}`;

let backend = "memory";
let redis = null;
const memoryStore = new Map();

function init() {
  if (!process.env.REDIS_URL) {
    logger.info({ backend: "memory", ttl_ms: SESSION_TTL_MS }, "session store initialised");
    return;
  }
  try {
    const Redis = require("ioredis");
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout: 5000,
    });
    redis.on("error", (err) => logger.warn({ err: err.message }, "redis error"));
    redis.on("connect", () => logger.info({ backend: "redis" }, "session store connected"));
    backend = "redis";
  } catch (err) {
    logger.warn({ err: err.message }, "ioredis not available, falling back to in-memory session store");
  }
}

async function get(userId) {
  if (backend === "redis" && redis?.status === "ready") {
    try {
      const raw = await redis.get(KEY(userId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      logger.warn({ err: err.message, user_id: userId }, "session get failed (redis), falling back to memory");
    }
  }
  const s = memoryStore.get(userId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    memoryStore.delete(userId);
    return null;
  }
  return s;
}

async function set(userId, payload) {
  const value = { ...payload, updatedAt: Date.now() };
  if (backend === "redis" && redis?.status === "ready") {
    try {
      await redis.set(KEY(userId), JSON.stringify(value), "EX", SESSION_TTL_SEC);
      return;
    } catch (err) {
      logger.warn({ err: err.message, user_id: userId }, "session set failed (redis), falling back to memory");
    }
  }
  memoryStore.set(userId, value);
}

async function clear(userId) {
  if (backend === "redis" && redis?.status === "ready") {
    try { await redis.del(KEY(userId)); } catch { /* swallow */ }
  }
  memoryStore.delete(userId);
}

function describe() {
  return { backend, ttl_ms: SESSION_TTL_MS, redis_status: redis?.status || null };
}

init();

module.exports = { get, set, clear, describe, SESSION_TTL_MS };
