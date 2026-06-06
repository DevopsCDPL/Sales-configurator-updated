/**
 * Diagnostics helper — Phase 5
 * ════════════════════════════════════════════════════════════════════════
 * Lightweight, prefixed channel logger used by the configurator subtree
 * for autosave / preview / quotation / drawing-generation tracing.
 *
 * • Channels are silent by default in production (NODE_ENV === 'production').
 * • In development they emit a single console line per call.
 * • A channel can be force-enabled at runtime by setting
 *     localStorage.setItem('forge.diag', 'autosave,preview,quotation')
 *   (a bare '*' enables all channels).
 *
 * Usage:
 *   import { diag } from '../../utils/diag';
 *   diag('autosave', 'persisted', { id, ms });
 *   diag.error('preview', 'failed', err);
 * ════════════════════════════════════════════════════════════════════════
 */

export type DiagChannel =
  | 'autosave'
  | 'preview'
  | 'quotation'
  | 'drawing'
  | 'pipeline'
  | 'sidebar'
  | 'theme'
  | 'workflow';

const isProd = process.env.NODE_ENV === 'production';

function readEnabled(): Set<string> | '*' | null {
  try {
    const raw = window.localStorage.getItem('forge.diag');
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed === '*') return '*';
    return new Set(trimmed.split(',').map((s) => s.trim()).filter(Boolean));
  } catch {
    return null;
  }
}

function shouldLog(channel: DiagChannel): boolean {
  const enabled = readEnabled();
  if (enabled === '*') return true;
  if (enabled && enabled.has(channel)) return true;
  return !isProd;
}

function emit(level: 'log' | 'warn' | 'error', channel: DiagChannel, msg: string, payload?: unknown) {
  if (!shouldLog(channel)) return;
  const stamp = new Date().toISOString().slice(11, 23);
  const tag = `[forge:${channel}] ${stamp}`;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console[level](tag, msg, payload);
  } else {
    // eslint-disable-next-line no-console
    console[level](tag, msg);
  }
}

interface DiagFn {
  (channel: DiagChannel, msg: string, payload?: unknown): void;
  warn: (channel: DiagChannel, msg: string, payload?: unknown) => void;
  error: (channel: DiagChannel, msg: string, payload?: unknown) => void;
}

const baseDiag = ((channel: DiagChannel, msg: string, payload?: unknown) =>
  emit('log', channel, msg, payload)) as DiagFn;

baseDiag.warn = (channel, msg, payload) => emit('warn', channel, msg, payload);
baseDiag.error = (channel, msg, payload) => emit('error', channel, msg, payload);

export const diag: DiagFn = baseDiag;
