/**
 * ConfiguratorProvider
 * ════════════════════════════════════════════════════════════════════════
 * React Context wrapper that holds the configurator draft state, runs the
 * Event Engine (Module 11) pipeline on every state transition via useMemo,
 * and exposes a typed action dispatcher.
 *
 * Persistence:
 *  - Caller passes a `Configuration` row (Phase 2 backend) on mount.
 *  - State is hydrated from `configuration.config_data`.
 *  - An autosave timer (default 1500 ms) flushes the serialized envelope
 *    back via `configuratorService.updateConfiguration`.
 *  - `flush()` is exposed for the manual "Save" button.
 *
 * Field intelligence:
 *  - `useFieldIntelligence` hook is wired against the live state slices.
 *  - Auto-fills are pushed back into the reducer through controlled
 *    setSystemParameters / setSection*Electrical / setSection*Layout actions.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { executePipeline, type PipelineOutputs } from '../lib/event-engine';
import { CIRCUIT_BREAKER_V2_DATA } from '../data/circuitBreakerV2Data';
import { useFieldIntelligence } from '../hooks/useFieldIntelligence';
import { type FieldIntelligenceResult } from '../lib/field-intelligence';
import { configuratorService } from '../../services/configuratorService';
import type { Configuration } from '../../services/configuratorService';
import { diag } from '../../utils/diag';
import {
  configuratorReducer,
  configHydrate,
  configSerialize,
  EMPTY_STATE,
  type ConfiguratorAction,
  type ConfiguratorState,
} from './state';

interface ConfiguratorContextValue {
  state: ConfiguratorState;
  dispatch: React.Dispatch<ConfiguratorAction>;
  pipelineResult: PipelineOutputs;
  fieldIntelligence: FieldIntelligenceResult;
  configuration: Configuration | null;
  saving: boolean;
  dirty: boolean;
  /** Force-flush autosave immediately (used by "Save" button + step advance). */
  flush: () => Promise<void>;
  /** Rename the active configuration. */
  rename: (name: string) => Promise<void>;
}

const Ctx = createContext<ConfiguratorContextValue | null>(null);

interface ConfiguratorProviderProps {
  configuration: Configuration;
  /** Called after each successful autosave (UI can reflect timestamp). */
  onPersist?: (next: Configuration) => void;
  /** Debounce in ms before autosave fires. */
  autosaveMs?: number;
  children: React.ReactNode;
}

export const ConfiguratorProvider: React.FC<ConfiguratorProviderProps> = ({
  configuration,
  onPersist,
  autosaveMs = 1500,
  children,
}) => {
  const [config, setConfig] = useState<Configuration>(configuration);
  const [state, dispatch] = useReducer(
    configuratorReducer,
    null,
    () => configHydrate((configuration.config_data ?? null) as Record<string, unknown> | null)
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const skipFirstDirtyRef = useRef(true);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Monotonic request token. Each persist() call snapshots the current
   * value; only the most-recent in-flight request is allowed to commit
   * its result back to React state. This prevents a slow earlier request
   * from clobbering a faster later one.
   */
  const persistTokenRef = useRef(0);

  /* ── Hydrate when caller swaps configurations ─────────────────────── */
  useEffect(() => {
    setConfig(configuration);
    dispatch({
      type: 'hydrate',
      payload: configHydrate(
        (configuration.config_data ?? null) as Record<string, unknown> | null
      ),
    });
    skipFirstDirtyRef.current = true;
    setDirty(false);
  }, [configuration.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mark dirty on state changes (skip the initial hydrate tick) ───── */
  useEffect(() => {
    if (skipFirstDirtyRef.current) {
      skipFirstDirtyRef.current = false;
      return;
    }
    setDirty(true);
  }, [state]);

  /* ── Pipeline result (Event Engine Module 11) ──────────────────────── */
  const pipelineResult = useMemo<PipelineOutputs>(() => {
    try {
      // Build section input states from state slices.
      const sectionsInput: any[] = [];
      sectionsInput.push({
        sectionNumber: 1,
        electricalProtection: {
          connectedLoad: state.section1ElectricalProtection.connectedLoad,
          demandFactor: state.section1ElectricalProtection.demandFactor,
          diversityFactor: state.section1ElectricalProtection.diversityFactor,
          sectionRatedCurrent: state.section1ElectricalProtection.sectionRatedCurrent,
          feederType: state.section1ElectricalProtection.feederType,
          continuousLoad: state.section1ElectricalProtection.continuousLoad,
        },
        definition: {
          sectionType: state.section1Definition.sectionType,
          sectionFunction: state.section1Definition.sectionFunction,
          sectionName: state.section1Definition.sectionName,
        },
        layoutHardware: {
          mountingStructure: state.section1LayoutHardware.mountingStructure,
          stacking: state.section1LayoutHardware.stacking,
          cableEntry: state.section1LayoutHardware.cableEntry,
          cableExit: state.section1LayoutHardware.cableExit,
        },
        selectedBreakers: state.section1SelectedBreakers,
        breakerTypeFilter: state.section1BreakerTypeFilter,
      });

      for (const sn of [2, 3, 4, 5, 6]) {
        const def = state.sectionDefinitions[sn];
        const elec = state.sectionElectricals[sn];
        const lay = state.sectionLayouts[sn];
        if (!def && !elec && !lay) continue;
        sectionsInput.push({
          sectionNumber: sn,
          electricalProtection: {
            connectedLoad: elec?.connectedLoad ?? '',
            demandFactor: elec?.demandFactor ?? '',
            diversityFactor: elec?.diversityFactor ?? '',
            sectionRatedCurrent: elec?.sectionRatedCurrent ?? '',
            feederType: elec?.feederType ?? '',
            continuousLoad: elec?.continuousLoad ?? '',
          },
          definition: {
            sectionType: def?.sectionType ?? '',
            sectionFunction: def?.sectionFunction ?? '',
            sectionName: def?.sectionName ?? '',
          },
          layoutHardware: {
            mountingStructure: lay?.mountingStructure ?? '',
            stacking: lay?.stacking ?? '',
            cableEntry: lay?.cableEntry ?? '',
            cableExit: lay?.cableExit ?? '',
          },
          selectedBreakers: state.sectionSelectedBreakers[sn] ?? [],
          breakerTypeFilter: state.sectionBreakerTypeFilters[sn] ?? '',
        });
      }

      const sys = state.systemParameters;
      return executePipeline({
        system: {
          systemVoltage: sys.systemVoltage,
          phase: sys.phase,
          shortCircuitRating: sys.shortCircuitRating,
          mainBusRating: sys.mainBusRating,
          busConfiguration: sys.busConfiguration,
          height: sys.height,
          sectionWidth: sys.sectionWidth,
          depth: sys.depth,
          cableEntry: sys.cableEntry,
          cableExit: sys.cableExit,
          accessType: sys.accessType,
        },
        sections: sectionsInput,
        breakerCatalog: CIRCUIT_BREAKER_V2_DATA,
      });
    } catch (e) {
      // Pipeline failure → degraded but non-crashing UI. Engines log internally.
      // eslint-disable-next-line no-console
      console.warn('[ConfiguratorProvider] pipeline error', e);
      return executePipeline({
        system: {
          systemVoltage: '', phase: '', shortCircuitRating: '', mainBusRating: '',
          busConfiguration: '', height: '', sectionWidth: '', depth: '',
          cableEntry: '', cableExit: '', accessType: '',
        },
        sections: [],
        breakerCatalog: CIRCUIT_BREAKER_V2_DATA,
      });
    }
  }, [state]);

  /* ── Field-intelligence hook (auto-fills + intelligent resets) ─────── */
  const { fieldIntelligence } = useFieldIntelligence({
    systemParameters: state.systemParameters,
    setSystemParameters: useCallback(
      (next) => dispatch({ type: 'setSystemParameters', payload: next }),
      []
    ),
    section1Definition: state.section1Definition,
    section1ElectricalProtection: state.section1ElectricalProtection,
    section1LayoutHardware: state.section1LayoutHardware,
    section1BreakerTypeFilter: state.section1BreakerTypeFilter,
    setSection1ElectricalProtection: useCallback(
      (next) => dispatch({ type: 'setSection1Electrical', payload: next }),
      []
    ),
    setSection1LayoutHardware: useCallback(
      (next) => dispatch({ type: 'setSection1Layout', payload: next }),
      []
    ),
    sectionDefinitions: state.sectionDefinitions,
    sectionElectricals: state.sectionElectricals,
    sectionLayouts: state.sectionLayouts,
    sectionBreakerTypeFilters: state.sectionBreakerTypeFilters,
    setSectionElectricals: useCallback(
      (next) => dispatch({ type: 'setSectionElectricals', payload: next }),
      []
    ),
    setSectionLayouts: useCallback(
      (next) => dispatch({ type: 'setSectionLayouts', payload: next }),
      []
    ),
    pipelineResult,
  });

  /* ── Persistence helpers ──────────────────────────────────────────── */
  const persist = useCallback(async (): Promise<void> => {
    if (!config?.id) return;
    const myToken = ++persistTokenRef.current;
    const startedAt = Date.now();
    setSaving(true);
    try {
      const next = await configuratorService.updateConfiguration(config.id, {
        config_data: configSerialize(state) as any,
      });
      // Stale-response guard: drop result if a newer persist has started.
      if (myToken !== persistTokenRef.current) {
        diag('autosave', 'stale response dropped', { id: config.id, token: myToken });
        return;
      }
      setConfig((prev) => ({ ...prev, ...next }));
      setDirty(false);
      diag('autosave', 'persisted', { id: config.id, ms: Date.now() - startedAt });
      onPersist?.(next);
    } catch (err) {
      // Keep `dirty=true` so the next state change retries on the debounce.
      diag.error('autosave', 'failed', err);
    } finally {
      if (myToken === persistTokenRef.current) setSaving(false);
    }
  }, [config?.id, state, onPersist]);

  /* ── Autosave debounce ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!dirty) return;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      void persist();
    }, autosaveMs);
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [dirty, state, persist, autosaveMs]);

  const flush = useCallback(async () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    await persist();
  }, [persist]);

  const rename = useCallback(
    async (name: string) => {
      if (!config?.id) return;
      const next = await configuratorService.updateConfiguration(config.id, { name });
      setConfig((prev) => ({ ...prev, ...next }));
      onPersist?.(next);
    },
    [config?.id, onPersist]
  );

  const ctxValue = useMemo<ConfiguratorContextValue>(
    () => ({
      state,
      dispatch,
      pipelineResult,
      fieldIntelligence,
      configuration: config,
      saving,
      dirty,
      flush,
      rename,
    }),
    [state, pipelineResult, fieldIntelligence, config, saving, dirty, flush, rename]
  );

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
};

/** Hook to consume the configurator context inside step panels. */
export function useConfigurator(): ConfiguratorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfigurator must be used inside <ConfiguratorProvider>');
  return v;
}

export { EMPTY_STATE };
export type { ConfiguratorState, ConfiguratorAction };
