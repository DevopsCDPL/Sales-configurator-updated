/**
 * Response Builder — converts the orchestrator's internal result envelope
 * into the strict, UI-driven JSON contract consumed by the frontend.
 *
 * Contract (MANDATORY — every /ai/process response):
 *
 *   {
 *     "type":       "input" | "selection" | "confirmation" | "error",
 *     "intent":     "<intent name>" | null,
 *     "session_id": "<string>",
 *     "message":    "<human readable prompt>",
 *     // type-specific fields:
 *     "field":      "<name>",                  // input
 *     "hint":       "<optional placeholder>",  // input
 *     "options":    [{ id, label }],           // selection
 *     "summary":    "<one-line preview>",      // confirmation
 *     "preview":    { ... },                   // confirmation
 *     "code":       "<machine code>",          // error
 *     "data":       { ... }                    // success / list payload
 *   }
 *
 * No plain-text or markdown anywhere. Frontend renders purely from `type`.
 */

"use strict";

// -- helpers -----------------------------------------------------------------

function normalizeItem(it, entityKind) {
  if (it == null) return null;
  if (typeof it === "string") return { id: it, label: it };
  const id = it.id || it._id || it.uuid || it[`${entityKind}_id`] || it.code || it.name;
  const label =
    it.name ||
    it.label ||
    it.title ||
    it.full_name ||
    it[`${entityKind}_name`] ||
    String(id);
  return { id: String(id), label: String(label), raw: it };
}

function toOptions(data, entityKind) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.[`${entityKind}s`])
    ? data[`${entityKind}s`]
    : [];
  return arr.map((it) => normalizeItem(it, entityKind)).filter(Boolean);
}

// -- main --------------------------------------------------------------------

/**
 * Build the typed UI envelope.
 *
 * @param {object} legacy  The shape returned by ai.service.processMessage:
 *                         { message, next_step, intent, result }
 * @param {object} ctx     { sessionId, requestId }
 */
function build(legacy, { sessionId, requestId } = {}) {
  const intentObj = legacy?.intent || {};
  const result = legacy?.result || {};
  const intentName = intentObj.intent || null;

  const base = {
    intent: intentName,
    session_id: sessionId || null,
    request_id: requestId || null,
  };

  // ----- error / unknown intent -------------------------------------------
  if (result.reason === "unknown_intent" || result.reason === "no_route") {
    return {
      ...base,
      type: "error",
      code: result.reason.toUpperCase(),
      message: result.message || "I didn't understand that.",
    };
  }
  if (result.executed === false && result.ok === false && !result.reason) {
    // Upstream/network failure path.
    return {
      ...base,
      type: "error",
      code: result.code || "UPSTREAM_ERROR",
      message: result.message || "Something went wrong.",
    };
  }

  // ----- needs more input -------------------------------------------------
  if (result.reason === "missing_fields" || result.next_step === "answer_question") {
    // A picker (suggestions[]) → selection. Otherwise → input.
    if (Array.isArray(result.suggestions) && result.suggestions.length) {
      return {
        ...base,
        type: "selection",
        field: result.next_field || null,
        message: result.message || result.question || "Please choose:",
        options: result.suggestions.map((s) =>
          typeof s === "string" ? { id: s, label: s } : normalizeItem(s, result.next_field)
        ),
        collected: result.collected || {},
      };
    }
    return {
      ...base,
      type: "input",
      field: result.next_field || (Array.isArray(result.pending) ? result.pending[0] : null),
      message: result.message || result.question || "Please provide more info.",
      hint: result.hint || null,
      collected: result.collected || {},
    };
  }

  // ----- yes/no confirm new vendor ---------------------------------------
  if (result.next_step === "confirm_new_vendor") {
    return {
      ...base,
      type: "confirmation",
      message: result.message,
      summary: result.question || result.message,
      options: [
        { id: "yes", label: "Yes, create it" },
        { id: "no", label: "No, pick another" },
      ],
      collected: result.collected || {},
    };
  }

  // ----- confirmation gate (critical intents) -----------------------------
  if (result.confirm === true || result.next_step === "confirm") {
    return {
      ...base,
      type: "confirmation",
      message: result.message,
      summary: result.summary || result.message,
      preview: result.preview || null,
    };
  }

  // ----- successful execution --------------------------------------------
  if (result.executed === true && result.ok === true) {
    // List intents → render as selection so the user can drill in.
    if (result.kind === "list") {
      const options = toOptions(result.data, result.entity);
      return {
        ...base,
        type: "selection",
        field: result.entity ? `${result.entity}_id` : null,
        message: options.length
          ? `Found ${options.length} ${result.entity || "item"}${options.length === 1 ? "" : "s"}. Pick one:`
          : `No ${result.entity || "item"}s found.`,
        options,
      };
    }
    return {
      ...base,
      type: "success",
      message: result.message || "Done.",
      data: result.data || null,
    };
  }

  // ----- catch-all --------------------------------------------------------
  return {
    ...base,
    type: "error",
    code: "UNHANDLED",
    message: legacy?.message || "Unhandled response.",
  };
}

module.exports = { build, toOptions };
