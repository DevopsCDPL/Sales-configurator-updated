/**
 * Anthropic Claude provider stub.
 * Wire actual SDK calls when chat surface is built out.
 */

async function complete({ system, messages /*, tenantId, userId */ }) {
  // TODO: call Anthropic Messages API
  return {
    text: '[claude stub] ' + (messages?.[messages.length - 1]?.content || ''),
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

async function parseIntent({ input /*, tenantId, userId */ }) {
  // Claude can also do intent parsing if escalated from the cheap classifier.
  return {
    intent: 'unknown',
    entities: {},
    confidence: 0,
    rawInput: input,
  };
}

module.exports = { complete, parseIntent };
