/**
 * safety-rules.ts — Phase B spec §8 (Safety & Compliance Rule Pack R1–R11)
 *
 * Pure evaluation: given board + section state, returns required
 * auto-add items, device filters, and violations. SKU resolution happens
 * via the Safety Items Map (Engineering Standards); unmapped rules emit
 * ad-hoc BOM line descriptors.
 */

export type SectionRole = 'MAIN' | 'FEEDER' | 'TIE' | 'METERING' | 'AUX' | 'BLANK';

export interface SafetyBoardInput {
  voltageSystemCode: string;
  vLN: number | null;            // 277 ⇒ 480Y/277 GFP rule relevant
  wires: number;
  serviceEntrance: boolean;
  environment: 'Indoor' | 'Outdoor';
  specialEnvironment: 'None' | 'Corrosive' | 'Marine' | 'Dusty';
  nemaType: string;
  mainDeviceRatingA: number | null;
}

export interface SafetyDeviceInput {
  lineId: string;
  sectionIndex: number;
  role: SectionRole;
  frameRatingA: number;
  mounting: 'Fixed' | 'Drawout';
  tripUnitFeatures: string[];    // e.g. ['LSI','G','ERMS','ZSI']
  isMain: boolean;
}

export interface SafetyAutoItem {
  ruleId: string;
  description: string;
  qtyFormula: 'per_board' | 'per_section' | 'per_drawout_device' | 'per_tie' | 'per_remaining_space';
  qty: number;
  severity: 'BLOCK' | 'WARN';
}

export interface SafetyViolation {
  ruleId: string;
  severity: 'BLOCK' | 'WARN';
  message: string;
  affected?: string;             // lineId or section ref
}

export interface SafetyResult {
  autoItems: SafetyAutoItem[];
  violations: SafetyViolation[];
  /** Trip-unit feature filters to apply in CB selection/builder */
  tripUnitRequirements: { lineId: string; requiresAnyOf: string[]; ruleId: string }[];
  enclosureFilter: string[] | null; // allowed NEMA types, null = unrestricted
}

export function evaluateSafetyRules(
  board: SafetyBoardInput,
  sections: { sectionIndex: number; role: SectionRole }[],
  devices: SafetyDeviceInput[]
): SafetyResult {
  const autoItems: SafetyAutoItem[] = [];
  const violations: SafetyViolation[] = [];
  const tripUnitRequirements: SafetyResult['tripUnitRequirements'] = [];
  let enclosureFilter: string[] | null = null;

  const nSections = sections.filter((s) => s.role !== 'BLANK').length || sections.length;

  // R1 — ground bus, always
  autoItems.push({ ruleId: 'R1', description: 'Ground bus + equipment ground lugs', qtyFormula: 'per_board', qty: 1, severity: 'BLOCK' });
  // R2 — arc-flash label per section (NEC 110.16)
  autoItems.push({ ruleId: 'R2', description: 'Arc-flash warning label (NEC 110.16)', qtyFormula: 'per_section', qty: Math.max(nSections, 1), severity: 'BLOCK' });
  // R3 — SCCR + ratings nameplate
  autoItems.push({ ruleId: 'R3', description: 'SCCR + ratings nameplate (UL 891)', qtyFormula: 'per_board', qty: 1, severity: 'BLOCK' });

  // R5 — NEC 240.87: frames ≥ 1200 A need arc-energy reduction
  for (const d of devices) {
    if (d.frameRatingA >= 1200) {
      const ok = d.tripUnitFeatures.some((f) => ['ERMS', 'ZSI', 'AER'].includes(f.toUpperCase()));
      tripUnitRequirements.push({ lineId: d.lineId, requiresAnyOf: ['ERMS', 'ZSI'], ruleId: 'R5' });
      if (!ok) {
        violations.push({
          ruleId: 'R5', severity: 'BLOCK', affected: d.lineId,
          message: `Device ≥1200 A requires arc-energy reduction (ERMS/ZSI) per NEC 240.87`,
        });
      }
    }
  }

  // R6 — NEC 230.95: service entrance + 480Y/277 + main ≥ 1000 A ⇒ GFP on main
  if (board.serviceEntrance && board.vLN === 277 && (board.mainDeviceRatingA ?? 0) >= 1000) {
    for (const d of devices.filter((x) => x.isMain)) {
      tripUnitRequirements.push({ lineId: d.lineId, requiresAnyOf: ['G', 'LSIG'], ruleId: 'R6' });
      const ok = d.tripUnitFeatures.some((f) => ['G', 'LSIG'].includes(f.toUpperCase()));
      if (!ok) {
        violations.push({
          ruleId: 'R6', severity: 'BLOCK', affected: d.lineId,
          message: 'Service disconnect ≥1000 A on 480Y/277 requires ground-fault protection (NEC 230.95)',
        });
      }
    }
  }

  // R7 — service entrance bundle
  if (board.serviceEntrance) {
    autoItems.push({ ruleId: 'R7', description: 'SUSE label + main bonding jumper + neutral disconnect means', qtyFormula: 'per_board', qty: 1, severity: 'BLOCK' });
  }

  // R8 — drawout devices
  const drawoutCount = devices.filter((d) => d.mounting === 'Drawout').length;
  if (drawoutCount > 0) {
    autoItems.push({ ruleId: 'R8', description: 'Shutters + racking interlock + door interlock (drawout)', qtyFormula: 'per_drawout_device', qty: drawoutCount, severity: 'BLOCK' });
  }

  // R9 — TIE present ⇒ key interlocks + ≥2 MAIN validation
  const tieCount = sections.filter((s) => s.role === 'TIE').length;
  if (tieCount > 0) {
    autoItems.push({ ruleId: 'R9', description: 'Key interlock scheme (main-tie)', qtyFormula: 'per_tie', qty: tieCount, severity: 'BLOCK' });
    const mains = sections.filter((s) => s.role === 'MAIN').length;
    if (mains < 2) {
      violations.push({ ruleId: 'R9', severity: 'BLOCK', message: 'Tie section requires at least two MAIN sections' });
    }
  }

  // R10 — outdoor heater
  if (board.environment === 'Outdoor') {
    autoItems.push({ ruleId: 'R10', description: 'Space heater + thermostat', qtyFormula: 'per_section', qty: Math.max(nSections, 1), severity: 'WARN' });
  }

  // R11 — corrosive/marine ⇒ NEMA 4X only
  if (board.specialEnvironment === 'Corrosive' || board.specialEnvironment === 'Marine') {
    enclosureFilter = ['4X'];
    if (board.nemaType && board.nemaType !== '4X') {
      violations.push({ ruleId: 'R11', severity: 'BLOCK', message: 'Corrosive/marine environment requires NEMA 4X stainless construction' });
    }
  } else if (board.environment === 'Outdoor') {
    enclosureFilter = ['3R', '4', '4X'];
  }

  return { autoItems, violations, tripUnitRequirements, enclosureFilter };
}
