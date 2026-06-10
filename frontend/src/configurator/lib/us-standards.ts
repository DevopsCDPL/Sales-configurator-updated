/**
 * us-standards.ts — Phase B spec §3 (US Parameter Tables)
 *
 * Typed views over the Engineering Standards tables. Engines receive a
 * `StandardsSet` (fetched from /api/configurator/engineering-standards,
 * version-pinned per configuration). `DEFAULT_STANDARDS` mirrors the
 * backend seed for offline/test use — same [SEED] values, same flags.
 *
 * NO engine may import numeric constants from anywhere else.
 */

export interface VoltageSystem {
  code: string;
  vLL: number;
  vLN: number | null;
  phase: 1 | 3;
  wires: number;
  config: 'wye' | 'delta' | 'single' | 'high-leg-delta';
  seed?: boolean;
  verified?: boolean;
}

export interface BusScheduleRow {
  ratingA: number;
  material: 'Cu' | 'Al';
  barsPerPhase: number;
  barThk_in: number;
  barW_in: number;
  plating: string;
  bracing_kA: number;
  neutralPct: number;
  seed?: boolean;
  verified?: boolean;
}

export interface BusSupportRow {
  sccr_kA: number;
  maxSpacing_in: number;
  partNumber?: string | null;
}

export interface FrameRow {
  frameCode: string;
  width_in: number;
  depth_in: number;
  height_in: number;
  usableDeviceHeight_in: number;
  topBusZone_in: number;
  bottomCableZone_in: number;
  accessType: 'Front' | 'Front&Rear';
  maxBusRating_A: number;
  drawoutCapable: boolean;
  seed?: boolean;
  verified?: boolean;
}

export interface MotorFlaRow {
  hp: number;
  v208: number;
  v230: number;
  v460: number;
  v575: number;
}

export interface StandardsSet {
  voltageSystems: VoltageSystem[];
  sccrLadder_kA: number[];
  mainBusLadder_A: number[];
  deviceLadder_A: number[]; // NEC 240.6
  busSchedule: BusScheduleRow[];
  busSupportSpacing: BusSupportRow[];
  frameLibrary: FrameRow[];
  motorFla: MotorFlaRow[];
}

export const DEFAULT_STANDARDS: StandardsSet = {
  voltageSystems: [
    { code: '208Y/120', vLL: 208, vLN: 120, phase: 3, wires: 4, config: 'wye', seed: true },
    { code: '240D', vLL: 240, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true },
    { code: '240/120-1', vLL: 240, vLN: 120, phase: 1, wires: 3, config: 'single', seed: true },
    { code: '240HL', vLL: 240, vLN: 120, phase: 3, wires: 4, config: 'high-leg-delta', seed: true },
    { code: '480Y/277', vLL: 480, vLN: 277, phase: 3, wires: 4, config: 'wye', seed: true },
    { code: '480D', vLL: 480, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true },
    { code: '600Y/347', vLL: 600, vLN: 347, phase: 3, wires: 4, config: 'wye', seed: true },
    { code: '600D', vLL: 600, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true },
  ],
  sccrLadder_kA: [10, 14, 18, 22, 25, 35, 42, 50, 65, 85, 100, 125, 150, 200],
  mainBusLadder_A: [400, 600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000],
  deviceLadder_A: [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175,
    200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600,
    2000, 2500, 3000, 4000, 5000, 6000],
  busSchedule: [
    { ratingA: 400, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 2, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true },
    { ratingA: 600, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 3, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true },
    { ratingA: 800, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true },
    { ratingA: 1200, material: 'Cu', barsPerPhase: 2, barThk_in: 0.25, barW_in: 3, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true },
    { ratingA: 1600, material: 'Cu', barsPerPhase: 2, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true },
    { ratingA: 2000, material: 'Cu', barsPerPhase: 3, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true },
    { ratingA: 2500, material: 'Cu', barsPerPhase: 4, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true },
    { ratingA: 3000, material: 'Cu', barsPerPhase: 4, barThk_in: 0.25, barW_in: 5, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true },
    { ratingA: 4000, material: 'Cu', barsPerPhase: 5, barThk_in: 0.25, barW_in: 6, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true },
  ],
  busSupportSpacing: [
    { sccr_kA: 50, maxSpacing_in: 14 },
    { sccr_kA: 65, maxSpacing_in: 10 },
    { sccr_kA: 100, maxSpacing_in: 6 },
    { sccr_kA: 200, maxSpacing_in: 4 },
  ],
  frameLibrary: [
    { frameCode: 'F-2024-90', width_in: 20, depth_in: 24, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 800, drawoutCapable: false, seed: true },
    { frameCode: 'F-2436-90', width_in: 24, depth_in: 36, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 1600, drawoutCapable: false, seed: true },
    { frameCode: 'F-3036-90', width_in: 30, depth_in: 36, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 2000, drawoutCapable: true, seed: true },
    { frameCode: 'F-3648-90', width_in: 36, depth_in: 48, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front&Rear', maxBusRating_A: 3000, drawoutCapable: true, seed: true },
    { frameCode: 'F-4260-90', width_in: 42, depth_in: 60, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front&Rear', maxBusRating_A: 4000, drawoutCapable: true, seed: true },
  ],
  motorFla: [
    { hp: 1, v208: 4.6, v230: 4.2, v460: 2.1, v575: 1.7 },
    { hp: 2, v208: 7.5, v230: 6.8, v460: 3.4, v575: 2.7 },
    { hp: 3, v208: 10.6, v230: 9.6, v460: 4.8, v575: 3.9 },
    { hp: 5, v208: 16.7, v230: 15.2, v460: 7.6, v575: 6.1 },
    { hp: 7.5, v208: 24.2, v230: 22, v460: 11, v575: 9 },
    { hp: 10, v208: 30.8, v230: 28, v460: 14, v575: 11 },
    { hp: 15, v208: 46.2, v230: 42, v460: 21, v575: 17 },
    { hp: 20, v208: 59.4, v230: 54, v460: 27, v575: 22 },
    { hp: 25, v208: 74.8, v230: 68, v460: 34, v575: 27 },
    { hp: 30, v208: 88, v230: 80, v460: 40, v575: 32 },
    { hp: 40, v208: 114, v230: 104, v460: 52, v575: 41 },
    { hp: 50, v208: 143, v230: 130, v460: 65, v575: 52 },
    { hp: 60, v208: 169, v230: 154, v460: 77, v575: 62 },
    { hp: 75, v208: 211, v230: 192, v460: 96, v575: 77 },
    { hp: 100, v208: 273, v230: 248, v460: 124, v575: 99 },
    { hp: 125, v208: 343, v230: 312, v460: 156, v575: 125 },
    { hp: 150, v208: 396, v230: 360, v460: 180, v575: 144 },
    { hp: 200, v208: 528, v230: 480, v460: 240, v575: 192 },
  ],
};

/** Next ladder value ≥ x (null if x exceeds the ladder). */
export function nextLadder(ladder: number[], x: number): number | null {
  for (const v of ladder) if (v >= x) return v;
  return null;
}

export function getVoltageSystem(std: StandardsSet, code: string): VoltageSystem | undefined {
  return std.voltageSystems.find((v) => v.code === code);
}

export function busScheduleFor(std: StandardsSet, ratingA: number, material: 'Cu' | 'Al' = 'Cu'): BusScheduleRow | undefined {
  return std.busSchedule
    .filter((r) => r.material === material && r.ratingA >= ratingA)
    .sort((a, b) => a.ratingA - b.ratingA)[0];
}

export function supportSpacingFor(std: StandardsSet, sccr_kA: number): BusSupportRow | undefined {
  return std.busSupportSpacing
    .filter((r) => r.sccr_kA >= sccr_kA)
    .sort((a, b) => a.sccr_kA - b.sccr_kA)[0];
}

/** Motor FLA lookup per NEC 430.250 — voltage column chosen from system vLL. */
export function motorFla(std: StandardsSet, hp: number, vLL: number): number | null {
  const row = std.motorFla.find((r) => r.hp === hp)
    ?? std.motorFla.filter((r) => r.hp >= hp).sort((a, b) => a.hp - b.hp)[0];
  if (!row) return null;
  if (vLL <= 215) return row.v208;
  if (vLL <= 245) return row.v230;
  if (vLL <= 500) return row.v460;
  return row.v575;
}

/** Density sanity rule — Phase B §5.1. */
export function busDensityOk(row: BusScheduleRow): boolean {
  const area = row.barsPerPhase * row.barThk_in * row.barW_in;
  const density = row.ratingA / area;
  const limit = row.material === 'Cu' ? 1000 : 750; // [SEED]
  return density <= limit;
}
