'use strict';

/**
 * Overwatch LLM briefing (Item 3) — OPTIONAL AI narrative over the rule-based
 * /overwatch/summary. Provider-agnostic: any OpenAI-compatible chat-completions
 * endpoint (OpenAI, OpenRouter, Together, a local vLLM, Anthropic via a compat
 * proxy, etc.). Configured ENTIRELY via env — all optional. When the base URL
 * or API key is missing the layer is simply DISABLED and never throws, so the
 * service deploys safely with no key and the owner sets these later:
 *
 *   OVERWATCH_LLM_BASE_URL   e.g. https://api.openai.com/v1
 *   OVERWATCH_LLM_API_KEY    secret
 *   OVERWATCH_LLM_MODEL      e.g. gpt-4o-mini  (default below)
 *
 * No new dependency: uses the global fetch (Node 18+).
 */

function config() {
  return {
    baseUrl: (process.env.OVERWATCH_LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.OVERWATCH_LLM_API_KEY || '',
    model: process.env.OVERWATCH_LLM_MODEL || 'gpt-4o-mini',
  };
}

function isEnabled() {
  const c = config();
  return !!(c.baseUrl && c.apiKey && typeof fetch === 'function');
}

/** Trim the summary to the decision-relevant essentials to bound tokens. */
function compact(summary = {}) {
  const s = summary || {};
  return {
    generatedAt: s.generatedAt,
    pipeline: { total: s.pipeline?.total ?? 0, byStage: (s.pipeline?.byStage || []).map((x) => ({ stage: x.stage, count: x.count })) },
    quotes: s.quotes ? { byStatus: s.quotes.byStatus, issuedValue: s.quotes.issuedValue, issuedCount: s.quotes.issuedCount, staleDrafts: s.quotes.staleDrafts, currency: s.quotes.currency } : {},
    procurement: s.procurement ? { openBatches: s.procurement.openBatches, oldestBatchAgeDays: s.procurement.oldestBatchAgeDays, pendingRfqParts: s.procurement.pendingRfqParts } : {},
    approvals: { pending: s.approvals?.pending ?? 0 },
    risks: (s.risks || []).slice(0, 20),
  };
}

/**
 * generateBriefing(summary) -> { enabled, briefing?, model?, error?, reason? }.
 * Never throws.
 */
async function generateBriefing(summary, { timeoutMs = 20000 } = {}) {
  if (!isEnabled()) {
    return { enabled: false, reason: 'Set OVERWATCH_LLM_BASE_URL and OVERWATCH_LLM_API_KEY to enable the AI briefing.' };
  }
  const c = config();
  const system = [
    'You are an operations analyst for a switchgear manufacturing ERP.',
    'Given a JSON snapshot of pipeline, quotes, procurement, approvals and risks,',
    'write a concise executive briefing for the owner:',
    '1) 3-6 bullet highlights using the actual numbers;',
    '2) the top 3 risks ranked, each with the concrete action to take;',
    '3) one bottom-line sentence.',
    'Be specific and quantitative. No filler, no restating the JSON.',
  ].join(' ');
  const user = 'Snapshot JSON:\n' + JSON.stringify(compact(summary));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2,
        max_tokens: 700,
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return { enabled: true, error: `LLM HTTP ${resp.status}`, detail: String(detail).slice(0, 300) };
    }
    const j = await resp.json();
    const briefing = j && j.choices && j.choices[0] && j.choices[0].message ? String(j.choices[0].message.content || '').trim() : '';
    if (!briefing) return { enabled: true, error: 'LLM returned no content' };
    return { enabled: true, model: c.model, briefing, generatedAt: new Date().toISOString() };
  } catch (e) {
    return { enabled: true, error: e && e.name === 'AbortError' ? 'LLM request timed out' : (e && e.message) || 'LLM request failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isEnabled, generateBriefing, config };
