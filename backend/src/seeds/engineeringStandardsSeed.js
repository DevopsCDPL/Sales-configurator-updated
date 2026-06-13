'use strict';

/**
 * Engineering Standards [SEED] tables — Phase B spec §2/§3/§5/§6.
 *
 * Every row carries { seed: true, verified: false } until TPS
 * engineering signs off (in-app or via the XLSX import). NOTHING in
 * the engines may hardcode these values — always read the current
 * version from configurator_engineering_standards.
 */

module.exports = {
  voltage_systems: [
    { code: '208Y/120', vLL: 208, vLN: 120, phase: 3, wires: 4, config: 'wye', seed: true, verified: false },
    { code: '240D', vLL: 240, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true, verified: false },
    { code: '240/120-1', vLL: 240, vLN: 120, phase: 1, wires: 3, config: 'single', seed: true, verified: false },
    { code: '240HL', vLL: 240, vLN: 120, phase: 3, wires: 4, config: 'high-leg-delta', seed: true, verified: false },
    { code: '480Y/277', vLL: 480, vLN: 277, phase: 3, wires: 4, config: 'wye', seed: true, verified: false },
    { code: '480D', vLL: 480, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true, verified: false },
    { code: '600Y/347', vLL: 600, vLN: 347, phase: 3, wires: 4, config: 'wye', seed: true, verified: false },
    { code: '600D', vLL: 600, vLN: null, phase: 3, wires: 3, config: 'delta', seed: true, verified: false },
  ],

  ratings_ladders: [
    {
      key: 'sccr_kA',
      values: [10, 14, 18, 22, 25, 35, 42, 50, 65, 85, 100, 125, 150, 200],
      seed: true, verified: false,
    },
    {
      key: 'main_bus_A',
      values: [400, 600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000],
      seed: true, verified: false,
    },
    {
      key: 'nec_240_6_device_A',
      values: [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175,
        200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600,
        2000, 2500, 3000, 4000, 5000, 6000],
      seed: true, verified: false,
    },
  ],

  bus_schedule: [
    { ratingA: 400, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 2, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true, verified: false },
    { ratingA: 600, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 3, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true, verified: false },
    { ratingA: 800, material: 'Cu', barsPerPhase: 1, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true, verified: false },
    { ratingA: 1200, material: 'Cu', barsPerPhase: 2, barThk_in: 0.25, barW_in: 3, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true, verified: false },
    { ratingA: 1600, material: 'Cu', barsPerPhase: 2, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 65, neutralPct: 100, seed: true, verified: false },
    { ratingA: 2000, material: 'Cu', barsPerPhase: 3, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true, verified: false },
    { ratingA: 2500, material: 'Cu', barsPerPhase: 4, barThk_in: 0.25, barW_in: 4, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true, verified: false },
    { ratingA: 3000, material: 'Cu', barsPerPhase: 4, barThk_in: 0.25, barW_in: 5, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true, verified: false },
    { ratingA: 4000, material: 'Cu', barsPerPhase: 5, barThk_in: 0.25, barW_in: 6, plating: 'Tin', bracing_kA: 100, neutralPct: 100, seed: true, verified: false },
  ],

  bus_support_spacing: [
    { sccr_kA: 50, maxSpacing_in: 14, partNumber: null, seed: true, verified: false },
    { sccr_kA: 65, maxSpacing_in: 10, partNumber: null, seed: true, verified: false },
    { sccr_kA: 100, maxSpacing_in: 6, partNumber: null, seed: true, verified: false },
    { sccr_kA: 200, maxSpacing_in: 4, partNumber: null, seed: true, verified: false },
  ],

  frame_library: [
    { frameCode: 'F-2024-90', width_in: 20, depth_in: 24, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 800, drawoutCapable: false, seed: true, verified: false },
    { frameCode: 'F-2436-90', width_in: 24, depth_in: 36, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 1600, drawoutCapable: false, seed: true, verified: false },
    { frameCode: 'F-3036-90', width_in: 30, depth_in: 36, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front', maxBusRating_A: 2000, drawoutCapable: true, seed: true, verified: false },
    { frameCode: 'F-3648-90', width_in: 36, depth_in: 48, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front&Rear', maxBusRating_A: 3000, drawoutCapable: true, seed: true, verified: false },
    { frameCode: 'F-4260-90', width_in: 42, depth_in: 60, height_in: 90, usableDeviceHeight_in: 62, topBusZone_in: 12, bottomCableZone_in: 16, accessType: 'Front&Rear', maxBusRating_A: 4000, drawoutCapable: true, seed: true, verified: false },
  ],

  /** NEC Table 430.250 three-phase FLA (A) — common HP at 208/230/460/575 V */
  motor_fla: [
    { hp: 1, v208: 4.6, v230: 4.2, v460: 2.1, v575: 1.7, seed: true, verified: false },
    { hp: 2, v208: 7.5, v230: 6.8, v460: 3.4, v575: 2.7, seed: true, verified: false },
    { hp: 3, v208: 10.6, v230: 9.6, v460: 4.8, v575: 3.9, seed: true, verified: false },
    { hp: 5, v208: 16.7, v230: 15.2, v460: 7.6, v575: 6.1, seed: true, verified: false },
    { hp: 7.5, v208: 24.2, v230: 22, v460: 11, v575: 9, seed: true, verified: false },
    { hp: 10, v208: 30.8, v230: 28, v460: 14, v575: 11, seed: true, verified: false },
    { hp: 15, v208: 46.2, v230: 42, v460: 21, v575: 17, seed: true, verified: false },
    { hp: 20, v208: 59.4, v230: 54, v460: 27, v575: 22, seed: true, verified: false },
    { hp: 25, v208: 74.8, v230: 68, v460: 34, v575: 27, seed: true, verified: false },
    { hp: 30, v208: 88, v230: 80, v460: 40, v575: 32, seed: true, verified: false },
    { hp: 40, v208: 114, v230: 104, v460: 52, v575: 41, seed: true, verified: false },
    { hp: 50, v208: 143, v230: 130, v460: 65, v575: 52, seed: true, verified: false },
    { hp: 60, v208: 169, v230: 154, v460: 77, v575: 62, seed: true, verified: false },
    { hp: 75, v208: 211, v230: 192, v460: 96, v575: 77, seed: true, verified: false },
    { hp: 100, v208: 273, v230: 248, v460: 124, v575: 99, seed: true, verified: false },
    { hp: 125, v208: 343, v230: 312, v460: 156, v575: 125, seed: true, verified: false },
    { hp: 150, v208: 396, v230: 360, v460: 180, v575: 144, seed: true, verified: false },
    { hp: 200, v208: 528, v230: 480, v460: 240, v575: 192, seed: true, verified: false },
  ],

  /** Packing constants used by the lineup packer (G24). Values are [SEED] until TPS engineering verifies. */
  packing_settings: [
    {
      feederEnvelope_in: 9, mainEnvelope_in: 20, tieEnvelope_in: 20,
      maxFillPct: 0.8, interdeviceClearance_in: 4,
      seed: true, verified: false,
    },
  ],

  /** Safety rule → SKU mapping. partNumber null = ad-hoc BOM line until TPS maps. */
  safety_items_map: [
    { ruleId: 'R1', description: 'Ground bus 1/4 x 2 Cu full length + equipment ground lugs', partNumber: null, qtyFormula: 'per_board', seed: true, verified: false },
    { ruleId: 'R2', description: 'Arc-flash warning label (NEC 110.16)', partNumber: null, qtyFormula: 'per_section', seed: true, verified: false },
    { ruleId: 'R3', description: 'SCCR + ratings nameplate (UL 891 marking)', partNumber: null, qtyFormula: 'per_board', seed: true, verified: false },
    { ruleId: 'R4', description: 'Filler plate, unused mounting space', partNumber: null, qtyFormula: 'per_remaining_space', seed: true, verified: false },
    { ruleId: 'R7', description: 'SUSE label + main bonding jumper + neutral disconnect', partNumber: null, qtyFormula: 'per_board', seed: true, verified: false },
    { ruleId: 'R8', description: 'Shutter + racking interlock + door interlock (drawout)', partNumber: null, qtyFormula: 'per_drawout_device', seed: true, verified: false },
    { ruleId: 'R9', description: 'Key interlock pair (main-tie scheme)', partNumber: null, qtyFormula: 'per_tie', seed: true, verified: false },
    { ruleId: 'R10', description: 'Space heater + thermostat (outdoor)', partNumber: null, qtyFormula: 'per_section', seed: true, verified: false },
  ],

  /** Conductor material densities (lb/in^3). [SEED] - current audited values. */
  copper_grades: [
    { grade: 'C110 ETP', density_lb_in3: 0.323, isDefault: true, seed: true, verified: false },
    { grade: 'C101 OFE', density_lb_in3: 0.323, seed: true, verified: false },
    { grade: 'Aluminium 6101', density_lb_in3: 0.098, seed: true, verified: false },
  ],

  /** Copper cost model (single-row). [SEED]. */
  copper_cost: [
    { comex_source: 'live', manual_price_per_lb: 9.2, fabrication_adder_per_lb: 0, plating_tin_adder_per_lb: 0, plating_silver_adder_per_lb: 0, escalation_threshold_pct: 5, seed: true, verified: false },
  ],

  /** Copper estimator constants (single-row). [SEED]. */
  copper_estimator: [
    { fab_factor: 1.15, contingency_pct: 10, stub_len_in: 24, seed: true, verified: false },
  ],

  /** Ground bus dimensions (single-row). [SEED]. */
  ground_bus: [
    { thk_in: 0.25, w_in: 2, seed: true, verified: false },
  ],

  /** Enclosure costing model (single-row). model 'fabricated' is a placeholder pending TPS confirmation. [SEED]. */
  enclosure_costing: [
    { model: 'fabricated', steel_price_per_lb: 0, gauge_structure: 12, gauge_covers: 14, fab_hours_per_frame: 0, nema1_mult: 1, nema3r_mult: 1, nema4_mult: 1, nema4x_mult: 1, finish_adder: 0, seed: true, verified: false },
  ],

  /** Load calc factors (single-row). [SEED]. */
  load_calc: [
    { continuous_factor: 1.25, default_power_factor: 0.85, motor_factor: 1.25, default_continuous: true, seed: true, verified: false },
  ],

  /** Breaker selection rules (single-row). [SEED]. */
  breaker_rules: [
    { default_pct_rated: 80, acb_threshold_A: 1600, mccb_max_A: 1200, sccr_basis: 'fully', drawout_mains: true, seed: true, verified: false },
  ],

  /** Termination factors (single-row). [SEED]. */
  termination_factors: [
    { lugs_per_pole: 1, joint_kits_per_joint: 1, seed: true, verified: false },
  ],

  /** Proposal settings (single-row). [SEED]. */
  proposal_settings: [
    { boards_per_block: 4, page_orientation: 'portrait', terms_clause_set: 'TPS_v4', seed: true, verified: false },
  ],
};
