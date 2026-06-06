/**
 * componentCatalogCache — Phase 6
 * ════════════════════════════════════════════════════════════════════════
 * Tiny in-memory, TTL-bounded cache for `configuratorService.listComponents`
 * results, keyed by category. Eliminates redundant network calls when the
 * same step (or the +Comp omnibus picker) is re-mounted within the user's
 * session.
 *
 * Design notes (intentionally minimal — see Phase 5 §11 acceptance):
 *  • In-memory only. No localStorage / IndexedDB — avoids stale-tenant
 *    leaks across logins.
 *  • TTL: 5 minutes. Catalog data changes via DB seed updates; this gives
 *    inventory edits visibility within a single session without a hard
 *    reload.
 *  • Coalesces concurrent in-flight requests for the same category so a
 *    burst mount (e.g. CategoryComponentPicker x 14 categories) results
 *    in at most one network call per category.
 *  • `invalidate()` is exposed for explicit refresh.
 *  • Tenant-safe: `clearAll()` is fired on auth:session-expired.
 * ════════════════════════════════════════════════════════════════════════
 */
import { configuratorService } from '../services/configuratorService';
import type { ConfiguratorComponent } from '../services/configuratorService';

const TTL_MS = 5 * 60 * 1000;

interface Entry {
  data: ConfiguratorComponent[];
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<ConfiguratorComponent[]>>();

function key(category: string): string {
  return `cat::${category}`;
}

export async function getCategory(category: string): Promise<ConfiguratorComponent[]> {
  const k = key(category);
  const now = Date.now();
  const cached = cache.get(k);
  if (cached && cached.expiresAt > now) return cached.data;

  const pending = inflight.get(k);
  if (pending) return pending;

  const p = configuratorService
    .listComponents({ category, limit: 500 })
    .then((data) => {
      cache.set(k, { data, expiresAt: Date.now() + TTL_MS });
      inflight.delete(k);
      return data;
    })
    .catch((err) => {
      inflight.delete(k);
      throw err;
    });

  inflight.set(k, p);
  return p;
}

export async function getCategories(categories: string[]): Promise<ConfiguratorComponent[]> {
  const lists = await Promise.all(categories.map((c) => getCategory(c)));
  const seen = new Set<string>();
  const merged: ConfiguratorComponent[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
  }
  return merged;
}

export function invalidate(category?: string): void {
  if (category) {
    cache.delete(key(category));
    inflight.delete(key(category));
    return;
  }
  cache.clear();
  inflight.clear();
}

export function clearAll(): void {
  cache.clear();
  inflight.clear();
}

// Tenant safety: nuke cache on session expiry so a re-login with a different
// tenant context cannot serve stale data.
if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-expired', clearAll);
  // Component-master mutations (create / update / delete / restore) broadcast
  // `tps:category-updated`. Drop the cache so the next chip mount fetches fresh
  // rows instead of waiting for the 5-minute TTL.
  window.addEventListener('tps:category-updated', clearAll);
}
