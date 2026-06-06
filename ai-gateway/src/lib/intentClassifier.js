/**
 * Intent classification helpers — 3-layer prompt + keyword pre-classifier.
 *
 * Architecture:
 *   Layer 1 — SYSTEM PROMPT  : "brain" — persona, rules, accuracy stance.
 *   Layer 2 — TASK PROMPT    : per-request scaffold — context, output contract.
 *   Layer 3 — FEW-SHOT       : real examples covering every supported intent.
 *
 *   + KEYWORD PRE-CLASSIFIER : cheap rules run before the LLM and are passed
 *                              as a hint to bias the model toward the right
 *                              answer. Also acts as a fallback when the LLM
 *                              fails or returns "unknown" with low confidence.
 *
 * Output contract (strict):
 *   { "intent": "<enum>", "entities": { ... }, "missing_fields": ["..."] }
 *
 * This file is pure (no I/O) — easy to unit-test.
 */

"use strict";

// ---------------------------------------------------------------------------
// Per-intent required fields. Used by the LLM prompt AND by the
// rules-side reconciler to compute `missing_fields` deterministically.
// ---------------------------------------------------------------------------

const INTENT_REQUIRED_FIELDS = {
  create_po:        ["vendor_name", "material", "quantity"],
  create_rfq:       ["material", "quantity"],
  create_work_order:["project_id"],
  generate_invoice: ["project_id"],
  get_vendors:      [],
  get_clients:      [],
  get_materials:    [],
  get_projects:     [],
  get_profit:       [],
  get_project_status: ["project_id"],
  list_documents:   [],
  cancel:           [],
  unknown:          [],
};

const SUPPORTED_INTENTS = Object.keys(INTENT_REQUIRED_FIELDS);

// ---------------------------------------------------------------------------
// LAYER 1 — SYSTEM PROMPT (persona + non-negotiable rules)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AI Workflow Assistant for the Forge ERP / Procurement platform — NOT a chatbot.

Your role:
- Guide the user step-by-step to complete business actions (Create Project, Create PO, Create RFQ, Generate Invoice, etc.) like a smart form.
- Always validate before moving to the next step. Never assume, never guess, never proceed with placeholder values.
- You return STRUCTURED JSON only — never plain prose, never markdown.

Core behavior:
1. Treat every message as part of a guided workflow. Maintain mental state: intent, current_step, collected_data, missing_fields.
2. If user input is partial — extract what is valid, list the rest in "missing_fields".
3. If user input is unclear — return intent="unknown" with a short clarification cue; do NOT guess.
4. NEVER accept browse/help phrases ("list clients", "show vendors", "i don't know", "options", "choose", "help") as values for an entity-reference field (client_id, vendor_id, project_id, material_id, *_name). Those are browse intents, not values.
5. NEVER store placeholder strings as final data. If a field is invalid, leave it out and add it to "missing_fields".

Strict rules:
- Output ONE JSON object only. No prose, no markdown fences, no commentary.
- Use snake_case keys throughout.
- Accuracy > creativity. Never invent vendor names, client names, quantities, IDs, or amounts.
- Numbers must be numbers (not strings). Units must be from the allowed vocabulary.
- If user says "cancel" / "abort" / "stop" / "nevermind", return intent="cancel".`;

// ---------------------------------------------------------------------------
// LAYER 2 — TASK PROMPT (per-request scaffold + output contract)
// ---------------------------------------------------------------------------

function buildTaskPrompt() {
  return `Task: Convert the user input into structured intent and entities.

Context:
- Application: Forge — Procurement / ERP system.
- Modules: Purchase Orders (PO), RFQs, Work Orders, Invoices, Vendors, Clients, Materials, Projects.

Supported intents:
${SUPPORTED_INTENTS.map((i) => `- ${i}${INTENT_REQUIRED_FIELDS[i].length ? `   (required: ${INTENT_REQUIRED_FIELDS[i].join(", ")})` : ""}`).join("\n")}

Entity vocabulary (snake_case):
- vendor_name, supplier_name
- client_name, customer_name
- material, material_grade, item_name
- project_id, project_name
- quantity (number), unit (kg|g|pcs|nos|m|mm|cm|l|t)
- amount (number), unit_cost (number), currency
- notes, search, deadline, required_date

Output (STRICT JSON ONLY — no other text):
{
  "intent": "<one of the supported intents>",
  "entities": { "<snake_case_key>": <value> },
  "missing_fields": ["<required field that the user did not provide>", ...]
}`;
}

// ---------------------------------------------------------------------------
// LAYER 3 — FEW-SHOT EXAMPLES (one per pattern; this is the accuracy lever)
// ---------------------------------------------------------------------------

const FEW_SHOT_EXAMPLES = [
  // ---- create_po ----
  {
    user: "create PO for 100kg steel from Tata",
    out: {
      intent: "create_po",
      entities: { vendor_name: "Tata", material: "steel", quantity: 100, unit: "kg" },
      missing_fields: [],
    },
  },
  {
    user: "raise a purchase order, jsw, 5000 rupees",
    out: {
      intent: "create_po",
      entities: { vendor_name: "JSW", amount: 5000 },
      missing_fields: ["material", "quantity"],
    },
  },
  {
    user: "po acme 50 pcs aluminium",
    out: {
      intent: "create_po",
      entities: { vendor_name: "Acme", material: "aluminium", quantity: 50, unit: "pcs" },
      missing_fields: [],
    },
  },
  {
    user: "create po for steel",
    out: {
      intent: "create_po",
      entities: { material: "steel" },
      missing_fields: ["vendor_name", "quantity"],
    },
  },

  // ---- create_rfq ----
  {
    user: "create rfq for 20 bolts",
    out: {
      intent: "create_rfq",
      entities: { material: "bolts", quantity: 20 },
      missing_fields: [],
    },
  },
  {
    user: "rfq 500 m copper wire for project beta",
    out: {
      intent: "create_rfq",
      entities: { material: "copper wire", quantity: 500, unit: "m", project_id: "beta" },
      missing_fields: [],
    },
  },

  // ---- create_work_order ----
  {
    user: "start work order for project alpha",
    out: {
      intent: "create_work_order",
      entities: { project_id: "alpha" },
      missing_fields: [],
    },
  },

  // ---- generate_invoice ----
  {
    user: "generate invoice for project beta",
    out: {
      intent: "generate_invoice",
      entities: { project_id: "beta" },
      missing_fields: [],
    },
  },

  // ---- list intents ----
  { user: "show vendors",       out: { intent: "get_vendors",   entities: {}, missing_fields: [] } },
  { user: "list all suppliers", out: { intent: "get_vendors",   entities: {}, missing_fields: [] } },
  { user: "search vendor tata", out: { intent: "get_vendors",   entities: { search: "tata" }, missing_fields: [] } },
  { user: "show clients",       out: { intent: "get_clients",   entities: {}, missing_fields: [] } },
  { user: "list materials",     out: { intent: "get_materials", entities: {}, missing_fields: [] } },
  { user: "list projects",      out: { intent: "get_projects",  entities: {}, missing_fields: [] } },

  // ---- bare follow-up replies ----
  { user: "tata",  out: { intent: "unknown", entities: { vendor_name: "tata" }, missing_fields: [] } },
  { user: "5000",  out: { intent: "unknown", entities: { amount: 5000 },        missing_fields: [] } },

  // ---- noise ----
  { user: "hi",    out: { intent: "unknown", entities: {}, missing_fields: [] } },
];

/**
 * Build the message array for the LLM call.
 * Layout: system → task → few-shot turns → optional hint → user message.
 */
function buildMessages(userMessage, hint) {
  const messages = [];

  // Layer 2 — task prompt (kept as a leading user turn so it stays sticky
  // even if the system prompt is truncated by some providers).
  messages.push({ role: "user", content: buildTaskPrompt() });
  messages.push({ role: "assistant", content: "Understood. I will return STRICT JSON only." });

  // Layer 3 — few-shot turns.
  for (const ex of FEW_SHOT_EXAMPLES) {
    messages.push({ role: "user", content: `Input: ${ex.user}` });
    messages.push({ role: "assistant", content: JSON.stringify(ex.out) });
  }

  // Final user turn — append hint (if any) as guidance, not as the answer.
  let content = `Input: ${userMessage}`;
  if (hint && (hint.intent !== "unknown" || Object.keys(hint.entities || {}).length > 0)) {
    content += `\n[pre-classifier hint: ${JSON.stringify({ intent: hint.intent, entities: hint.entities })}. Use only if consistent with the input.]`;
  }
  messages.push({ role: "user", content });

  return { system: SYSTEM_PROMPT, messages };
}

// ---------------------------------------------------------------------------
// Keyword pre-classifier — runs BEFORE the LLM. Cheap & deterministic.
// Returns { intent, entities, confidence } where confidence is 0..1.
// ---------------------------------------------------------------------------

const NUM_RE = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:[, ]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/i;
const QTY_RE = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|g|grams?|lb|lbs|t|tons?|pcs?|pieces?|nos?|units?|m|meters?|mm|cm|l|litres?|liters?)\b/i;

function preClassify(message) {
  const text = String(message || "").trim();
  if (!text) return { intent: "unknown", entities: {}, confidence: 0 };

  const lower = text.toLowerCase();
  const entities = {};
  let confidence = 0;
  let intent = "unknown";

  // ---- Intent detection (keyword-based) ---------------------------------
  const isPo =
    /\bp\.?o\.?\b/i.test(text) ||
    /\bpurchase\s*order\b/i.test(text) ||
    /\b(create|raise|make|new|generate)\s+.*\b(po|order)\b/i.test(text);
  const isRfq =
    /\brfq\b/i.test(text) ||
    /\b(request\s+for\s+quote|quotation\s+request)\b/i.test(text);
  const isWorkOrder =
    /\bwork\s*order\b/i.test(text) ||
    /\bwo\b/i.test(text);
  const isInvoice =
    /\b(invoice|bill)\b/i.test(text) &&
    /\b(create|generate|make|raise|send|new)\b/i.test(text);
  const isListVendors =
    /\b(list|show|display|fetch|get|view|browse|see|all|search|find|filter|lookup|look\s+up)\b/i.test(text) &&
    /\b(vendors?|suppliers?)\b/i.test(text);
  const isListClients =
    /\b(list|show|display|fetch|get|view|browse|see|all)\b/i.test(text) &&
    /\b(clients?|customers?)\b/i.test(text);
  const isListMaterials =
    /\b(list|show|display|fetch|get|view|browse|see|all)\b/i.test(text) &&
    /\b(materials?|items?|inventory|stock)\b/i.test(text);
  const isListProjects =
    /\b(list|show|display|fetch|get|view|browse|see|all)\b/i.test(text) &&
    /\bprojects?\b/i.test(text);
  const isCancel = /^(cancel|abort|stop|nevermind|never\s*mind|quit|exit)\b/i.test(text);

  if (isCancel) {
    return { intent: "cancel", entities: {}, confidence: 0.95 };
  }

  if (isRfq) {
    intent = "create_rfq";
    confidence = 0.85;
  } else if (isWorkOrder) {
    intent = "create_work_order";
    confidence = 0.8;
  } else if (isInvoice) {
    intent = "generate_invoice";
    confidence = 0.85;
  } else if (isPo) {
    intent = "create_po";
    confidence = 0.7;
  } else if (isListVendors) {
    intent = "get_vendors";
    confidence = 0.85;
    const sm = text.match(/\b(?:search|find|filter|named?|called)\s+([a-z0-9 &.\-]+)/i);
    if (sm) entities.search = sm[1].trim();
  } else if (isListClients) {
    intent = "get_clients";
    confidence = 0.85;
  } else if (isListMaterials) {
    intent = "get_materials";
    confidence = 0.85;
  } else if (isListProjects) {
    intent = "get_projects";
    confidence = 0.85;
  }

  // ---- Entity extraction (independent of intent) ------------------------
  // Quantity with unit OR "for N <noun>" pattern ("for 20 bolts").
  const qm = text.match(QTY_RE);
  if (qm) {
    entities.quantity = Number(qm[1]);
    entities.unit = qm[2].toLowerCase().replace(/s$/, "");
  } else {
    // "create rfq for 20 bolts" → quantity=20, material=bolts
    const qm2 = text.match(/\bfor\s+(\d+(?:\.\d+)?)\s+([a-z][a-z\-]{2,})\b/i);
    if (qm2 && !/^(rs|inr|rupees|usd|eur|dollar|euros?)$/i.test(qm2[2])) {
      entities.quantity = Number(qm2[1]);
      // Only fill material if we don't already have one.
      if (!entities.material) entities.material = qm2[2].toLowerCase();
    }
  }

  // Amount: explicit currency or "rupees"/"rs"/"₹"/"inr".
  // Note: bare "for N" is intentionally NOT matched here — it's handled
  // above as quantity+noun ("for 20 bolts") to avoid mis-tagging it as money.
  const am =
    text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/([\d,]+(?:\.\d+)?)\s*(?:rupees|rs\.?|inr)/i) ||
    text.match(/\bfor\s+([\d,]+(?:\.\d+)?)\s*$/i);
  if (am) {
    const n = Number(am[1].replace(/[, ]/g, ""));
    if (Number.isFinite(n)) entities.amount = n;
  }

  // Vendor name patterns: "from X", "vendor X", "vendor: X".
  // We deliberately do NOT use "po for X" — "for" is too generic and gets
  // confused with "po for 100kg ..." where 100kg is the next token.
  const VENDOR_STOP = new Set([
    "for", "from", "with", "the", "a", "an", "of", "on", "to", "and",
    "po", "order", "vendor", "supplier", "create", "raise", "new", "please",
  ]);
  const vm =
    text.match(/\bfrom\s+([a-z][a-z0-9 &.\-]*?)(?=\s+(?:for|with|on|,|\.)|\s*\d|\s*$)/i) ||
    text.match(/\bvendor[:\s]+([a-z][a-z0-9 &.\-]*?)(?=\s+(?:for|with)|\s*(?:,|\.)|\s*\d|\s*$)/i) ||
    text.match(/\bsupplier[:\s]+([a-z][a-z0-9 &.\-]*?)(?=\s+(?:for|with)|\s*(?:,|\.)|\s*\d|\s*$)/i);
  if (vm) {
    const v = vm[1].trim().replace(/\s+(?:vendor|supplier)$/i, "");
    if (v && v.length >= 2 && !/^\d+$/.test(v) && !VENDOR_STOP.has(v.toLowerCase())) {
      entities.vendor_name = v;
    }
  }

  // Material: common keywords.
  const mm = text.match(/\b(steel|aluminium|aluminum|copper|brass|iron|plastic|wood|cement|concrete|rubber|stainless)\b/i);
  if (mm) entities.material = mm[1].toLowerCase();

  // Bare number → amount fallback (only if nothing else extracted).
  if (intent === "unknown" && Object.keys(entities).length === 0) {
    const nm = text.match(/^\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (nm) {
      entities.amount = Number(nm[1].replace(/[, ]/g, ""));
      confidence = 0.5;
    }
  }

  // Bare token → likely a vendor name during a follow-up turn.
  // Only when 3+ chars and not a common greeting / stopword / browse phrase.
  const GREETING = /^(hi|hello|hey|yo|sup|ok|okay|yes|no|y|n|thanks?|thx|bye)$/i;
  if (intent === "unknown" && Object.keys(entities).length === 0) {
    if (
      /^[a-z][a-z0-9 &.\-]{2,40}$/i.test(text) &&
      !GREETING.test(text) &&
      !isBrowsePhrase(text) &&
      !/\s(create|po|vendor|order|list|show)\s/i.test(` ${text} `)
    ) {
      entities.vendor_name = text;
      confidence = 0.3;
    }
  }

  // Bump confidence if strong intent + at least one entity.
  if (intent !== "unknown" && Object.keys(entities).length > 0) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return { intent, entities, confidence };
}

/**
 * Reconcile LLM output with the rule-based hint.
 * Returns the final { intent, entities } that the rest of the service uses.
 */
/**
 * Deterministically compute missing required fields for an intent given
 * the entities collected so far. Always trustworthy — never delegated to
 * the LLM (which can hallucinate "missing" lists).
 */
function computeMissingFields(intent, entities) {
  const required = INTENT_REQUIRED_FIELDS[intent];
  if (!required || !required.length) return [];
  const have = entities || {};
  return required.filter((f) => {
    const v = have[f];
    return v === undefined || v === null || v === "";
  });
}

function reconcile(llmResult, hint) {
  const llm = llmResult || { intent: "unknown", entities: {} };
  const llmEntities = llm.entities && typeof llm.entities === "object" ? llm.entities : {};
  const hintEntities = (hint && hint.entities) || {};

  // 1. Intent: trust LLM unless it's "unknown" and the rules were confident.
  let intent = llm.intent || "unknown";
  if (intent === "unknown" && hint && hint.intent && hint.intent !== "unknown" && hint.confidence >= 0.7) {
    intent = hint.intent;
  }
  // Reject any intent the LLM invented that we don't support.
  if (!SUPPORTED_INTENTS.includes(intent)) intent = "unknown";

  // 2. Entities: union, with LLM winning on conflict.
  const entities = { ...hintEntities, ...llmEntities };

  // 3. Type coercion for numeric fields.
  for (const key of ["quantity", "amount", "unit_cost"]) {
    if (entities[key] !== undefined && typeof entities[key] !== "number") {
      const n = Number(String(entities[key]).replace(/[^\d.\-]/g, ""));
      if (Number.isFinite(n)) entities[key] = n;
      else delete entities[key];
    }
  }

  // 4. Missing-fields contract — computed deterministically (NOT from LLM).
  const missing_fields = computeMissingFields(intent, entities);

  return { intent, entities, missing_fields };
}

// ---------------------------------------------------------------------------
// Browse-phrase guard.
//
// CRITICAL: phrases like "list clients", "show vendors", "i don't know",
// "options", "help", "choose", "pick one" must NEVER be stored as the value
// of a reference field (client_id, vendor_id, project_id, *_name, material).
// They are *browse intents* — the user wants the picker, not the value.
//
// Used by:
//   - entity.service / coerceValue (follow-up reply slot-filling)
//   - vendor-name fallback in preClassify (bare token branch)
// ---------------------------------------------------------------------------
const BROWSE_KEYWORDS = [
  "list", "show", "display", "fetch", "get", "view", "browse", "see", "all",
  "search", "find", "filter", "lookup", "look up",
  "options", "option", "choices", "choose", "pick", "select", "selection",
  "help", "menu", "available",
  "i don't know", "idk", "dont know", "do not know", "not sure", "unsure",
  "what", "which", "who", "anything", "any",
];
const BROWSE_NOUNS = [
  "vendors?", "suppliers?", "clients?", "customers?",
  "materials?", "items?", "inventory", "stock",
  "projects?", "jobs?",
  "documents?", "files?",
  "pos?", "purchase\\s*orders?",
  "rfqs?", "quotes?", "quotations?",
  "invoices?", "bills?",
];
const BROWSE_RE = new RegExp(
  "^\\s*(?:(?:" +
    BROWSE_KEYWORDS.map((k) => k.replace(/ /g, "\\s+")).join("|") +
  ")\\b\\s*)+(?:" + BROWSE_NOUNS.join("|") + ")?\\s*\\??\\s*$",
  "i"
);

/**
 * Returns true if `text` looks like a browse / help phrase rather than an
 * actual entity value (vendor name, client name, id, etc.).
 */
function isBrowsePhrase(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (BROWSE_RE.test(t)) return true;
  // Standalone help words.
  if (/^(help|menu|options?|choices?)\??$/i.test(t)) return true;
  return false;
}

module.exports = {
  SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  INTENT_REQUIRED_FIELDS,
  SUPPORTED_INTENTS,
  buildMessages,
  buildTaskPrompt,
  preClassify,
  reconcile,
  computeMissingFields,
  isBrowsePhrase,
};
