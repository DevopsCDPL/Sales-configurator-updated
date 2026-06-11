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

  const pricePerLb =
    Number(copperPricePerLb) ||
    Number(bd.copperPricePerLb) ||
    Number(process.env.COPPER_PRICE_PER_LB) || 5.5; // [SEED] until COMEX feed

  const devices = lines
    .filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER')
    .map((l) => ({
      ratedA: Number(l.meta?.ratedA) || 0,
      poles: Number(l.meta?.poles) || 3,
      sectionIndex: Number(l.meta?.sectionIndex) || 1,
    }));

  const copper = estimateCopper(
    { busSchedule, busSupportSpacing },
    {
      mainBusRatingA: Number(bd.mainBusRating) || 0,
      material: bd.busMaterial === 'Aluminium' ? 'Al' : 'Cu',
      neutralPct: Number(String(bd.neutralRating ?? '100').replace('%', '')) || 100,
      sccrKA: Number(bd.shortCircuitRating) || 65,
      sectionWidthsIn: sections.map((s) => Number(s.layout?.frame?.width_in) || 0),
      busZoneHeightsIn: sections.map((s) => Number(s.layout?.frame?.topBusZone_in) || 12),
      devices,
      groundBar: { thkIn: 0.25, wIn: 2 }, // [SEED]
      pricePerLb,
    }
  );

  const bom = compileBomV2(
    { id: board.id, name: board.name, boardData: bd },
    sections,
    lines,
    { busSchedule, busSupportSpacing, frameLibrary },
    copper.estimatedLbs > 0 ? copper : null
  );

  return { board, sections, lines, copper, copperPricePerLb: pricePerLb, bom };
}

module.exports = { compileBoardBom, stdRows };
