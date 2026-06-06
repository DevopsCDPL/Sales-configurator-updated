/**
 * OpenAI provider.
 * Wraps the Chat Completions API.
 */

const axios = require("axios");

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * complete()
 *  - system: system prompt string
 *  - messages: [{ role, content }, ...]
 *  - jsonMode: when true, forces JSON object response
 *  - model: override default model
 *  - temperature: defaults to 0
 */
async function complete({ system, messages = [], jsonMode = false, model, temperature = 0 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const payload = {
    model: model || DEFAULT_MODEL,
    temperature,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages,
    ],
  };
  if (jsonMode) payload.response_format = { type: "json_object" };

  const { data } = await axios.post(OPENAI_URL, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });

  return {
    text: data.choices?.[0]?.message?.content || "",
    usage: data.usage || {},
    raw: data,
  };
}

module.exports = { complete };

