'use strict';

/**
 * costingDefaults.js — the single "settings place" for money knobs.
 *
 * Stored as a versioned Engineering Standards table (table_key
 * 'costing_defaults', ONE row) so it is editable in the Standards
 * screen, auditable, and never overwritten — saving writes version N+1.
 * Self-heals: first read creates v1 from the TPS workbook values.
 * Every quote/BOM reads the CURRENT version; per-quote overrides win.
 */

const models = require('../../models');

/** From TPS_Estimate_23XX.xlsm (LOOKUP + CU_LOOKUP), 2026-06-11.
 *  TST/ENG read as $85 — flagged for TPS confirmation. */
const SEED = {
  lbr_cu_rate: 40,
  lbr_asm_rate: 40,
  lbr_cnt_rate: 40,
  lbr_qc_rate: 40,
  lbr_tst_rate: 85,
  lbr_eng_rate: 85,
  lbr_cad_rate: 85,
  overhead_pct: 0.10,
  copper_price_per_lb: 9.2,
  default_gm_pct: 0.40,
  roundup_factor: -1,
  copper_fab_factor: 1.15,        // [SEED]
  copper_contingency_pct: 10,     // [SEED]
  source: 'TPS_Estimate_23XX.xlsm',
  seed: true,
  verified: false,
};

async function getCostingDefaults() {
  let row = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: 'costing_defaults', is_current: true },
    order: [['version', 'DESC']],
  }).catch(() => null);
  if (!row) {
    row = await models.ConfiguratorEngineeringStandard.create({
      table_key: 'costing_defaults',
      version: 1,
      rows: [SEED],
      notes: 'Auto-created from TPS estimate workbook values',
      is_current: true,
    }).catch(() => null);
  }
  const d = (row && Array.isArray(row.rows) && row.rows[0]) || {};
  return { ...SEED, ...d };
}

/** v1 pricing engine lookup shape from the defaults row. */
function toLookup(d) {
  return {
    LBR_CU_rate: Number(d.lbr_cu_rate) || 0,
    LBR_ASM_rate: Number(d.lbr_asm_rate) || 0,
    LBR_CNT_rate: Number(d.lbr_cnt_rate) || 0,
    LBR_QC_rate: Number(d.lbr_qc_rate) || 0,
    LBR_TST_rate: Number(d.lbr_tst_rate) || 0,
    LBR_ENG_rate: Number(d.lbr_eng_rate) || 0,
    LBR_CAD_rate: Number(d.lbr_cad_rate) || 0,
    OVERHEAD_PCT: Number(d.overhead_pct) || 0,
    COPPER_RATE_PER_LB: 0, // copper enters as a material row — never double count
  };
}

module.exports = { getCostingDefaults, toLookup, SEED };
