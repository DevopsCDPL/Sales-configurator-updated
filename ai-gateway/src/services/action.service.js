/**
 * Action Service — executes a fully-validated intent against the backend.
 *
 * Wraps ai.service.executeAction so the orchestrator has a clean surface.
 * The underlying executor still owns:
 *   - vendor resolution (fuzzy match against real list)
 *   - missing-field re-prompt (returns reason: "missing_fields")
 *   - confirmation gate for CRITICAL_INTENTS
 *   - retry policy (idempotent GETs only)
 */

"use strict";

const ai = require("./ai.service");

/**
 * @param {object} intent  { intent, entities, ... } as returned by intent + entity merge.
 * @param {object} user    Authenticated user.
 * @param {object} options { confirm, rawMessage, hadSession, intentChanged, log }
 * @returns {Promise<object>} Internal result envelope (see ai.service.executeAction).
 */
async function execute(intent, user, options = {}) {
  const policy = await ai.validatePolicy(intent, user);
  return ai.executeAction(intent, policy, user, options);
}

function getRoute(intentName) {
  return ai.INTENT_ROUTES[intentName] || null;
}

function isCritical(intentName) {
  return ai.CRITICAL_INTENTS.has(intentName);
}

module.exports = { execute, getRoute, isCritical };
