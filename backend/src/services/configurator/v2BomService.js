'use strict';

/**
 * v2BomService.js — single source for "compile this switchboard's BOM".
 * Used by GET /switchboards/:id/bom AND the quote pipeline so the two
 * can never disagree. Generator rows + copper estimate recomputed on
 * every call from persisted design + current Engineering Standards.
 */

const models = require('../../models');
const { compileBomV2 } = require('./bomEngineV2');
const { estimateCopper } = require('./copperEstimator');
const { getStandard, getStandardMeta, firstRow } = require('./standardsService');
const { getCostingDefaults } = require('./costingDefaults');

async function stdRows(tableKey) {
  const row = await models.ConfiguratorEngineeringStandard.findOne({
    where: { table_key: tableKey, is_current: true },
    order: [['version', 'DESC']],
  });
  return Array.isArray(row?.rows) ? row.rows : [];
}

async function compileBoardBom(switchboardId, { copperPricePerLb = null } = {}) {
  const board = await models.ConfiguratorSwitchboard.findByPk(switchboardId);
  if (!board) {
    const err = new Error('switchboard not found');
    err.status = 404;
    throw err;
  }

  const [sectionRows, lineRows, busSchedule, busSupportSpacing, frameLibrary] = await Promise.all([
    models.ConfiguratorSystemSection.findAll({
      where: { switchboard_id: board.id }, order: [['section_number', 'ASC']],
    }),
    models.ConfiguratorComponentLine.findAll({
      where: { switchboard_id: board.id }, order: [['created_at', 'ASC']],
    }),
    stdRows('bus_schedule'),
    stdRows('bus_support_spacing'),
    stdRows('frame_library'),
  ]);
  const neutralSchedule = await stdRows('neutral_bus_schedule');
  const safetyItemsMap = await stdRows('safety_items_map');

  const bd = board.board_data || {};
  const frameOf = (s) => s.layout?.frame
    ?? frameLibrary.find((f) => f.frameCode === s.layout?.frameCode)
    ?? null;

  const sections = sectionRows.map((s) => ({
    id: s.id,
    sectionIndex: s.section_number,
    setup: s.setup || {},
    layout: { ...(s.layout || {}), frame: frameOf(s) },
    computed: s.computed || {},
  }));

  const lines = lineRows.map((l) => ({
    id: l.id,
    section_id: l.section_id,
    component_id: l.component_id,
    scope: l.scope,
    category: l.category,
    part_number: l.part_number,
    name: l.name,
    quantity: Number(l.quantity) || 0,
    unit_cost: Number(l.unit_cost) || 0,
    price_status: l.price_status,
    source: l.source,
    meta: l.meta || {},
    sectionIndex: l.meta?.sectionIndex ?? null,
  }));

  const defaults = await getCostingDefaults();
  const pricePerLb =
    Number(copperPricePerLb) ||
    Number(bd.copperPricePerLb) ||
    Number(defaults.copper_price_per_lb) ||
    Number(process.env.COPPER_PRICE_PER_LB) || 5.5;

  const devices = lines
    .filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER')
    .map((l) => ({
      ratedA: Number(l.meta?.ratedA) || 0,
      poles: Number(l.meta?.poles) || 3,
      sectionIndex: Number(l.meta?.sectionIndex) || 1,
    }));

  // Phase 4b — read with provenance so generated (copper/ground/termination)
  // rows can be flagged when they rest on an unverified seed standard.
  const _provKeys = ['copper_estimator', 'ground_bus', 'copper_grades', 'termination_factors'];
  const _prov = {};
  for (const k of _provKeys) { _prov[k] = await getStandardMeta(k); } // eslint-disable-line no-await-in-loop
  const seedStandards = _provKeys.filter((k) => _prov[k] && _prov[k].source === 'seed');
  const copperEstStd = firstRow(_prov.copper_estimator.rows);
  const groundStd    = firstRow(_prov.ground_bus.rows);
  const gradeRows    = _prov.copper_grades.rows;
  const termStd      = firstRow(_prov.termination_factors.rows);

  const isAl = bd.busMaterial === 'Aluminium';
  const gradeRow = isAl
    ? gradeRows.find(g => /alumin/i.test(g.grade))
    : (gradeRows.find(g => g.isDefault) || gradeRows.find(g => !/alumin/i.test(g.grade)));
  const densityLbIn3 = Number(gradeRow?.density_lb_in3) || (isAl ? 0.098 : 0.323);

  const copper = estimateCopper(
    { busSchedule, busSupportSpacing, neutralSchedule },
    {
      mainBusRatingA: Number(bd.mainBusRating) || 0,
      material: bd.busMaterial === 'Aluminium' ? 'Al' : 'Cu',
      neutralPct: Number(String(bd.neutralRating ?? '100').replace('%', '')) || 100,
      sccrKA: Number(bd.shortCircuitRating) || 65,
      sectionWidthsIn: sections.map((s) => Number(s.layout?.frame?.width_in) || 0),
      busZoneHeightsIn: sections.map((s) => Number(s.layout?.frame?.topBusZone_in) || 12),
      devices,
      groundBar: { thkIn: Number(groundStd?.thk_in) || 0.25, wIn: Number(groundStd?.w_in) || 2 },
      densityLbIn3,
      pricePerLb,
    },
    { fabFactor: Number(copperEstStd?.fab_factor) || 1.15, contingencyPct: Number(copperEstStd?.contingency_pct) || 10, stubLenIn: Number(copperEstStd?.stub_len_in) || 24 }
  );

  const bom = compileBomV2(
    {
      id: board.id, name: board.name,
      boardData: {
        ...bd,
        _facts: {
          serviceEntrance: !!board.service_entrance,
          environment: board.intake?.environment ?? bd.environment ?? 'Indoor',
        },
      },
    },
    sections,
    lines,
    { busSchedule, busSupportSpacing, frameLibrary, safetyItemsMap, groundBus: groundStd, termination: termStd },
    copper.estimatedLbs > 0 ? copper : null
  );

  if (bom && typeof bom === 'object') bom.seedStandards = seedStandards;
  return { board, sections, lines, copper, copperPricePerLb: pricePerLb, bom, seedStandards };
}

module.exports = { compileBoardBom, stdRows };
