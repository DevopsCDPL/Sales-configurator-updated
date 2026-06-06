/**
 * Fuzzy string matching utilities.
 *
 * Used to map noisy user input ("tata", "tta steel", "TATASTEEL") to the
 * canonical record from the master-data list.
 *
 * Algorithm: token-based scoring + Levenshtein fallback.
 * No external deps; all functions are pure.
 */

"use strict";

// ---- Normalisation ---------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "of", "for", "with", "to", "from", "co",
  "ltd", "limited", "pvt", "private", "inc", "incorporated", "corp",
  "corporation", "company", "industries", "industry", "international",
  "global", "group", "enterprises", "solutions", "services",
]);

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((t) => t && !STOP_WORDS.has(t));
}

// ---- Levenshtein distance --------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Two-row optimisation
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

// Similarity in [0, 1]; 1 = identical.
// Returns the BETTER of two forms: with-spaces and without — so
// "tatasteel" vs "Tata Steel" still scores high.
function similarity(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  if (!A || !B) return 0;
  const sim = (x, y) => 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  const spaced = sim(A, B);
  const compact = sim(A.replace(/\s+/g, ""), B.replace(/\s+/g, ""));
  return Math.max(spaced, compact);
}

// ---- Token-set / token-sort scoring ---------------------------------------

function tokenScore(query, candidate) {
  const q = new Set(tokens(query));
  const c = new Set(tokens(candidate));
  if (!q.size || !c.size) return 0;

  // Intersection ratio (Jaccard-ish, biased toward query).
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  const recall = hit / q.size;
  const precision = hit / c.size;
  if (recall === 0) return 0;
  // F1
  return (2 * recall * precision) / (recall + precision);
}

// Substring containment bonus ("tata" inside "tata steel ltd").
function containmentBonus(query, candidate) {
  const Q = normalize(query);
  const C = normalize(candidate);
  if (!Q) return 0;
  if (C.includes(Q)) return 0.25;
  // First-token prefix match ("ta" → "tata steel")
  const qFirst = Q.split(" ")[0];
  if (qFirst && qFirst.length >= 2 && C.split(" ").some((t) => t.startsWith(qFirst))) {
    return 0.1;
  }
  return 0;
}

/**
 * score(query, candidate) → number in [0, 1.25]
 * Combines token F1, edit-distance similarity, and substring bonus.
 */
function score(query, candidate) {
  const tok = tokenScore(query, candidate);
  const sim = similarity(query, candidate);
  const bon = containmentBonus(query, candidate);
  // Weighted blend.
  return tok * 0.6 + sim * 0.4 + bon;
}

/**
 * findBest(query, items, getName)
 *   items:    array of records
 *   getName:  fn(item) → string used for matching (defaults to item.name)
 *
 * Returns:
 *   { status: "exact",    item,  score }   score >= 0.85
 *   { status: "likely",   item,  score }   0.55 <= score < 0.85, runner-up clearly behind
 *   { status: "multiple", items, score }   top 2-5 candidates within 0.1 of leader
 *   { status: "none",     suggestions }    nothing crossed the floor (>= 0.35)
 */
function findBest(query, items, getName = (x) => x.name) {
  const q = normalize(query);
  if (!q || !Array.isArray(items) || !items.length) {
    return { status: "none", suggestions: (items || []).slice(0, 5).map(getName) };
  }

  const scored = items
    .map((item) => ({ item, name: getName(item), s: score(q, getName(item)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) {
    return { status: "none", suggestions: items.slice(0, 5).map(getName) };
  }

  const top = scored[0];
  const runnerUp = scored[1];

  // Ambiguity guard: a single short query token (e.g. "steel") that is a
  // common substring of many candidate names should NOT be treated as exact.
  // If the runner-up is within 0.05 of the leader, force "multiple".
  const veryClose = runnerUp && top.s - runnerUp.s < 0.05;

  // Exact-ish: very high score, or clearly ahead of runner-up.
  if (!veryClose && (top.s >= 0.85 || (top.s >= 0.7 && (!runnerUp || top.s - runnerUp.s >= 0.2)))) {
    return { status: "exact", item: top.item, name: top.name, score: top.s };
  }

  // Multiple close candidates → ask user to pick.
  const close = scored.filter((x) => top.s - x.s <= 0.1).slice(0, 5);
  if (close.length > 1) {
    return { status: "multiple", items: close.map((x) => x.item), names: close.map((x) => x.name), score: top.s };
  }

  // One likely candidate, but below the exact threshold.
  if (top.s >= 0.55) {
    return { status: "likely", item: top.item, name: top.name, score: top.s };
  }

  // Weak — return suggestions.
  return {
    status: "none",
    suggestions: scored.slice(0, 5).map((x) => x.name),
    score: top.s,
  };
}

module.exports = {
  normalize,
  tokens,
  levenshtein,
  similarity,
  score,
  findBest,
};
