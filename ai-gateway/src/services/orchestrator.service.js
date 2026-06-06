/**
 * Orchestrator Service — top-level pipeline for /ai/process.
 *
 *   user message
 *      │
 *      ▼
 *   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 *   │ intent.svc   │→ │ entity.svc   │→ │ state.svc    │
 *   └──────────────┘  └──────────────┘  └──────────────┘
 *                            │
 *                            ▼
 *                    ┌──────────────┐
 *                    │ validation   │
 *                    └──────────────┘
 *                            │  (if all required + confirmed)
 *                            ▼
 *                    ┌──────────────┐
 *                    │ action.svc   │
 *                    └──────────────┘
 *                            │
 *                            ▼
 *                    response.builder → typed JSON
 *
 * Implementation note: to avoid duplicating the carefully-tuned merge /
 * vendor-resolution / retry logic, the orchestrator delegates the whole
 * pipeline to ai.service.processMessage and then wraps the result with
 * response.builder. The modular files (intent / entity / validation /
 * action / state) re-export the same primitives so callers and tests
 * can use them directly without going through the orchestrator.
 */

"use strict";

const ai = require("./ai.service");
const state = require("./state.service");
const responseBuilder = require("./response.builder");
const logger = require("../lib/logger");

/**
 * @param {object} params
 * @param {string} params.message    User input.
 * @param {object} params.user       Authenticated user (req.user).
 * @param {string} [params.sessionId] Defaults to user.id.
 * @param {boolean}[params.confirm]
 * @param {boolean}[params.reset]
 * @param {string} [params.requestId]
 */
async function process(params) {
  const {
    message,
    user,
    sessionId: providedSession,
    confirm = false,
    reset = false,
    requestId,
  } = params || {};

  const sessionId = providedSession || user?.id || "anonymous";
  const log = logger.child({ request_id: requestId, session_id: sessionId, flow: "process" });

  if (reset) {
    await state.clear(sessionId);
    log.info("session reset");
  }

  // The legacy pipeline already keys sessions off user.id. We pass a synthetic
  // user object whose id is the desired sessionId so multi-session callers
  // (e.g. anonymous or out-of-band session ids) work transparently.
  const effectiveUser = user
    ? (user.id === sessionId ? user : { ...user, id: sessionId })
    : { id: sessionId, role: "guest" };

  const legacy = await ai.processMessage(message, effectiveUser, {
    confirm,
    reset: false, // already cleared above
    requestId,
  });

  const envelope = responseBuilder.build(legacy, { sessionId, requestId });
  log.info({ type: envelope.type, intent: envelope.intent }, "ai.process.response");
  return envelope;
}

module.exports = { process };
