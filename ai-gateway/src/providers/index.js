/**
 * Provider registry.
 *
 * Routes by MODEL NAME so callers never reach into specific providers.
 *
 *   gpt-4o-mini, gpt-4o, gpt-*  → OpenAI provider
 *   anything else (claude-*, etc.) → Claude provider
 *
 * All providers must implement the same contract:
 *   complete({ system, messages, jsonMode, model, temperature }) → { text, usage }
 */

const openaiProvider = require("./openai.provider");
const claudeProvider = require("./claude.provider");

function getProvider(model) {
  if (typeof model === "string" && /^gpt[-_]/i.test(model)) {
    return openaiProvider;
  }
  return claudeProvider;
}

module.exports = { getProvider };

