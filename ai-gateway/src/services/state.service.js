/**
 * State Service — session lifecycle for the AI orchestrator.
 *
 * Tracks per-user conversation state:
 *   { intent, entities (collected_data), asking (current_step), updatedAt }
 *
 * Storage is delegated to lib/sessionStore (Redis if REDIS_URL is set,
 * in-process Map otherwise) — same store the legacy /ai/chat flow uses,
 * so a session created by either endpoint is visible to the other.
 *
 * The `session_id` is the authenticated user id (req.user.id). For anonymous
 * callers the controller may pass a client-supplied id. We do NOT trust
 * client-supplied ids when an authenticated user exists.
 */

"use strict";

const sessionStore = require("../lib/sessionStore");

async function get(sessionId) {
  if (!sessionId) return null;
  return sessionStore.get(sessionId);
}

async function set(sessionId, { intent, entities, asking } = {}) {
  if (!sessionId) return;
  await sessionStore.set(sessionId, {
    intent: intent || null,
    entities: entities && typeof entities === "object" ? entities : {},
    asking: asking || null,
  });
}

async function clear(sessionId) {
  if (!sessionId) return;
  await sessionStore.clear(sessionId);
}

function describe() {
  return sessionStore.describe();
}

module.exports = { get, set, clear, describe };
