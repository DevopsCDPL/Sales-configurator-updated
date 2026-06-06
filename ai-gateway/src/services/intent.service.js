/**
 * Intent Service — classifies a user message into a structured intent.
 *
 * Thin wrapper over the existing pipeline in services/ai.service.detectIntent
 * (LLM + keyword pre-classifier + reconciler). Kept as its own module so the
 * orchestrator can mock / swap it without dragging the whole legacy service.
 */

"use strict";

const ai = require("./ai.service");
const classifier = require("../lib/intentClassifier");

/**
 * @param {string} message Raw user input.
 * @param {object} user    Authenticated user (req.user).
 * @returns {Promise<{intent:string, entities:object, fallback?:boolean}>}
 */
async function detect(message, user, opts = {}) {
  return ai.detectIntent(message, user, opts);
}

function isBrowsePhrase(text) {
  return classifier.isBrowsePhrase(text);
}

function supportedIntents() {
  return classifier.SUPPORTED_INTENTS.slice();
}

module.exports = { detect, isBrowsePhrase, supportedIntents };
