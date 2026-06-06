/**
 * AI service — orchestration flow.
 *
 * Layers (kept clean):
 *   1. detectIntent()       — LLM / keyword classification
 *   2. validatePolicy()     — role + tenant + business gate
 *   3. fetchVendors()       — reference-data resolution (cached)
 *   4. validateEntities()   — required-field check
 *   5. executeAction()      — backend call (timeout + retry for idempotent verbs)
 *
 * Cross-cutting concerns (logging, sessions, http retries) live in src/lib/.
 */

const axios = require("axios");
const { getProvider } = require("../providers");
const logger = require("../lib/logger");
const sessionStore = require("../lib/sessionStore");
const httpClient = require("../lib/httpClient");
const intentClassifier = require("../lib/intentClassifier");
const fuzzy = require("../lib/fuzzyMatch");

const FORGE_BACKEND_URL = process.env.FORGE_BACKEND_URL || "http://localhost:5000";
const OPENAI_TIMEOUT_MS = Number(process.env.AI_OPENAI_TIMEOUT_MS || 12000);
const BACKEND_TIMEOUT_MS = Number(process.env.AI_BACKEND_TIMEOUT_MS || 15000);

// Intent → Forge backend API mapping. STATIC. Never AI-generated.
// `kind` (when set) marks the intent as a *list / picker* intent — the action
// service returns it as a `selection`-typed response, not as a plain payload.
const INTENT_ROUTES = {
  create_po:    { method: "POST", path: "/api/po" },
  get_vendors:  { method: "GET",  path: "/api/vendors",   kind: "list", entity: "vendor"   },
  get_clients:  { method: "GET",  path: "/api/clients",   kind: "list", entity: "client"   },
  get_materials:{ method: "GET",  path: "/api/materials", kind: "list", entity: "material" },
  get_projects: { method: "GET",  path: "/api/projects",  kind: "list", entity: "project"  },
};

// Per-intent contract: required fields + whitelist of allowed payload fields.
// Anything outside `allowed` is dropped before the backend call.
const INTENT_SCHEMAS = {
  create_po: {
    required: ["vendor_name"],
    requiredAny: [["quantity", "amount"]], // at least one of each group
    allowed: ["vendor_name", "material", "quantity", "unit", "amount", "project_id", "notes"],
  },
  get_vendors:   { required: [], requiredAny: [], allowed: ["search", "limit", "offset"] },
  get_clients:   { required: [], requiredAny: [], allowed: ["search", "limit", "offset"] },
  get_materials: { required: [], requiredAny: [], allowed: ["search", "limit", "offset"] },
  get_projects:  { required: [], requiredAny: [], allowed: ["search", "limit", "offset"] },
};

// Friendly prompts for missing fields (used by the multi-step flow).
// `question` is the default prompt. `contextual(known)` returns a phrasing that
// uses already-collected entities. `hint` and `suggestions` are optional UX aids.
const FIELD_META = {
  vendor_name: {
    question: "Which vendor should I create the PO for?",
    contextual: (k) =>
      k.material
        ? `Which vendor should I order ${k.material} from?`
        : "Which vendor should I create the PO for?",
    hint: "e.g. Tata Steel, Acme Corp",
  },
  material: {
    question: "Which material is this PO for?",
    contextual: (k) =>
      k.vendor_name ? `Which material should I order from ${k.vendor_name}?` : "Which material is this PO for?",
    hint: "e.g. steel, aluminium, copper rods",
  },
  quantity: {
    question: "What quantity?",
    contextual: (k) =>
      k.material ? `How much ${k.material}?` : "What quantity?",
    hint: "e.g. 50 kg, 100 pcs",
  },
  unit: {
    question: "What unit of measure?",
    contextual: () => "What unit of measure?",
    hint: "kg, pcs, m, l, etc.",
  },
  amount: {
    question: "What is the total amount?",
    contextual: (k) =>
      k.vendor_name ? `What is the total amount for ${k.vendor_name}?` : "What is the total amount?",
    hint: "e.g. 5000",
  },
  project_id: {
    question: "Which project should this be linked to?",
    contextual: () => "Which project should this be linked to?",
    hint: "Project ID or name",
  },
  notes: {
    question: "Any notes to include?",
    contextual: () => "Any notes to include?",
  },
  // Composite (`requiredAny`) prompts.
  "quantity or amount": {
    question: "How much — quantity (e.g. 50 kg) or total amount (e.g. ₹5000)?",
    contextual: (k) =>
      k.vendor_name
        ? `How much for ${k.vendor_name} — quantity (e.g. 50 kg) or total amount (e.g. ₹5000)?`
        : "How much — quantity (e.g. 50 kg) or total amount (e.g. ₹5000)?",
    hint: "You can answer either way.",
  },
};

// Human-readable labels for each intent (used in summaries / messages).
const INTENT_LABELS = {
  create_po: "Create Purchase Order",
  create_rfq: "Create RFQ",
  generate_invoice: "Generate Invoice",
  get_vendors: "List Vendors",
};

// Conversation state lives in src/lib/sessionStore (Redis if REDIS_URL is set,
// in-process Map otherwise). Survives restarts when Redis is configured.

// Per-user reference-data cache (vendors, projects, materials...) so we don't
// hammer the backend on every follow-up turn.
const REF_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const refCache = new Map(); // key = `${userId}:${kind}` -> { items, fetchedAt }

// Mock reference data used when AI_MOCK=1 or backend is unreachable.
const MOCK_VENDORS = [
  { id: "v1", name: "Tata Steel" },
  { id: "v2", name: "JSW Steel" },
  { id: "v3", name: "Acme Corp" },
  { id: "v4", name: "Larsen & Toubro" },
  { id: "v5", name: "Jindal Steel" },
];

// Intents that must NEVER execute without explicit user confirmation.
const CRITICAL_INTENTS = new Set([
  "create_po",
  "create_rfq",
  "generate_invoice",
]);

// NOTE: The system prompt + few-shot examples now live in
// src/lib/intentClassifier.js. This file used to define INTENT_SYSTEM_PROMPT
// inline — keep this comment as a breadcrumb for anyone grepping for it.

async function processMessage(message, user, options = {}) {
  const { confirm = false, reset = false, requestId } = options;
  const reqId = requestId || Math.random().toString(36).slice(2, 10);
  const userId = user?.id || "anonymous";
  const log = logger.child({ request_id: reqId, user_id: userId });

  if (reset) await sessionStore.clear(userId);

  log.debug({ message }, "ai.received");

  // Step 1 — detect intent.
  const detected = await detectIntent(message, user, { log });
  log.info(
    { stage: "intent", intent: detected.intent, entities: detected.entities, fallback: !!detected.fallback },
    "ai.intent"
  );

  // Merge with any pending session (multi-step follow-up).
  const previousSession = await sessionStore.get(userId);
  const intent = await mergeWithSession(userId, detected, message, previousSession);
  if (intent !== detected) {
    log.debug({ intent: intent.intent, entities: intent.entities }, "ai.merged_session");
  }

  // Did the user switch to a different known intent mid-flow?
  const intentChanged =
    !!previousSession &&
    detected.intent !== "unknown" &&
    detected.intent !== previousSession.intent;
  if (intentChanged) {
    log.info({ from: previousSession.intent, to: detected.intent }, "ai.intent_changed");
  }

  // Step 2 — policy gate.
  const policy = await validatePolicy(intent, user);

  // Steps 3–5 — execute (with internal validation).
  const result = await executeAction(intent, policy, user, {
    confirm,
    rawMessage: message,
    hadSession: !!previousSession,
    intentChanged,
    log,
  });

  // Session lifecycle: keep session while waiting for input or confirmation,
  // clear it after a successful execution or a hard failure.
  if (result?.reason === "missing_fields" || result?.confirm === true) {
    await saveSession(userId, intent, result?.next_field || null);
  } else {
    await sessionStore.clear(userId);
  }

  // Standard response envelope: message + next_step + structured data.
  const response = {
    message: result?.message || "AI service working",
    next_step: result?.next_step || "none",
    intent,
    result,
  };
  log.info(
    { stage: "response", next_step: response.next_step, executed: !!result?.executed, ok: !!result?.ok },
    "ai.response"
  );
  return response;
}

// --- Session helpers --------------------------------------------------------
// Storage is delegated to lib/sessionStore (Redis-backed when REDIS_URL is set).

async function saveSession(userId, intent, asking) {
  await sessionStore.set(userId, {
    intent: intent.intent,
    entities: { ...(intent.entities || {}) },
    asking: asking || null,
  });
}

// If the user has a pending session and the new message either:
//  - re-confirms the same intent  → merge entities (new wins)
//  - returns intent=unknown       → treat the message as the value for the
//                                    first missing field of the pending intent
async function mergeWithSession(userId, detected, rawMessage, sessionArg) {
  const session = sessionArg !== undefined ? sessionArg : await sessionStore.get(userId);
  if (!session) return detected;

  // New, different intent → abandon old session, start fresh.
  if (detected.intent !== "unknown" && detected.intent !== session.intent) {
    return detected;
  }

  const merged = {
    ...detected,
    intent: session.intent,
    entities: { ...session.entities, ...(detected.entities || {}) },
  };

  // Special case: we were waiting for the user to approve creating a brand-new
  // vendor ("This vendor isn't in your list. Create it as a new vendor?").
  if (detected.intent === "unknown" && session.entities?._awaiting_new_vendor) {
    const reply = String(rawMessage || "").trim().toLowerCase();
    if (/^(y|yes|yeah|yep|sure|ok|okay|confirm|create)\b/.test(reply)) {
      merged.entities._allow_new_vendor = true;
      delete merged.entities._awaiting_new_vendor;
      merged.unparsed = false;
      return merged;
    }
    if (/^(n|no|nope|cancel|stop)\b/.test(reply)) {
      delete merged.entities._awaiting_new_vendor;
      delete merged.entities.vendor_name; // re-ask for vendor
      merged.unparsed = false;
      return merged;
    }
    // Unparsed answer to yes/no — keep waiting.
    merged.unparsed = true;
    return merged;
  }

  // If LLM gave unknown, try to slot the raw message into the next missing field.
  if (detected.intent === "unknown") {
    const before = JSON.stringify(merged.entities);

    // Prefer the field we explicitly asked about last turn (e.g. vendor_name
    // re-clarification after "multiple matches"). Otherwise fall back to the
    // first currently-missing field.
    let targetField = session.asking;
    if (!targetField) {
      const validation = validateEntities(session.intent, merged.entities);
      targetField = validation.missing[0];
    }
    if (targetField) {
      // Don't double-fill: if it's an "x or y" group and any alternative is
      // already satisfied (e.g. detected.entities.amount=5000), skip.
      const isGroup = targetField.includes(" or ");
      const groupSatisfied = isGroup && targetField.split(" or ").some(
        (k) => merged.entities[k] !== undefined && merged.entities[k] !== null && merged.entities[k] !== ""
      );
      if (!groupSatisfied) {
        const value = coerceValue(targetField, rawMessage);
        if (value !== undefined) {
          const fieldName = isGroup ? targetField.split(" or ")[0] : targetField;
          merged.entities[fieldName] = value;
        }
      }
    }
    // Mark whether this follow-up reply contributed anything usable.
    merged.unparsed = JSON.stringify(merged.entities) === before;
  }

  return merged;
}

// Light type coercion for follow-up answers.
//
// CRITICAL: for any *reference* field (vendor/client/project/material/_id/_name)
// we reject browse / help phrases ("list clients", "show vendors", "options",
// "i don't know", ...) so they never get stored as the value. The orchestrator
// turns those into a `selection` UI instead.
function coerceValue(field, raw) {
  const text = String(raw || "").trim();
  if (!text) return undefined;
  if (/quantity|amount/.test(field)) {
    const num = Number(text.replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/)?.[0]);
    return Number.isFinite(num) ? num : undefined;
  }
  // For string fields, require at least one letter or digit \u2014 reject "???", "...", etc.
  if (!/[a-z0-9]/i.test(text)) return undefined;
  // Reference fields: refuse browse / help phrases.
  if (/(name|_id|vendor|client|customer|supplier|project|material|item)/i.test(field)) {
    if (intentClassifier.isBrowsePhrase(text)) return undefined;
  }
  return text;
}

// --- Reference data fetch + cache --------------------------------------------

async function fetchVendors(user) {
  const userId = user?.id || "anonymous";
  const key = `${userId}:vendors`;
  const cached = refCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < REF_CACHE_TTL_MS) {
    return cached.items;
  }

  let items;
  if (process.env.AI_MOCK === "1") {
    items = MOCK_VENDORS.slice();
  } else {
    const headers = {
      "X-AI-User-Id": user?.id || "",
      "X-AI-User-Role": user?.role || "",
    };
    if (process.env.FORGE_SERVICE_TOKEN) {
      headers.Authorization = `Bearer ${process.env.FORGE_SERVICE_TOKEN}`;
    }
    // GET is idempotent → safe to retry.
    const r = await httpClient.request(
      {
        method: "GET",
        url: `${FORGE_BACKEND_URL}/api/vendors`,
        headers,
        params: { limit: 50 },
      },
      { timeout: 5000, retries: 2 }
    );
    if (r.ok) {
      const raw = Array.isArray(r.data) ? r.data : r.data?.data || r.data?.vendors || [];
      items = raw
        .map((v) => ({ id: v.id || v._id || v.vendor_id, name: v.name || v.vendor_name }))
        .filter((v) => v.name);
    } else {
      logger.warn({ err: r.error, code: r.code, status: r.status }, "vendor fetch failed; using mock list as fallback");
      items = MOCK_VENDORS.slice();
    }
  }

  refCache.set(key, { items, fetchedAt: Date.now() });
  return items;
}

// Resolve a user-provided vendor string against the real list using
// fuzzy matching (token + edit-distance). Handles typos, abbreviations
// ("tata" → "Tata Steel"), and word-order differences.
//
// Returns the same shape the rest of the service expects:
//   { status: "exact",    canonical }
//   { status: "multiple", matches }
//   { status: "none",     suggestions }
function resolveVendor(input, vendors) {
  const r = fuzzy.findBest(input, vendors, (v) => v.name);
  if (r.status === "exact") return { status: "exact", canonical: r.name };
  // Treat "likely" (one strong-but-not-perfect match) as exact to keep the
  // conversation flowing — the confirmation card lets the user catch it.
  if (r.status === "likely") return { status: "exact", canonical: r.name };
  if (r.status === "multiple") return { status: "multiple", matches: r.names };
  return { status: "none", suggestions: r.suggestions || [] };
}

// Step 1: classify the user's input into a structured intent.
// Hybrid pipeline:
//   1. Cheap rule-based pre-classifier extracts obvious intent + entities
//      and computes a confidence score.
//   2. LLM is called with few-shot examples and the rule hint as guidance.
//   3. Outputs are reconciled — LLM wins on conflicts, but the rule result
//      is used as fallback when the LLM returns "unknown" with high rule
//      confidence (or when the LLM call fails / times out).
async function detectIntent(message, user, { log = logger } = {}) {
  const hint = intentClassifier.preClassify(message);

  // "cancel" is purely procedural — no need to ask the LLM.
  if (hint.intent === "cancel") {
    return { intent: "cancel", entities: {}, source: "rules" };
  }

  if (process.env.AI_MOCK === "1") {
    const mock = mockDetectIntent(message);
    return intentClassifier.reconcile(mock, hint);
  }

  const model = "gpt-4o-mini";
  const provider = getProvider(model);
  const { system, messages } = intentClassifier.buildMessages(message, hint);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => {
      const e = new Error(`OpenAI call exceeded ${OPENAI_TIMEOUT_MS}ms`);
      e.code = "TIMEOUT";
      reject(e);
    }, OPENAI_TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([
      provider.complete({
        system,
        messages,
        jsonMode: true,
        model,
        temperature: 0,
      }),
      timeoutPromise,
    ]);
    const parsed = safeParseIntent(response.text);
    const reconciled = intentClassifier.reconcile(parsed, hint);
    log.debug(
      { llm: parsed, hint, reconciled },
      "ai.intent.reconciled"
    );
    return reconciled;
  } catch (err) {
    const status = err.response?.status;
    const reason = err.code === "TIMEOUT" ? "openai_timeout" : status ? `openai_${status}` : "openai_error";
    log.warn(
      { status: status || null, code: err.code || null, err: err.message, reason, hint },
      "openai intent detection failed; falling back to rules"
    );
    // Rule-based hint becomes the answer. mockDetectIntent is the legacy
    // fallback — we union both to maximise coverage.
    const mock = mockDetectIntent(message);
    const merged = intentClassifier.reconcile(mock, hint);
    return { ...merged, fallback: true, fallback_reason: reason };
  }
}

// Keyword-based intent detection used only when AI_MOCK=1.
// Lets us validate policy/confirmation/routing without hitting OpenAI.
function mockDetectIntent(message) {
  const text = String(message || "").toLowerCase();
  const entities = {};

  // Naive vendor + amount extraction for testing.
  const vendorMatch = text.match(/(?:for|from|with)\s+([a-z0-9 ]+?)\s+vendor/i)
    || text.match(/vendor\s+([a-z0-9 ]+)/i);
  if (vendorMatch) entities.vendor_name = vendorMatch[1].trim();

  const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (amountMatch) entities.amount = Number(amountMatch[1]);

  if (/\b(create|make|raise)\b.*\bpo\b/.test(text) || /purchase order/.test(text)) {
    return { intent: "create_po", entities };
  }
  if (/\bvendors?\b/.test(text) && /\b(list|get|show)\b/.test(text)) {
    return { intent: "get_vendors", entities };
  }
  return { intent: "unknown", entities };
}

// Step 2: enforce permissions, tenant scope, business rules, confirmation gates.
async function validatePolicy(intent, user) {
  const intentName = intent?.intent || "unknown";
  const role = user?.role;

  // Intent → allowed roles. Missing entry = allow all authenticated users.
  const rules = {
    create_po: ["admin"],
    create_rfq: ["admin"],
    generate_invoice: ["admin"],
  };

  const allowedRoles = rules[intentName];
  if (allowedRoles && !allowedRoles.includes(role)) {
    const { AppError } = require("../lib/errors");
    throw new AppError(
      "FORBIDDEN",
      `Intent "${intentName}" requires role(s) [${allowedRoles.join(", ")}], got "${role || "none"}"`,
      { status: 403 }
    );
  }

  return { allowed: true };
}

// Step 3: route intent to the correct Forge backend API.
async function executeAction(intent, policy, user, options = {}) {
  const { confirm = false, rawMessage = "", hadSession = false, intentChanged = false, log = logger } = options;
  const intentName = intent?.intent || "unknown";
  const rawEntities = intent?.entities && typeof intent.entities === "object" ? intent.entities : {};
  const unparsed = intent?.unparsed === true;

  // 3a. Reject unknown / unmapped intents BEFORE anything else.
  if (intentName === "unknown") {
    return {
      executed: false,
      ok: false,
      reason: "unknown_intent",
      next_step: "none",
      message: "I didn't understand that command. Please rephrase — for example: \"Create a PO for Tata Steel, 50 kg of steel for ₹5000.\"",
    };
  }
  const route = INTENT_ROUTES[intentName];
  if (!route) {
    return {
      executed: false,
      ok: false,
      reason: "no_route",
      next_step: "none",
      message: `No action is mapped for intent "${intentName}".`,
    };
  }

  // 3a-bis. Real-data resolution: ensure vendor_name maps to an actual vendor.
  // Runs BEFORE validation so we can ask for clarification even when other
  // fields are also missing. Skipped if user has approved creating a new vendor.
  if (rawEntities.vendor_name && !rawEntities._allow_new_vendor) {
    try {
      const vendors = await fetchVendors(user);
      const r = resolveVendor(rawEntities.vendor_name, vendors);
      if (r.status === "exact") {
        rawEntities.vendor_name = r.canonical; // auto-fill canonical name
      } else if (r.status === "multiple") {
        const collected = sanitizeEntities(intentName, { ...rawEntities, vendor_name: undefined });
        return {
          executed: false,
          ok: false,
          reason: "missing_fields",
          next_step: "answer_question",
          pending: ["vendor_name"],
          next_field: "vendor_name",
          question: `I found ${r.matches.length} vendors matching "${rawEntities.vendor_name}". Which one did you mean?`,
          suggestions: r.matches,
          collected,
          message: `I found ${r.matches.length} matches for "${rawEntities.vendor_name}": ${r.matches.join(", ")}. Which one did you mean?`,
        };
      } else {
        rawEntities._awaiting_new_vendor = true;
        const collected = sanitizeEntities(intentName, rawEntities);
        return {
          executed: false,
          ok: false,
          reason: "missing_fields",
          next_step: "confirm_new_vendor",
          pending: ["vendor_name"],
          next_field: "vendor_name",
          question: `"${rawEntities.vendor_name}" is not in your vendor list. Do you want to create it as a new vendor?`,
          suggestions: r.suggestions,
          collected,
          message: `"${rawEntities.vendor_name}" is not in your vendor list. Do you want to create it as a new vendor? (yes/no)`,
        };
      }
    } catch (e) {
      console.warn(`[ai.exec] vendor resolution skipped (${e.message})`);
    }
  }

  // 3b. Validate required entities BEFORE confirmation or execution.
  const validation = validateEntities(intentName, rawEntities);
  if (!validation.valid) {
    log.info({ stage: "validation", intent: intentName, missing: validation.missing }, "ai.validation_failed");
    const nextField = validation.missing[0];
    const meta = FIELD_META[nextField] || {};
    const baseQuestion =
      (typeof meta.contextual === "function" && meta.contextual(rawEntities)) ||
      meta.question ||
      `Please provide: ${nextField}.`;

    // Graceful invalid-input handling: if the user replied during a follow-up
    // but we couldn't make sense of it, acknowledge and re-ask without breaking.
    let prefix = "";
    if (hadSession && unparsed && rawMessage) {
      prefix = `I didn't quite catch "${String(rawMessage).slice(0, 60)}". `;
    }

    const collected = sanitizeEntities(intentName, rawEntities);

    // Live suggestions when asking for a vendor.
    let suggestions = meta.suggestions || null;
    if (nextField === "vendor_name") {
      try {
        const vendors = await fetchVendors(user);
        suggestions = vendors.slice(0, 5).map((v) => v.name);
      } catch (e) { /* ignore — keep null */ }
    }

    const message =
      (Object.keys(collected).length
        ? `Got it so far: ${formatEntities(collected)}. `
        : "") + prefix + baseQuestion;

    return {
      executed: false,
      ok: false,
      reason: "missing_fields",
      next_step: "answer_question",
      pending: validation.missing,
      next_field: nextField,
      question: baseQuestion,
      hint: meta.hint || null,
      suggestions,
      collected,
      message,
    };
  }

  // 3c. Whitelist payload — strip undefined / unexpected fields.
  const entities = sanitizeEntities(intentName, rawEntities);

  // 3d. Confirmation gate for critical actions (unchanged behavior).
  if (CRITICAL_INTENTS.has(intentName) && !confirm) {
    const summary = buildSummary(intentName, entities);
    return {
      executed: false,
      confirm: true,
      next_step: "confirm",
      summary,
      message: `${summary} Do you want to proceed? (Reply with confirm to continue.)`,
      preview: {
        intent: intentName,
        method: route.method,
        path: route.path,
        entities,
      },
    };
  }

  const url = `${FORGE_BACKEND_URL}${route.path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-AI-User-Id": user?.id || "",
    "X-AI-User-Role": user?.role || "",
  };
  if (process.env.FORGE_SERVICE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.FORGE_SERVICE_TOKEN}`;
  }

  log.info(
    { stage: "exec", intent: intentName, method: route.method, path: route.path, entities },
    "ai.exec"
  );

  const successMessage = `${INTENT_LABELS[intentName] || intentName} completed successfully.`;

  // Mock backend mode — don't call any real API, return a fake normalized success.
  if (process.env.AI_MOCK === "1") {
    log.info({ intent: intentName }, "ai.exec ok (mock)");
    return {
      executed: true,
      ok: true,
      mocked: true,
      next_step: "done",
      method: route.method,
      path: route.path,
      status: 200,
      message: `${successMessage} (mock)`,
      data: { intent: intentName, entities },
      ...(route.kind ? { kind: route.kind, entity: route.entity } : {}),
    };
  }

  // Retry policy:
  //   - GET / list endpoints: retry up to 2x (idempotent)
  //   - Critical mutations (create_po, create_rfq, generate_invoice): NEVER retry
  //     — at-least-once would create duplicate POs / invoices.
  //   - Other mutations: no retry by default.
  const isCritical = CRITICAL_INTENTS.has(intentName);
  const retries = route.method === "GET" ? 2 : 0;

  const r = await httpClient.request(
    {
      method: route.method,
      url,
      headers,
      ...(route.method === "GET" ? { params: entities } : { data: entities }),
    },
    { timeout: BACKEND_TIMEOUT_MS, retries }
  );

  if (r.ok) {
    log.info({ intent: intentName, status: r.status }, "ai.exec ok");
    return {
      executed: true,
      ok: true,
      next_step: "done",
      method: route.method,
      path: route.path,
      status: r.status,
      message: successMessage,
      data: r.data,
      ...(route.kind ? { kind: route.kind, entity: route.entity } : {}),
    };
  }

  // Failure — classify so the user gets a meaningful message.
  const isTimeout = r.code === "TIMEOUT";
  const isNetwork = r.code === "NETWORK";
  const friendly = isTimeout
    ? `${INTENT_LABELS[intentName] || intentName} timed out. Please try again in a moment.`
    : isNetwork
    ? `Could not reach the Forge backend right now. Please try again shortly.`
    : `Failed to ${INTENT_LABELS[intentName] || intentName}: ${r.error}`;

  log.warn(
    { intent: intentName, status: r.status, code: r.code, err: r.error, critical: isCritical },
    "ai.exec failed"
  );

  return {
    executed: false,
    ok: false,
    next_step: "none",
    method: route.method,
    path: route.path,
    status: r.status || 502,
    code: r.code || "UPSTREAM_ERROR",
    message: friendly,
    error: r.error,
  };
}

// Render entities as "vendor_name=Acme, amount=5000" — used in mid-flow messages.
function formatEntities(entities) {
  return Object.entries(entities)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
}

// Build a one-line human summary for the confirmation gate.
function buildSummary(intentName, e) {
  if (intentName === "create_po") {
    const parts = [];
    if (e.quantity) parts.push(`${e.quantity}${e.unit ? " " + e.unit : ""}${e.material ? " of " + e.material : ""}`);
    else if (e.material) parts.push(e.material);
    const what = parts.join(" ");
    const from = e.vendor_name ? ` from ${e.vendor_name}` : "";
    const amt = e.amount ? ` for ₹${e.amount}` : "";
    const proj = e.project_id ? ` (project ${e.project_id})` : "";
    const head = what ? `Create PO${from ? "" : ""} for ${what}${from}${amt}${proj}.` : `Create PO${from}${amt}${proj}.`;
    return head.trim();
  }
  if (intentName === "create_rfq") {
    return `Create RFQ${e.material ? " for " + e.material : ""}${e.vendor_name ? " from " + e.vendor_name : ""}.`;
  }
  if (intentName === "generate_invoice") {
    return `Generate invoice${e.project_id ? " for project " + e.project_id : ""}${e.amount ? " of ₹" + e.amount : ""}.`;
  }
  return `${INTENT_LABELS[intentName] || intentName} with ${formatEntities(e) || "no parameters"}.`;
}

// Required-field check. Supports both `required` (each must exist) and
// `requiredAny` (each group must have at least one present).
function validateEntities(intentName, entities) {
  const schema = INTENT_SCHEMAS[intentName];
  if (!schema) return { valid: true, missing: [] };

  const has = (k) => entities[k] !== undefined && entities[k] !== null && entities[k] !== "";
  const missing = [];

  for (const field of schema.required || []) {
    if (!has(field)) missing.push(field);
  }
  for (const group of schema.requiredAny || []) {
    if (!group.some(has)) missing.push(group.join(" or "));
  }

  return { valid: missing.length === 0, missing };
}

// Drop unknown / undefined fields. Only schema-allowed keys reach the backend.
function sanitizeEntities(intentName, entities) {
  const schema = INTENT_SCHEMAS[intentName];
  if (!schema) return {};
  const clean = {};
  for (const key of schema.allowed || []) {
    const v = entities[key];
    if (v !== undefined && v !== null && v !== "") clean[key] = v;
  }
  return clean;
}

function safeParseIntent(text) {
  const fallback = { intent: "unknown", entities: {}, missing_fields: [] };
  if (!text || typeof text !== "string") return fallback;

  // Strip ``` fences if the model added them despite instructions.
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");

  try {
    const parsed = JSON.parse(cleaned);
    return {
      intent: typeof parsed.intent === "string" ? parsed.intent : "unknown",
      entities: parsed.entities && typeof parsed.entities === "object" ? parsed.entities : {},
      missing_fields: Array.isArray(parsed.missing_fields) ? parsed.missing_fields : [],
    };
  } catch {
    return fallback;
  }
}

// Public surface used by the modular orchestrator (services/orchestrator.service.js)
// and friends. Older callers should keep using `processMessage`.
module.exports = {
  processMessage,
  detectIntent,
  // ----- internals exposed for the modular layer -----
  validatePolicy,
  executeAction,
  validateEntities,
  sanitizeEntities,
  mergeWithSession,
  saveSession,
  fetchVendors,
  resolveVendor,
  buildSummary,
  formatEntities,
  coerceValue,
  // ----- constants -----
  INTENT_ROUTES,
  INTENT_SCHEMAS,
  INTENT_LABELS,
  FIELD_META,
  CRITICAL_INTENTS,
};



