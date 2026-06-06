/**
 * Amber AI --- Adaptive Learning Store
 * --------------------------------------------------------------
 * Tracks per-user usage patterns so the assistant can suggest
 * sensible defaults ("Use the same vendor as last time?") and
 * learn from corrections ("Use Aluminium 7000, not 6000").
 *
 * Storage: a single JSON file keyed by userId. Lightweight, no
 * migration needed, survives restarts. If the file can't be
 * written (read-only FS, etc.) we silently fall back to memory.
 */

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'ai-preferences.json');
const MAX_RECENT = 8;       // keep 8 most-recent values per kind
const SUGGEST_AFTER = 2;    // start suggesting after we've seen it 2+ times

let memCache = null;

function load() {
  if (memCache) return memCache;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      memCache = JSON.parse(raw || '{}');
    } else {
      memCache = {};
    }
  } catch (err) {
    console.warn('[ai-preferences] failed to load store:', err.message);
    memCache = {};
  }
  return memCache;
}

function persist() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(memCache, null, 2));
  } catch (err) {
    // Read-only FS or similar -- keep working from memory
    console.warn('[ai-preferences] failed to persist store:', err.message);
  }
}

function getUserRec(userId) {
  const store = load();
  const key = String(userId || 'anon');
  if (!store[key]) {
    store[key] = {
      recent: {},        // { vendor: [{value, count, lastAt}], material: [...], client: [...], grade: [...] }
      corrections: {},   // { 'aluminium 6000': 'aluminium 7000' }
      taskCount: 0,      // total tasks completed -- used as confidence signal
    };
  }
  return store[key];
}

/**
 * Record that a user successfully used a value (vendor, material, client, etc.).
 * Bumps count + lastAt; keeps the list pruned to MAX_RECENT.
 */
function recordUsage(userId, kind, value) {
  if (!value || typeof value !== 'string') return;
  const v = value.trim();
  if (!v) return;
  const rec = getUserRec(userId);
  if (!rec.recent[kind]) rec.recent[kind] = [];
  const list = rec.recent[kind];
  const existing = list.find(x => x.value.toLowerCase() === v.toLowerCase());
  if (existing) {
    existing.count += 1;
    existing.lastAt = Date.now();
  } else {
    list.unshift({ value: v, count: 1, lastAt: Date.now() });
  }
  // Sort by recency (lastAt) and trim
  list.sort((a, b) => b.lastAt - a.lastAt);
  rec.recent[kind] = list.slice(0, MAX_RECENT);
  persist();
}

/**
 * Returns the single most-likely default for a kind, or null if not enough data.
 * Picks the value with the highest count (ties broken by recency).
 */
function getDefault(userId, kind) {
  const rec = getUserRec(userId);
  const list = rec.recent[kind] || [];
  if (!list.length) return null;
  const best = [...list].sort((a, b) => (b.count - a.count) || (b.lastAt - a.lastAt))[0];
  return best.count >= SUGGEST_AFTER ? best.value : null;
}

/** Returns up to N recent values for a kind --- useful for suggestion chips. */
function getRecent(userId, kind, n = 3) {
  const rec = getUserRec(userId);
  const list = rec.recent[kind] || [];
  return list.slice(0, n).map(x => x.value);
}

/**
 * Records a correction: "I said X but you should have used Y next time".
 * Stored case-insensitively keyed by the wrong value.
 */
function recordCorrection(userId, wrongValue, rightValue) {
  if (!wrongValue || !rightValue) return;
  const rec = getUserRec(userId);
  rec.corrections[wrongValue.toLowerCase().trim()] = rightValue.trim();
  persist();
}

/** Looks up a corrected value, or returns the input unchanged. */
function applyCorrection(userId, value) {
  if (!value || typeof value !== 'string') return value;
  const rec = getUserRec(userId);
  const fixed = rec.corrections[value.toLowerCase().trim()];
  return fixed || value;
}

/** Increments the user's completed-task counter. */
function bumpTaskCount(userId) {
  const rec = getUserRec(userId);
  rec.taskCount = (rec.taskCount || 0) + 1;
  persist();
}

function getTaskCount(userId) {
  return getUserRec(userId).taskCount || 0;
}

/**
 * Convenience: given a tool-name + the params that were used to execute it,
 * record the appropriate values for future suggestion.
 */
const TOOL_LEARN_MAP = {
  create_vendor: { company_name: 'vendor' },
  create_client: { company_name: 'client' },
  create_material: { material_category: 'material', material_grade: 'grade' },
  create_inventory_item: { item_name: 'material' },
  create_part: { part_name: 'part', material_grade: 'grade' },
  create_rfq: { vendor_name: 'vendor', material_name: 'material', project_name: 'project' },
  create_purchase_order: { vendor_name: 'vendor', project_name: 'project', item_description: 'material' },
  create_project: { client_name: 'client' },
};

function learnFromExecution(userId, toolName, params) {
  const map = TOOL_LEARN_MAP[toolName];
  if (!map || !params) return;
  for (const [paramKey, kind] of Object.entries(map)) {
    if (params[paramKey]) recordUsage(userId, kind, params[paramKey]);
  }
  bumpTaskCount(userId);
}

module.exports = {
  recordUsage,
  getDefault,
  getRecent,
  recordCorrection,
  applyCorrection,
  bumpTaskCount,
  getTaskCount,
  learnFromExecution,
};
