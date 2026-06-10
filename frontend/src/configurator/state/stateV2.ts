/**
 * stateV2.ts — Phase A spec §5 (ConfiguratorStateV2)
 *
 * Uniform switchboards[] / sections[] / componentLines[] state with
 * envelopeVersion and a transparent v1 → v2 migration on hydrate.
 * v1 envelopes are NEVER written back.
 *
 * Feature flag: CONFIGURATOR_V2_SPINE (caller decides which state to use).
 */

import type {
  SystemParameters,
  SectionDefinition,
  ElectricalProtection,
  LayoutHardware,
} from '../types';
import {
  DEFAULT_SYSTEM_PARAMETERS,
  DEFAULT_SECTION_DEFINITION,
  DEFAULT_ELECTRICAL_PROTECTION,
  DEFAULT_LAYOUT_HARDWARE,
} from '../types';

export type PriceStatus = 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
export type LineScope = 'board' | 'section';
export type LineSource = 'user' | 'auto' | 'builder' | 'standard' | 'generator';

export interface ComponentLineV2 {
  lineId: string;
  scope: LineScope;
  sectionIndex?: number;
  componentId?: string;
  category: string;
  partNumber?: string;
  name?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
  priceStatus: PriceStatus;
  laborHours?: Record<string, number>;
  source: LineSource;
  builderPayload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface LaborAdjustmentLine {
  lineId: string;
  bucket: 'CU' | 'ASM' | 'CNT' | 'QC' | 'TST' | 'ENG' | 'CAD';
  hours: number;
  reason: string;
  sectionIndex?: number;
}

export interface SectionStateV2 {
  sectionIndex: number;
  definition: SectionDefinition;
  electrical: ElectricalProtection;
  layoutHardware: LayoutHardware;
  breakerTypeFilter: string;
  deviceLines: ComponentLineV2[];
  computed?: Record<string, unknown>;
}

export interface FieldOverride {
  field: string;
  ruleId: string;
  reason?: string;
  at: string; // ISO
}

export interface SwitchboardStateV2 {
  id: string;
  name: string;
  standardsRegime: 'UL' | 'IEC';
  boardType?: string;
  serviceEntrance: boolean;
  boardParameters: SystemParameters;
  intake?: Record<string, unknown> | null;
  sections: SectionStateV2[];
  componentLines: ComponentLineV2[];
  laborAdjustments: LaborAdjustmentLine[];
  fieldOverrides: FieldOverride[];
  stepNotes: Record<string, string>;
}

export interface ConfiguratorStateV2 {
  envelopeVersion: 2;
  switchboards: SwitchboardStateV2[];
  activeSwitchboardIndex: number;
}

export const MAX_SECTIONS_DEFAULT = 10;

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export function emptySection(sectionIndex: number): SectionStateV2 {
  return {
    sectionIndex,
    definition: { ...DEFAULT_SECTION_DEFINITION },
    electrical: { ...DEFAULT_ELECTRICAL_PROTECTION },
    layoutHardware: { ...DEFAULT_LAYOUT_HARDWARE },
    breakerTypeFilter: '',
    deviceLines: [],
  };
}

export function emptySwitchboard(name = 'Switchboard 1'): SwitchboardStateV2 {
  return {
    id: uid(),
    name,
    standardsRegime: 'UL',
    serviceEntrance: false,
    boardParameters: { ...DEFAULT_SYSTEM_PARAMETERS },
    intake: null,
    sections: [emptySection(1)],
    componentLines: [],
    laborAdjustments: [],
    fieldOverrides: [],
    stepNotes: {},
  };
}

export const EMPTY_STATE_V2: ConfiguratorStateV2 = {
  envelopeVersion: 2,
  switchboards: [emptySwitchboard()],
  activeSwitchboardIndex: 0,
};

/** Category → default scope (Phase A §4.2). */
export const CATEGORY_DEFAULT_SCOPE: Record<string, LineScope> = {
  'CIRCUIT BREAKER': 'section',
  ENCLOSURE: 'section',
  'CURRENT TRANSFORMER': 'section',
  'VOLTAGE TRANSFORMER': 'section',
  CONTROLS: 'section',
  LIGHT: 'section',
  SWITCH: 'section',
  'POWER SUPPLY': 'section',
  GLASTIC: 'section',
  TERMINALS: 'section',
  LUGS: 'section',
  'WIRE CABLE': 'section',
  SAFETY: 'section',
  HARDWARE: 'board',
  CAMLOCK: 'board',
  CONDUIT: 'board',
  SPD: 'board',
  ATS: 'board',
  'STANDARD PRODUCT': 'board',
};

export function defaultScopeFor(category: string): LineScope {
  return CATEGORY_DEFAULT_SCOPE[category?.toUpperCase?.() ?? ''] ?? 'board';
}

/* ────────────────────────── v1 → v2 migration ───────────────────────── */

/** Legacy stepKey → category used when migrating v1 stepLines (board scope). */
const STEP_TO_CATEGORY: Record<string, string> = {
  enclosure: 'ENCLOSURE',
  bussing: 'LUGS',
  glastic: 'GLASTIC',
  cam_lock_panel: 'CAMLOCK',
  spd_ats: 'SPD',
  controls: 'CONTROLS',
  ct_vt_cpt: 'CURRENT TRANSFORMER',
  conduit_fittings: 'CONDUIT',
  wire_cable: 'WIRE CABLE',
  standard_bom: 'STANDARD PRODUCT',
  labour: 'LABOR',
  plus_comp: 'ADHOC',
};

export function isV2(blob: unknown): blob is ConfiguratorStateV2 {
  return !!blob && typeof blob === 'object' && (blob as any).envelopeVersion === 2;
}

/**
 * migrateV1toV2 — Phase A spec §9.2.
 * v1 had no section info on stepLines ⇒ board scope + meta.migratedScope.
 * selectedBreakers (section1 + sections map) → section deviceLines.
 */
export function migrateV1toV2(blob: Record<string, any> | null | undefined): ConfiguratorStateV2 {
  if (!blob || typeof blob !== 'object') return structuredCloneSafe(EMPTY_STATE_V2);
  if (isV2(blob)) return blob;

  const board = emptySwitchboard();
  board.boardParameters = { ...DEFAULT_SYSTEM_PARAMETERS, ...(blob.systemParameters ?? {}) };

  // sections: v1 section1 special case + sparse 2..6
  const sections: SectionStateV2[] = [];
  const s1 = blob.section1 ?? {};
  sections.push({
    sectionIndex: 1,
    definition: { ...DEFAULT_SECTION_DEFINITION, ...(s1.definition ?? {}) },
    electrical: { ...DEFAULT_ELECTRICAL_PROTECTION, ...(s1.electricalProtection ?? {}) },
    layoutHardware: { ...DEFAULT_LAYOUT_HARDWARE, ...(s1.layoutHardware ?? {}) },
    breakerTypeFilter: s1.breakerTypeFilter ?? '',
    deviceLines: (Array.isArray(s1.selectedBreakers) ? s1.selectedBreakers : []).map(breakerToLine(1)),
  });
  const sx = blob.sections ?? {};
  const idxs = new Set<number>([
    ...Object.keys(sx.definitions ?? {}).map(Number),
    ...Object.keys(sx.electricals ?? {}).map(Number),
    ...Object.keys(sx.layouts ?? {}).map(Number),
    ...Object.keys(sx.selectedBreakers ?? {}).map(Number),
  ]);
  [...idxs].filter((n) => Number.isFinite(n) && n >= 2).sort((a, b) => a - b).forEach((n) => {
    sections.push({
      sectionIndex: n,
      definition: { ...DEFAULT_SECTION_DEFINITION, ...(sx.definitions?.[n] ?? {}) },
      electrical: { ...DEFAULT_ELECTRICAL_PROTECTION, ...(sx.electricals?.[n] ?? {}) },
      layoutHardware: { ...DEFAULT_LAYOUT_HARDWARE, ...(sx.layouts?.[n] ?? {}) },
      breakerTypeFilter: sx.breakerTypeFilters?.[n] ?? '',
      deviceLines: (Array.isArray(sx.selectedBreakers?.[n]) ? sx.selectedBreakers[n] : []).map(breakerToLine(n)),
    });
  });
  board.sections = sections;

  // stepLines → board-scope componentLines (flagged for estimator review)
  const lines: ComponentLineV2[] = [];
  for (const [stepKey, arr] of Object.entries(blob.stepLines ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const l of arr as any[]) {
      lines.push({
        lineId: uid(),
        scope: 'board',
        componentId: l.componentId,
        category: STEP_TO_CATEGORY[stepKey] ?? stepKey.toUpperCase(),
        partNumber: l.partNumber,
        name: l.name,
        quantity: Number(l.quantity) || 1,
        unitPrice: l.unitPrice,
        priceStatus: 'FIRM',
        source: 'user',
        meta: { ...(l.meta ?? {}), migratedScope: true, migratedFromStep: stepKey },
      });
    }
  }
  board.componentLines = lines;
  board.stepNotes = { ...(blob.stepNotes ?? {}) };

  return { envelopeVersion: 2, switchboards: [board], activeSwitchboardIndex: 0 };
}

function breakerToLine(sectionIndex: number) {
  return (b: any): ComponentLineV2 => ({
    lineId: uid(),
    scope: 'section',
    sectionIndex,
    category: 'CIRCUIT BREAKER',
    partNumber: b.modelNumber ?? b.catalogueNumber,
    name: [b.manufacturer, b.series, b.modelNumber].filter(Boolean).join(' ') || b.breakerType,
    quantity: 1,
    priceStatus: 'FIRM',
    source: 'user',
    meta: { legacyBreaker: b },
  });
}

function structuredCloneSafe<T>(x: T): T {
  return typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
}

/* ────────────────────────── serialize / hydrate ─────────────────────── */

export function serializeV2(state: ConfiguratorStateV2): Record<string, unknown> {
  return { ...state, envelopeVersion: 2 };
}

export function hydrateV2(blob: Record<string, any> | null | undefined): ConfiguratorStateV2 {
  if (isV2(blob)) {
    const s = blob as ConfiguratorStateV2;
    return {
      envelopeVersion: 2,
      switchboards: s.switchboards?.length ? s.switchboards : [emptySwitchboard()],
      activeSwitchboardIndex: Math.min(s.activeSwitchboardIndex ?? 0, (s.switchboards?.length ?? 1) - 1),
    };
  }
  return migrateV1toV2(blob);
}

/* ────────────────────────── reducer actions ─────────────────────────── */

export type ActionV2 =
  | { type: 'hydrate'; payload: Record<string, any> | null }
  | { type: 'addSwitchboard'; payload?: { name?: string; clone?: SwitchboardStateV2 } }
  | { type: 'removeSwitchboard'; index: number }
  | { type: 'renameSwitchboard'; index: number; name: string }
  | { type: 'setActiveSwitchboard'; index: number }
  | { type: 'patchBoard'; index: number; patch: Partial<SwitchboardStateV2> }
  | { type: 'setBoardParameters'; index: number; payload: SystemParameters }
  | { type: 'addSection'; boardIndex: number; maxSections?: number }
  | { type: 'removeSection'; boardIndex: number; sectionIndex: number }
  | { type: 'patchSection'; boardIndex: number; sectionIndex: number; patch: Partial<SectionStateV2> }
  | { type: 'upsertLine'; boardIndex: number; line: ComponentLineV2 }
  | { type: 'removeLine'; boardIndex: number; lineId: string }
  | { type: 'addLaborAdjustment'; boardIndex: number; line: LaborAdjustmentLine }
  | { type: 'removeLaborAdjustment'; boardIndex: number; lineId: string }
  | { type: 'recordOverride'; boardIndex: number; override: FieldOverride }
  | { type: 'reset' };

function withBoard(
  state: ConfiguratorStateV2,
  index: number,
  fn: (b: SwitchboardStateV2) => SwitchboardStateV2
): ConfiguratorStateV2 {
  return {
    ...state,
    switchboards: state.switchboards.map((b, i) => (i === index ? fn(b) : b)),
  };
}

export function reducerV2(state: ConfiguratorStateV2, action: ActionV2): ConfiguratorStateV2 {
  switch (action.type) {
    case 'hydrate':
      return hydrateV2(action.payload);
    case 'addSwitchboard': {
      const clone = action.payload?.clone;
      const nb: SwitchboardStateV2 = clone
        ? { ...structuredCloneSafe(clone), id: uid(), name: action.payload?.name ?? `${clone.name} (copy)` }
        : emptySwitchboard(action.payload?.name ?? `Switchboard ${state.switchboards.length + 1}`);
      return {
        ...state,
        switchboards: [...state.switchboards, nb],
        activeSwitchboardIndex: state.switchboards.length,
      };
    }
    case 'removeSwitchboard': {
      if (state.switchboards.length <= 1) return state;
      const boards = state.switchboards.filter((_, i) => i !== action.index);
      return {
        ...state,
        switchboards: boards,
        activeSwitchboardIndex: Math.min(state.activeSwitchboardIndex, boards.length - 1),
      };
    }
    case 'renameSwitchboard':
      return withBoard(state, action.index, (b) => ({ ...b, name: action.name }));
    case 'setActiveSwitchboard':
      return { ...state, activeSwitchboardIndex: action.index };
    case 'patchBoard':
      return withBoard(state, action.index, (b) => ({ ...b, ...action.patch }));
    case 'setBoardParameters':
      return withBoard(state, action.index, (b) => ({ ...b, boardParameters: action.payload }));
    case 'addSection':
      return withBoard(state, action.boardIndex, (b) => {
        const max = action.maxSections ?? MAX_SECTIONS_DEFAULT;
        if (b.sections.length >= max) return b;
        const next = Math.max(0, ...b.sections.map((s) => s.sectionIndex)) + 1;
        return { ...b, sections: [...b.sections, emptySection(next)] };
      });
    case 'removeSection':
      return withBoard(state, action.boardIndex, (b) => {
        if (b.sections.length <= 1) return b;
        // Orphan (never silently delete) section lines — Phase A §6.2.
        // Covers BOTH board-held lines scoped to the section AND the
        // section's own deviceLines (breakers).
        const orphanLine = (l: ComponentLineV2): ComponentLineV2 => ({
          ...l,
          scope: 'board',
          sectionIndex: undefined,
          meta: { ...(l.meta ?? {}), orphanedFromSection: action.sectionIndex },
        });
        const removed = b.sections.find((s) => s.sectionIndex === action.sectionIndex);
        const orphanedDeviceLines = (removed?.deviceLines ?? []).map(orphanLine);
        const orphaned = b.componentLines.map((l) =>
          l.scope === 'section' && l.sectionIndex === action.sectionIndex ? orphanLine(l) : l
        );
        return {
          ...b,
          sections: b.sections.filter((s) => s.sectionIndex !== action.sectionIndex),
          componentLines: [...orphaned, ...orphanedDeviceLines],
        };
      });
    case 'patchSection':
      return withBoard(state, action.boardIndex, (b) => ({
        ...b,
        sections: b.sections.map((s) =>
          s.sectionIndex === action.sectionIndex ? { ...s, ...action.patch } : s
        ),
      }));
    case 'upsertLine':
      return withBoard(state, action.boardIndex, (b) => {
        const line = action.line.lineId ? action.line : { ...action.line, lineId: uid() };
        if (line.scope === 'section' && line.sectionIndex != null && line.category === 'CIRCUIT BREAKER') {
          return {
            ...b,
            sections: b.sections.map((s) => {
              if (s.sectionIndex !== line.sectionIndex) return s;
              const i = s.deviceLines.findIndex((l) => l.lineId === line.lineId);
              return {
                ...s,
                deviceLines: i >= 0 ? s.deviceLines.map((l, j) => (j === i ? line : l)) : [...s.deviceLines, line],
              };
            }),
          };
        }
        const i = b.componentLines.findIndex((l) => l.lineId === line.lineId);
        return {
          ...b,
          componentLines: i >= 0 ? b.componentLines.map((l, j) => (j === i ? line : l)) : [...b.componentLines, line],
        };
      });
    case 'removeLine':
      return withBoard(state, action.boardIndex, (b) => ({
        ...b,
        componentLines: b.componentLines.filter((l) => l.lineId !== action.lineId),
        sections: b.sections.map((s) => ({
          ...s,
          deviceLines: s.deviceLines.filter((l) => l.lineId !== action.lineId),
        })),
      }));
    case 'addLaborAdjustment':
      return withBoard(state, action.boardIndex, (b) => ({
        ...b,
        laborAdjustments: [...b.laborAdjustments, { ...action.line, lineId: action.line.lineId || uid() }],
      }));
    case 'removeLaborAdjustment':
      return withBoard(state, action.boardIndex, (b) => ({
        ...b,
        laborAdjustments: b.laborAdjustments.filter((l) => l.lineId !== action.lineId),
      }));
    case 'recordOverride':
      return withBoard(state, action.boardIndex, (b) => ({
        ...b,
        fieldOverrides: [...b.fieldOverrides, action.override],
      }));
    case 'reset':
      return structuredCloneSafe(EMPTY_STATE_V2);
    default:
      return state;
  }
}
