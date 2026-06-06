/**
 * AI controller — thin layer.
 * Reads input from request, calls service, returns standardized envelope.
 *
 * Auth has already happened by the time we get here (req.user is trusted).
 * Errors thrown from the service propagate to the central errorHandler.
 */

const aiService = require("../services/ai.service");
const orchestrator = require("../services/orchestrator.service");
const { ok } = require("../lib/errors");

async function handleChat(req, res, next) {
  try {
    const { message, confirm, reset } = req.body || {};
    // IMPORTANT: use req.user (set by auth middleware), NOT req.body.user.
    // Body-supplied identity is NOT trusted in production.
    const result = await aiService.processMessage(message, req.user, {
      confirm: !!confirm,
      reset: !!reset,
      requestId: req.id,
    });
    return res.json(ok(result, { requestId: req.id }));
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /ai/process — structured AI workflow endpoint.
 *
 * Returns ONLY typed JSON envelopes:
 *   { type: "input" | "selection" | "confirmation" | "error" | "success", ... }
 *
 * Body:
 *   {
 *     "message":    "<user text>",
 *     "session_id": "<optional, defaults to req.user.id>",
 *     "confirm":    boolean,
 *     "reset":      boolean
 *   }
 */
async function handleProcess(req, res, next) {
  try {
    const { message, session_id: sessionId, confirm, reset } = req.body || {};
    const envelope = await orchestrator.process({
      message,
      user: req.user,
      sessionId,
      confirm: !!confirm,
      reset: !!reset,
      requestId: req.id,
    });
    return res.json(envelope);
  } catch (err) {
    return next(err);
  }
}

module.exports = { handleChat, handleProcess };



