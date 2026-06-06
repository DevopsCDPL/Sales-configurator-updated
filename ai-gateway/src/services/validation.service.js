/**
 * Validation Service — required-field + policy gates.
 *
 *   - validateEntities(intent, entities) → { valid, missing[] }
 *   - validatePolicy(intent, user)       → throws AppError(FORBIDDEN) on deny
 *
 * Both delegate to ai.service to keep a single source of truth.
 */

"use strict";

const ai = require("./ai.service");

function validateEntities(intentName, entities) {
  return ai.validateEntities(intentName, entities);
}

async function validatePolicy(intent, user) {
  return ai.validatePolicy(intent, user);
}

module.exports = { validateEntities, validatePolicy };
