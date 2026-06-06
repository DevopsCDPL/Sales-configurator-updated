/**
 * useConfiguratorParts — adapter hook that exposes the latest configurator
 * BOM as a CustomPart[]-shaped list so legacy downstream tabs (WorkOrder,
 * Production, Travellers, Quality, Logistics) can keep their existing
 * row/index logic without an estimate.
 *
 * Pipeline:
 *   1. configuratorService.listConfigurations({ project_id })  → newest cfg
 *   2. quotationCompilerService.preview(cfg.id)                → live BOM
 *   3. mapBomItemToCustomPart(item)                            → CustomPart
 *
 * Caching (Phase D hardening)
 * ───────────────────────────
 * A module-scoped Map caches preview results keyed by
 *   `${configurationId}:${configuration.updated_at}`
 * so that:
 *   • Rapid tab switching across the 12-step workflow does NOT re-run the
 *     pricing engine for every mount.
 *   • An autosave / version bump in the configurator flips updated_at,
 *     which naturally invalidates the cache entry on the next listing.
 *   • In-flight fetches are deduped via a stored Promise so two tabs
 *     mounting concurrently share one POST /configurator/preview call.
 *   • Tenant isolation is preserved because the cache lives in the same
 *     JS process as the axios instance — every entry was fetched with the
 *     current user's auth token. The cache is reset on logout via
 *     `clearConfiguratorPartsCache()` (call from auth-context teardown).
 *
 * The hook still calls `listConfigurations` on every project change to
 * pick up new updated_at values; only the expensive preview compile is
 * cached. `refresh()` drops the cached entry for the active configuration
 * and re-fetches.
 *
 * Notes
 * -----
 * • Only the fields that downstream tabs actually read are populated.
 *   Manufacturing-specific fields (raw_material_id, parts_master_id,
 *   material_grade, weights, …) are intentionally left empty because they
 *   live in Part Master, not in the configurator BOM.
 *
 * • Falls back to the legacy `project.estimate.all_items` /
 *   `project.estimate.custom_parts` source if no configuration exists or
 *   the preview returns zero items. This preserves backward compatibility
 *   for any project still on the pre-configurator workflow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { configuratorService } from '../services/configuratorService';
import { quotationCompilerService } from '../services/quotationCompilerService';
import { diag } from '../utils/diag';
import type { Project, CustomPart } from '../types';

export interface ConfiguratorPartsState {
  /** Adapter list ordered identically to compiler output (line_number asc). */
  parts: CustomPart[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** True when the parts list came from a live configurator preview. */
  fromConfigurator: boolean;
  /** The configuration UUID the parts were derived from, if any. */
  configurationId: string | null;
  /** Force a refetch (bypasses the in-memory cache for this configuration). */
  refresh: () => Promise<void>;
}

interface CacheEntry {
  /** updated_at the entry was keyed against — for diag visibility only. */
  versionKey: string;
  parts: CustomPart[];
  fromConfigurator: boolean;
  /** Resolves to mapped parts while a fetch is in flight (dedup). */
  inFlight?: Promise<CustomPart[]>;
}

/* Module-scoped cache. Key = `${configurationId}:${updated_at ?? 'null'}`. */
const cache = new Map<string, CacheEntry>();

/** Drop cached entries for a single configuration (any version), or all. */
export function invalidateConfiguratorPartsCache(configurationId?: string): void {
  if (!configurationId) {
    diag('workflow', 'cache cleared', { reason: 'manual.full' });
    cache.clear();
    return;
  }
  let removed = 0;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${configurationId}:`)) {
      cache.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    diag('workflow', 'cache invalidated', { configurationId, entries: removed });
  }
}

/** Reset everything — call on auth/tenant change (e.g. logout). */
export function clearConfiguratorPartsCache(): void {
  diag('workflow', 'cache cleared', { reason: 'tenant.reset' });
  cache.clear();
}

/**
 * Map a single configurator quotation BOM item to a CustomPart-shaped row.
 * Only fields that downstream UI code reads from `customParts[i]` are
 * populated; everything else is left undefined so optional-chaining /
 * `|| ''` fallbacks keep behaving sensibly.
 */
export function mapBomItemToCustomPart(item: any, idx: number): CustomPart {
  return {
    // Stable synthetic id — must be a string and unique per row.
    id: String(item.id || item.line_number || idx),
    job_description: String(item.description || item.part_number || `Item ${idx + 1}`),
    drawing_part_no: String(item.part_number || ''),
    quantity: Number(item.quantity) || 0,
    job_cost_per_unit: Number(item.unit_cost ?? item.unit_price) || 0,
    total_cost: Number(item.total_cost ?? item.extended) || 0,
    // Required-by-type but not surfaced for configurator parts.
    material: '',
    material_grade: '',
    drawing_given_by_client: 'No',
    raw_material_supplied_by: '',
    raw_material_dimension: '',
  } as CustomPart;
}

/**
 * Returns the latest configurator BOM expressed as a CustomPart-shaped list.
 * Falls back to the legacy estimate parts list if no configuration exists.
 */
export function useConfiguratorParts(project: Project | null | undefined): ConfiguratorPartsState {
  const [parts, setParts] = useState<CustomPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromConfigurator, setFromConfigurator] = useState(false);
  const [configurationId, setConfigurationId] = useState<string | null>(null);

  /* Tracks the most recent fetch so out-of-order responses are ignored
   * (e.g. user navigates project A → B → A in quick succession). */
  const fetchSeq = useRef(0);

  const legacyParts = useMemo<CustomPart[]>(() => {
    const est: any = (project as any)?.estimate;
    return (est?.all_items ?? est?.custom_parts ?? []) as CustomPart[];
  }, [project]);

  const load = useCallback(async (opts?: { bypassCache?: boolean }) => {
    const seq = ++fetchSeq.current;
    if (!project?.id) {
      setParts([]);
      setLoading(false);
      setFromConfigurator(false);
      setConfigurationId(null);
      return;
    }
    setLoading(true);
    try {
      const list = await configuratorService.listConfigurations({ project_id: project.id });
      if (seq !== fetchSeq.current) return; // stale response — newer load() in flight
      if (!list || list.length === 0) {
        diag('workflow', 'fallback to estimate', { projectId: project.id, reason: 'no.configuration' });
        setParts(legacyParts);
        setFromConfigurator(false);
        setConfigurationId(null);
        return;
      }
      const newest = [...list].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      )[0];
      const cfgId = newest.id;
      const versionKey = newest.updated_at ?? 'null';
      const cacheKey = `${cfgId}:${versionKey}`;
      setConfigurationId(cfgId);

      // Drop stale entries for this configurationId (different versionKey)
      // so the Map doesn't grow unbounded across edits.
      if (opts?.bypassCache) {
        invalidateConfiguratorPartsCache(cfgId);
      } else {
        for (const key of Array.from(cache.keys())) {
          if (key.startsWith(`${cfgId}:`) && key !== cacheKey) cache.delete(key);
        }
      }

      const cached = !opts?.bypassCache ? cache.get(cacheKey) : undefined;
      if (cached && !cached.inFlight) {
        diag('workflow', 'cache hit', { configurationId: cfgId, versionKey, items: cached.parts.length });
        setParts(cached.parts);
        setFromConfigurator(cached.fromConfigurator);
        return;
      }
      if (cached?.inFlight) {
        diag('workflow', 'cache hit (in-flight dedup)', { configurationId: cfgId, versionKey });
        try {
          await cached.inFlight;
          if (seq !== fetchSeq.current) return;
          const settled = cache.get(cacheKey);
          setParts(settled?.parts ?? legacyParts);
          setFromConfigurator(settled?.fromConfigurator ?? false);
        } catch {
          if (seq !== fetchSeq.current) return;
          setParts(legacyParts);
          setFromConfigurator(false);
        }
        return;
      }

      diag('workflow', 'cache miss → preview', { configurationId: cfgId, versionKey });
      const previewPromise = (async (): Promise<CustomPart[]> => {
        const t0 = Date.now();
        try {
          const preview = await quotationCompilerService.preview(cfgId);
          const items: any[] = preview?.items ?? [];
          const mapped = items.length > 0 ? items.map(mapBomItemToCustomPart) : [];
          diag('workflow', 'preview compiled', { configurationId: cfgId, items: mapped.length, ms: Date.now() - t0 });
          return mapped;
        } catch (err: any) {
          diag.warn('workflow', 'preview failed', { configurationId: cfgId, err: err?.message });
          throw err;
        }
      })();

      // Reserve the cache slot immediately so concurrent mounts dedup.
      cache.set(cacheKey, { versionKey, parts: [], fromConfigurator: false, inFlight: previewPromise });

      try {
        const mapped = await previewPromise;
        const useConfigurator = mapped.length > 0;
        const finalParts = useConfigurator ? mapped : legacyParts;
        cache.set(cacheKey, { versionKey, parts: finalParts, fromConfigurator: useConfigurator });
        if (!useConfigurator) {
          diag('workflow', 'fallback to estimate', { configurationId: cfgId, reason: 'empty.bom' });
        }
        if (seq !== fetchSeq.current) return;
        setParts(finalParts);
        setFromConfigurator(useConfigurator);
      } catch {
        // Preview failed — drop the in-flight slot so the next mount retries.
        cache.delete(cacheKey);
        if (seq !== fetchSeq.current) return;
        setParts(legacyParts);
        setFromConfigurator(false);
      }
    } catch (err: any) {
      diag.warn('workflow', 'list configurations failed', { projectId: project.id, err: err?.message });
      if (seq !== fetchSeq.current) return;
      setParts(legacyParts);
      setFromConfigurator(false);
      setConfigurationId(null);
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [project?.id, legacyParts]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load({ bypassCache: true });
  }, [load]);

  return { parts, loading, fromConfigurator, configurationId, refresh };
}
