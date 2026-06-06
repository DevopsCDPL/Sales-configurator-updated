/**
 * Entity Service — slot-filling + sanitization.
 *
 * Responsibilities:
 *   - Merge a fresh detection with the in-flight session (mergeWithSession).
 *   - Coerce a raw follow-up reply into the expected field type, while
 *     refusing browse / help phrases (handled in ai.service.coerceValue).
 *   - Strip unknown / undefined keys before they reach the backend.
 */

"use strict";

const ai = require("./ai.service");

async function mergeWithSession(sessionId, detected, rawMessage, session) {
  return ai.mergeWithSession(sessionId, detected, rawMessage, session);
}

function coerce(field, raw) {
  return ai.coerceValue(field, raw);
}

function sanitize(intentName, entities) {
  return ai.sanitizeEntities(intentName, entities);
}

module.exports = { mergeWithSession, coerce, sanitize };
