/**
 * ConfiguratorState — internal draft state for the configurator step-flow.
 *
 * Mirrors the field set consumed by the ported engines (`event-engine`,
 * `field-intelligence`) plus the per-substep BOM line buckets that the
 * Phase 2 backend pricing engine expects under `config_data[stepKey]`.
 *
 * Persistence model:
 *  - The full state is serialised into `configuration.config_data` on
 *    autosave / manual save.
 *  - On load, `hydrate(existing.config_data)` restores the same envelope.
 *  - The shape is intentionally flat & JSON-safe (strings, plain objects).
 */

import type {
  SystemParameters,
  SectionDefinition,
  ElectricalProtection,
  LayoutHardware,
  SelectedBreaker,
  SelectedComponentLine,
} from '../types';
import {
  DEFAULT_SYSTEM_PARAMETERS,
  DEFAULT_SECTION_DEFINITION,
  DEFAULT_ELECTRICAL_PROTECTION,
  DEFAULT_LAYOUT_HARDWARE,
} from '../types';
import type { ConfiguratorStepKey } from '../../services/configuratorService';

export interface ConfiguratorState {
  /** ── System-level ─────────────────────────────────────────────── */
  systemParameters: SystemParameters;

  /** ── Section 1 (always present) ───────────────────────────────── */
  section1Definition: SectionDefinition;
  section1ElectricalProtection: ElectricalProtection;
  section1LayoutHardware: LayoutHardware;
  section1BreakerTypeFilter: string;
  section1SelectedBreakers: SelectedBreaker[];

  /** ── Sections 2..6 (sparse keyed records) ─────────────────────── */
  sectionDefinitions: Record<number, SectionDefinition>;
  sectionElectricals: Record<number, ElectricalProtection>;
  sectionLayouts: Record<number, LayoutHardware>;
  sectionBreakerTypeFilters: Record<number, string>;
  sectionSelectedBreakers: Record<number, SelectedBreaker[]>;

  /** ── Per-substep component-line buckets ───────────────────────── */
  stepLines: Partial<Record<ConfiguratorStepKey, SelectedComponentLine[]>>;

  /** ── Per-substep free-form notes (for sld / plus_comp etc.) ───── */
  stepNotes: Partial<Record<ConfiguratorStepKey, string>>;
}

export const EMPTY_STATE: ConfiguratorState = {
  systemParameters: { ...DEFAULT_SYSTEM_PARAMETERS },
  section1Definition: { ...DEFAULT_SECTION_DEFINITION },
  section1ElectricalProtection: { ...DEFAULT_ELECTRICAL_PROTECTION },
  section1LayoutHardware: { ...DEFAULT_LAYOUT_HARDWARE },
  section1BreakerTypeFilter: '',
  section1SelectedBreakers: [],
  sectionDefinitions: {},
  sectionElectricals: {},
  sectionLayouts: {},
  sectionBreakerTypeFilters: {},
  sectionSelectedBreakers: {},
  stepLines: {},
  stepNotes: {},
};

/** Discriminated-union of state mutations. */
export type ConfiguratorAction =
  | { type: 'hydrate'; payload: Partial<ConfiguratorState> }
  | { type: 'setSystemParameters'; payload: SystemParameters }
  | { type: 'setSection1Definition'; payload: SectionDefinition }
  | { type: 'setSection1Electrical'; payload: ElectricalProtection }
  | { type: 'setSection1Layout'; payload: LayoutHardware }
  | { type: 'setSection1BreakerTypeFilter'; payload: string }
  | { type: 'setSection1SelectedBreakers'; payload: SelectedBreaker[] }
  | { type: 'setSectionDefinition'; sectionNumber: number; payload: SectionDefinition }
  | { type: 'setSectionElectrical'; sectionNumber: number; payload: ElectricalProtection }
  | { type: 'setSectionLayout'; sectionNumber: number; payload: LayoutHardware }
  | { type: 'setSectionElectricals'; payload: Record<number, ElectricalProtection> }
  | { type: 'setSectionLayouts'; payload: Record<number, LayoutHardware> }
  | { type: 'setSectionBreakerTypeFilter'; sectionNumber: number; payload: string }
  | { type: 'setSectionSelectedBreakers'; sectionNumber: number; payload: SelectedBreaker[] }
  | { type: 'setStepLines'; stepKey: ConfiguratorStepKey; payload: SelectedComponentLine[] }
  | { type: 'upsertStepLine'; stepKey: ConfiguratorStepKey; payload: SelectedComponentLine }
  | { type: 'removeStepLine'; stepKey: ConfiguratorStepKey; componentId: string }
  | { type: 'setStepNote'; stepKey: ConfiguratorStepKey; payload: string }
  | { type: 'reset' };

export function configuratorReducer(
  state: ConfiguratorState,
  action: ConfiguratorAction
): ConfiguratorState {
  switch (action.type) {
    case 'hydrate':
      return { ...EMPTY_STATE, ...state, ...action.payload };
    case 'setSystemParameters':
      return { ...state, systemParameters: action.payload };
    case 'setSection1Definition':
      return { ...state, section1Definition: action.payload };
    case 'setSection1Electrical':
      return { ...state, section1ElectricalProtection: action.payload };
    case 'setSection1Layout':
      return { ...state, section1LayoutHardware: action.payload };
    case 'setSection1BreakerTypeFilter':
      return { ...state, section1BreakerTypeFilter: action.payload };
    case 'setSection1SelectedBreakers':
      return { ...state, section1SelectedBreakers: action.payload };
    case 'setSectionDefinition':
      return {
        ...state,
        sectionDefinitions: { ...state.sectionDefinitions, [action.sectionNumber]: action.payload },
      };
    case 'setSectionElectrical':
      return {
        ...state,
        sectionElectricals: { ...state.sectionElectricals, [action.sectionNumber]: action.payload },
      };
    case 'setSectionLayout':
      return {
        ...state,
        sectionLayouts: { ...state.sectionLayouts, [action.sectionNumber]: action.payload },
      };
    case 'setSectionElectricals':
      return { ...state, sectionElectricals: action.payload };
    case 'setSectionLayouts':
      return { ...state, sectionLayouts: action.payload };
    case 'setSectionBreakerTypeFilter':
      return {
        ...state,
        sectionBreakerTypeFilters: {
          ...state.sectionBreakerTypeFilters,
          [action.sectionNumber]: action.payload,
        },
      };
    case 'setSectionSelectedBreakers':
      return {
        ...state,
        sectionSelectedBreakers: {
          ...state.sectionSelectedBreakers,
          [action.sectionNumber]: action.payload,
        },
      };
    case 'setStepLines':
      return {
        ...state,
        stepLines: { ...state.stepLines, [action.stepKey]: action.payload },
      };
    case 'upsertStepLine': {
      const prev = state.stepLines[action.stepKey] ?? [];
      const existing = prev.findIndex((l) => l.componentId === action.payload.componentId);
      const next =
        existing >= 0
          ? prev.map((l, i) => (i === existing ? { ...l, ...action.payload } : l))
          : [...prev, action.payload];
      return { ...state, stepLines: { ...state.stepLines, [action.stepKey]: next } };
    }
    case 'removeStepLine': {
      const prev = state.stepLines[action.stepKey] ?? [];
      return {
        ...state,
        stepLines: {
          ...state.stepLines,
          [action.stepKey]: prev.filter((l) => l.componentId !== action.componentId),
        },
      };
    }
    case 'setStepNote':
      return { ...state, stepNotes: { ...state.stepNotes, [action.stepKey]: action.payload } };
    case 'reset':
      return EMPTY_STATE;
    default:
      return state;
  }
}

/**
 * Pack the in-memory state into the envelope persisted in
 * `configuration.config_data`. Mirrors `configHydrate()` inverse.
 */
export function configSerialize(state: ConfiguratorState): Record<string, unknown> {
  return {
    systemParameters: state.systemParameters,
    section1: {
      definition: state.section1Definition,
      electricalProtection: state.section1ElectricalProtection,
      layoutHardware: state.section1LayoutHardware,
      breakerTypeFilter: state.section1BreakerTypeFilter,
      selectedBreakers: state.section1SelectedBreakers,
    },
    sections: {
      definitions: state.sectionDefinitions,
      electricals: state.sectionElectricals,
      layouts: state.sectionLayouts,
      breakerTypeFilters: state.sectionBreakerTypeFilters,
      selectedBreakers: state.sectionSelectedBreakers,
    },
    stepLines: state.stepLines,
    stepNotes: state.stepNotes,
  };
}

/** Restore an in-memory state from a previously-persisted envelope. */
export function configHydrate(blob: Record<string, unknown> | null | undefined): ConfiguratorState {
  if (!blob || typeof blob !== 'object') return EMPTY_STATE;
  const b = blob as any;
  const section1 = b.section1 ?? {};
  const sections = b.sections ?? {};
  return {
    systemParameters: { ...DEFAULT_SYSTEM_PARAMETERS, ...(b.systemParameters ?? {}) },
    section1Definition: { ...DEFAULT_SECTION_DEFINITION, ...(section1.definition ?? {}) },
    section1ElectricalProtection: {
      ...DEFAULT_ELECTRICAL_PROTECTION,
      ...(section1.electricalProtection ?? {}),
    },
    section1LayoutHardware: { ...DEFAULT_LAYOUT_HARDWARE, ...(section1.layoutHardware ?? {}) },
    section1BreakerTypeFilter: section1.breakerTypeFilter ?? '',
    section1SelectedBreakers: Array.isArray(section1.selectedBreakers)
      ? (section1.selectedBreakers as SelectedBreaker[])
      : [],
    sectionDefinitions: sections.definitions ?? {},
    sectionElectricals: sections.electricals ?? {},
    sectionLayouts: sections.layouts ?? {},
    sectionBreakerTypeFilters: sections.breakerTypeFilters ?? {},
    sectionSelectedBreakers: sections.selectedBreakers ?? {},
    stepLines: b.stepLines ?? {},
    stepNotes: b.stepNotes ?? {},
  };
}
