/**
 * lineup-proposal.ts — Phase C spec §4 (greedy line-up proposal engine)
 *
 * Pure + deterministic: intake + standards + candidate catalog in,
 * proposal out. NEVER mutates state — the caller presents a diff
 * preview and applies via Event Engine actions on user accept.
 */

import {
  StandardsSet, FrameRow, getVoltageSystem, nextLadder, busScheduleFor,
} from './us-standards';
import { computeLoadV2, LoadInputV2 } from './load-calculation-v2';
import type { SectionRole } from './safety-rules';

export interface FeederRowInput {
  rowId: string;
  description: string;
  loadType: 'General' | 'Motor' | 'Fire Pump' | 'Lighting' | 'HVAC' | 'Heating' | 'Receptacle' | 'UPS / IT' | 'EV Charger' | 'Transformer' | 'Panel Feeder' | 'Capacitor' | 'Spare' | 'Space';
  loadInputMode: 'kW' | 'kVA' | 'A' | 'HP';
  loadValue: number;
  powerFactor?: number;
  continuous?: boolean;
  poles?: 2 | 3;
  qty?: number;
}

export interface IntakeInput {
  voltageSystemCode: string;
  serviceEntrance: boolean;
  utilityFaultKA: number | 'Unknown';
  sourceScheme: 'SINGLE' | 'MAIN_TIE_MAIN' | 'MULTI_SOURCE';
  sourceCount?: number; // MULTI_SOURCE only
  environment: 'Indoor' | 'Outdoor';
  specialEnvironment: 'None' | 'Corrosive' | 'Marine' | 'Dusty';
  totalLoadHint?: number | null; // amps
  /* Design-driven provisions — auto-select SPD / metering / camlock / ATS.
   * All default to off so existing boards regenerate unchanged. */
  spdRequired?: 'none' | 'switchboard' | 'panelboard';
  meteringScheme?: 'none' | 'ct' | 'ct_pt' | 'full';
  controlPowerNeeded?: boolean;
  loadBankTap?: 'none' | 'camlock';
  camlockSets?: number;
  atsProvision?: boolean;
  feeders: FeederRowInput[];
}

export interface CandidateDevice {
  componentId: string;
  partNumber: string;
  manufacturer: string;
  frameModel: string;
  ratedA: number;
  interruptingKA: number;
  poles: number;
  mounting: 'Fixed' | 'Drawout';
  pctRated: 80 | 100;
  deviceClass: 'ACB' | 'ICCB' | 'MCCB' | 'MCB';
  heightIn: number | null;
  widthIn: number | null;
  depthIn: number | null;
  price: number | null;
  priceStatus: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
  priceSource?: string | null;  // 'vendor-import' (TPS) | 'rfq' | 'web' | 'manual'
}

export interface ProposedDevice {
  designation: string;          // M1, T1, F1..
  feederRowId: string | null;
  role: SectionRole;
  device: CandidateDevice | null; // null = no candidate found
  /** Close alternatives (same filters, price-sorted) — engineer may swap. */
  alternatives: CandidateDevice[];
  designCurrentA: number;
  recommendedRatingA: number | null;
  warnings: string[];
}

export interface ProposedSection {
  sectionIndex: number;
  role: SectionRole;            // dominant role of section
  frame: FrameRow;
  devices: ProposedDevice[];
  usedHeightIn: number;
  remainingHeightIn: number;
}

export interface LineupProposal {
  ok: boolean;
  errors: string[];
  warnings: string[];
  boardPatch: {
    voltageSystemCode: string;
    mainBusRatingA: number | null;
    sccrKA: number;
    sccrAssumed: boolean;
    nemaSuggestion: string;
    neutralPct: number;
  };
  totalFeederLoadA: number;
  sections: ProposedSection[];
  unplaced: ProposedDevice[];
}

const INTERDEVICE_CLEARANCE_IN = 4;   // [SEED] Phase B §6.2.2
/** [SEED] realistic device envelopes when catalog dims are missing (was a flat 18" — halved packing density). */
export const DEVICE_ENVELOPE_IN: Record<string, number> = { FEEDER: 9, MAIN: 20, TIE: 20 };
/** [SEED] max section fill — wire-bending space, UL 891 thermal headroom, future spares. */
export const MAX_FILL_PCT = 0.8;
const MAIN_DEDICATED_PCT = 0.5;       // [SEED] Phase C §4.2.4
const DEFAULT_SCCR_KA = 65;           // [SEED] AP-04

export interface LineupOptions {
  maxSections?: number;               // MAX_SECTIONS setting (default 10)
  candidateProvider: (q: {
    role: SectionRole;
    designCurrentA: number;
    adjustedCurrentA: number;
    voltageVLL: number;
    sccrKA: number;
    poles: number;
  }) => CandidateDevice[];
}

/** Provenance rank: TPS-negotiated parts first, then RFQ-confirmed, then web/manual.
 *  Policy (Vikraman 2026-06-13): always use TPS parts when one satisfies the requirement. */
const SOURCE_RANK: Record<string, number> = { 'vendor-import': 0, rfq: 1, manual: 2, web: 3 };
const srcRank = (c: CandidateDevice) => SOURCE_RANK[c.priceSource ?? ''] ?? 4;

/** Firmness tier within a provenance group: FIRM > ESTIMATED > no/zero price. */
const firmRank = (c: CandidateDevice) =>
  c.priceStatus === 'FIRM' && c.price != null ? 0
  : c.priceStatus === 'ESTIMATED' && c.price != null ? 1 : 2;

/**
 * Best-fit pick. `cands` are ALREADY electrically suitable (candidateProvider
 * filters by kA/voltage/ampere). Policy (Vikraman 2026-06-13/14): use TPS
 * (vendor-import) parts FIRST even when they carry no price yet — provenance
 * outranks price availability. Within the same source: firm-priced beats
 * estimated beats unpriced, then cheapest, then smallest adequate frame.
 * (Name kept for callers; no longer "cheapest-first".)
 */
function pickCheapest(cands: CandidateDevice[]): CandidateDevice | null {
  if (!cands.length) return null;
  return [...cands].sort((a, b) =>
    srcRank(a) - srcRank(b)                                   // TPS first, even if unpriced
    || firmRank(a) - firmRank(b)                              // firm > estimated > unpriced
    || (a.price ?? Infinity) - (b.price ?? Infinity)          // cheaper first
    || a.ratedA - b.ratedA)[0];                               // smallest adequate frame
}

/**
 * Apply the breaker_rules standard (tenant-editable via std.breakerRules):
 * a device at/above acbThreshold_A must be ACB/ICCB; above mccbMax_A must not
 * be MCCB. Returns the compliant subset, or falls back to the full set with a
 * warning if the catalog has nothing compliant (never hard-fails the proposal).
 */
function applyBreakerRules(cands: CandidateDevice[], requiredA: number, std: StandardsSet): { kept: CandidateDevice[]; note?: string } {
  const br = std.breakerRules;
  if (!br || !cands.length) return { kept: cands };
  if (requiredA >= br.acbThreshold_A) {
    const acb = cands.filter((c) => c.deviceClass === 'ACB' || c.deviceClass === 'ICCB');
    return acb.length ? { kept: acb } : { kept: cands, note: `${requiredA}A is at/above the ${br.acbThreshold_A}A ACB threshold but the catalog has no ACB - verify` };
  }
  if (requiredA > br.mccbMax_A) {
    const nonMccb = cands.filter((c) => c.deviceClass !== 'MCCB');
    return nonMccb.length ? { kept: nonMccb } : { kept: cands, note: `${requiredA}A exceeds the MCCB max of ${br.mccbMax_A}A - verify breaker class` };
  }
  return { kept: cands };
}

export function proposeLineup(
  std: StandardsSet,
  intake: IntakeInput,
  opts: LineupOptions
): LineupProposal {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxSections = opts.maxSections ?? 10;

  const vs = getVoltageSystem(std, intake.voltageSystemCode);
  if (!vs) {
    return {
      ok: false, errors: [`Unknown voltage system ${intake.voltageSystemCode}`], warnings,
      boardPatch: { voltageSystemCode: intake.voltageSystemCode, mainBusRatingA: null, sccrKA: 0, sccrAssumed: false, nemaSuggestion: '1', neutralPct: 100 },
      totalFeederLoadA: 0, sections: [], unplaced: [],
    };
  }

  // SCCR (AP-04/AP-05)
  const defaultSccr = std.defaultSccr_kA ?? DEFAULT_SCCR_KA;
  const sccrAssumed = intake.utilityFaultKA === 'Unknown';
  const sccrKA = sccrAssumed
    ? defaultSccr
    : (nextLadder(std.sccrLadder_kA, intake.utilityFaultKA as number) ?? defaultSccr);
  if (sccrAssumed) warnings.push(`Utility fault data unknown — SCCR assumed ${defaultSccr} kA [SEED]; verify before release`);

  // 1. Feeder devices
  const feederDevices: ProposedDevice[] = [];
  let totalFeederLoadA = 0;
  let fIdx = 0;
  for (const row of intake.feeders) {
    if (row.loadType === 'Space') continue; // provision only
    const qty = Math.max(1, row.qty ?? 1);
    for (let i = 0; i < qty; i++) {
      fIdx += 1;
      const designation = `F${fIdx}`;
      if (row.loadType === 'Spare') {
        feederDevices.push({
          designation, feederRowId: row.rowId, role: 'FEEDER', device: null, alternatives: [],
          designCurrentA: row.loadValue || 0, recommendedRatingA: row.loadValue || null,
          warnings: ['Spare — device rating set manually or copied from neighbor'],
        });
        continue;
      }
      const li: LoadInputV2 = {
        voltageSystemCode: intake.voltageSystemCode,
        loadInputMode: row.loadInputMode,
        loadValue: row.loadValue,
        powerFactor: row.powerFactor,
        continuous: row.continuous ?? true,
        isLargestMotorInSection: row.loadType === 'Motor' || row.loadType === 'Fire Pump',
      };
      const res = computeLoadV2(std, li);
      if (res.errors.length) {
        warnings.push(`Feeder "${row.description}": ${res.errors.join('; ')}`);
      }
      totalFeederLoadA += res.designCurrentA;
      const cands = opts.candidateProvider({
        role: 'FEEDER', designCurrentA: res.designCurrentA, adjustedCurrentA: res.adjustedCurrentA,
        voltageVLL: vs.vLL, sccrKA, poles: row.poles ?? 3,
      });
      const { kept: ruleCands, note: ruleNote } = applyBreakerRules(cands, res.designCurrentA, std);
      const picked = pickCheapest(ruleCands);
      const w: string[] = [...res.warnings];
      if (ruleNote) w.push(ruleNote);
      if (!picked) w.push('No valid breaker candidate found for this feeder');
      else if (picked.priceStatus !== 'FIRM') w.push(`Selected device price is ${picked.priceStatus}`);
      feederDevices.push({
        designation, feederRowId: row.rowId, role: 'FEEDER', device: picked,
        alternatives: ruleCands.filter((c) => c !== picked).slice(0, 5),
        designCurrentA: res.designCurrentA, recommendedRatingA: res.recommendedRatingA, warnings: w,
      });
    }
  }

  // 2. Mains + tie
  const loadBasis = Math.max(totalFeederLoadA, intake.totalLoadHint ?? 0);
  const mainBusRatingA = nextLadder(std.mainBusLadder_A, loadBasis);
  if (mainBusRatingA == null) errors.push('Total load exceeds the main bus ladder');

  const mains: ProposedDevice[] = [];
  const ties: ProposedDevice[] = [];
  const mkSourceDevice = (designation: string, role: SectionRole, requiredA: number): ProposedDevice => {
    const cands = opts.candidateProvider({
      role, designCurrentA: requiredA, adjustedCurrentA: requiredA, voltageVLL: vs.vLL, sccrKA, poles: 3,
    });
    const { kept: ruleCands, note: ruleNote } = applyBreakerRules(cands, requiredA, std);
    const picked = pickCheapest(ruleCands);
    const w: string[] = [];
    if (ruleNote) w.push(ruleNote);
    if (!picked) w.push(`No valid ${role} device candidate found`);
    return { designation, feederRowId: null, role, device: picked, alternatives: cands.filter((c) => c !== picked).slice(0, 5), designCurrentA: requiredA, recommendedRatingA: nextLadder(std.deviceLadder_A, requiredA), warnings: w };
  };

  if (intake.sourceScheme === 'SINGLE') {
    mains.push(mkSourceDevice('M1', 'MAIN', loadBasis));
  } else if (intake.sourceScheme === 'MAIN_TIE_MAIN') {
    const perMain = loadBasis / 2;
    mains.push(mkSourceDevice('M1', 'MAIN', perMain), mkSourceDevice('M2', 'MAIN', perMain));
    ties.push(mkSourceDevice('T1', 'TIE', perMain)); // TIE ≥ max main load (Module 08 step 5)
  } else {
    const n = Math.max(2, intake.sourceCount ?? 2);
    for (let i = 1; i <= n; i++) mains.push(mkSourceDevice(`M${i}`, 'MAIN', loadBasis / n));
  }

  // 3. Bin packing (greedy, top-down)
  const framesAsc = [...std.frameLibrary].sort((a, b) => a.width_in - b.width_in);
  const fittingFrames = framesAsc.filter((f) => mainBusRatingA == null || f.maxBusRating_A >= mainBusRatingA);
  if (!fittingFrames.length) errors.push('No frame in the library supports the required bus rating');

  interface OpenSection { frame: FrameRow; role: SectionRole; devices: ProposedDevice[]; used: number; }
  const open: OpenSection[] = [];
  const unplaced: ProposedDevice[] = [];

  const clearance = std.packing?.interdeviceClearance_in ?? INTERDEVICE_CLEARANCE_IN;
  const maxFill = std.packing?.maxFillPct ?? MAX_FILL_PCT;
  const mainDedicated = std.packing?.mainDedicatedPct ?? MAIN_DEDICATED_PCT;
  const deviceH = (d: ProposedDevice) => d.device?.heightIn ?? (d.role === 'MAIN' ? (std.packing?.mainEnvelope_in ?? DEVICE_ENVELOPE_IN.MAIN) : d.role === 'TIE' ? (std.packing?.tieEnvelope_in ?? DEVICE_ENVELOPE_IN.TIE) : (std.packing?.feederEnvelope_in ?? DEVICE_ENVELOPE_IN.FEEDER)); // [SEED] role-based fallback envelope
  const place = (d: ProposedDevice, dedicated: boolean) => {
    const h = deviceH(d) + clearance;
    if (!dedicated) {
      for (const s of open) {
        if (s.role === 'FEEDER' && d.role === 'FEEDER' && s.used + h <= maxFill * s.frame.usableDeviceHeight_in) {
          s.devices.push(d); s.used += h; return;
        }
      }
    }
    if (open.length >= (maxSections)) { unplaced.push(d); return; }
    const frame = fittingFrames.find((f) => deviceH(d) + clearance <= f.usableDeviceHeight_in
      && (d.device?.mounting !== 'Drawout' || f.drawoutCapable)) ?? fittingFrames[fittingFrames.length - 1];
    if (!frame) { unplaced.push(d); return; }
    open.push({ frame, role: d.role, devices: [d], used: h });
  };

  // MAINs first — dedicated section when tall device
  for (const m of mains) {
    const dedicated = deviceH(m) > mainDedicated * (fittingFrames[0]?.usableDeviceHeight_in ?? 62);
    place(m, dedicated || true); // MAIN always own section in v1 (deterministic + safe)
  }
  for (const t of ties) place(t, true);
  // Feeders descending height
  const sortedFeeders = [...feederDevices].sort((a, b) => deviceH(b) - deviceH(a));
  for (const f of sortedFeeders) place(f, false);

  if (unplaced.length) errors.push(`${unplaced.length} device(s) exceed the section limit (${maxSections}) — increase MAX_SECTIONS or consolidate feeders`);

  const sections: ProposedSection[] = open.map((s, i) => ({
    sectionIndex: i + 1,
    role: s.role,
    frame: s.frame,
    devices: s.devices,
    usedHeightIn: s.used,
    remainingHeightIn: Math.max(0, s.frame.usableDeviceHeight_in - s.used),
  }));

  // NEMA suggestion (AP-03/AP-07)
  // R5 (NEC 240.87) + R6 (NEC 230.95) - code validations carried over from V1's
  // safety-rules. R11 (corrosive/marine -> NEMA 4X) is already handled below.
  const allDevices = [...feederDevices, ...mains, ...ties];
  if (allDevices.some((d) => (d.designCurrentA ?? 0) >= 1200)) {
    warnings.push('R5: device(s) at/above 1200 A require arc-energy reduction (ERMS/ZSI) per NEC 240.87 - verify the trip unit.');
  }
  if (intake.serviceEntrance && vs.vLN === 277 && mains.some((m) => (m.designCurrentA ?? 0) >= 1000)) {
    warnings.push('R6: service disconnect at/above 1000 A on 480Y/277 requires ground-fault protection (GFP) per NEC 230.95 - verify provision.');
  }

  let nemaSuggestion = '1';
  if (intake.specialEnvironment === 'Corrosive' || intake.specialEnvironment === 'Marine') nemaSuggestion = '4X';
  else if (intake.environment === 'Outdoor') nemaSuggestion = '3R';
  else if (intake.specialEnvironment === 'Dusty') nemaSuggestion = '12';

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    boardPatch: {
      voltageSystemCode: intake.voltageSystemCode,
      mainBusRatingA,
      sccrKA,
      sccrAssumed,
      nemaSuggestion,
      neutralPct: busScheduleFor(std, mainBusRatingA ?? 0)?.neutralPct ?? 100,
    },
    totalFeederLoadA: Math.round(totalFeederLoadA * 10) / 10,
    sections,
    unplaced,
  };
}
