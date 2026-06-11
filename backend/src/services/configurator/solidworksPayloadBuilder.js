'use strict';

/**
 * solidworksPayloadBuilder.js — Phase E spec §4 (Design Payload Contract v1)
 *
 * SINGLE source: compiled component lines + sections + board data from
 * the DB — never raw UI state. Price fields are STRIPPED (CAD doesn't
 * need cost). Validated against a JSON shape check at enqueue.
 */

const models = require('../../models');

const PAYLOAD_VERSION = '1.0';

async function buildSolidworksPayload(switchboardId, { requestedArtifacts = ['GA', 'MFG', 'STEP', 'COPPER'], estimatedCopperLbs = null, copperPricePerLb = null } = {}) {
  const board = await models.ConfiguratorSwitchboard.findByPk(switchboardId);
  if (!board) throw new Error(`switchboard ${switchboardId} not found`);

  const sections = await models.ConfiguratorSystemSection.findAll({
    where: { switchboard_id: switchboardId },
    order: [['section_number', 'ASC']],
  }).catch(() => []);

  const lines = await models.ConfiguratorComponentLine.findAll({
    where: { switchboard_id: switchboardId },
    include: [{ model: models.ConfiguratorComponent, as: 'component', required: false }],
  });

  const bd = board.board_data || {};
  const sectionPayload = sections.map((s) => {
    const setup = s.setup || {};
    const layout = s.layout || {};
    const computed = s.computed || {};
    const sectionLines = lines.filter((l) => l.scope === 'section' && l.section_id === s.id);
    const devices = sectionLines
      .filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER')
      .map((l, i) => ({
        lineId: l.id,
        designation: (l.meta && l.meta.designation) || `D${s.section_number}-${i + 1}`,
        partNumber: l.part_number,
        manufacturer: l.component?.specifications?.manufacturer ?? l.meta?.manufacturer ?? null,
        frameModel: l.component?.specifications?.frameModel ?? l.meta?.frameModel ?? null,
        ratedA: Number(l.component?.specifications?.ratedCurrentA ?? l.meta?.ratedA ?? 0) || null,
        poles: Number(l.component?.specifications?.poles ?? l.meta?.poles ?? 3) || 3,
        mounting: l.component?.specifications?.mounting ?? l.meta?.mounting ?? 'Fixed',
        dims: {
          h_in: num(l.component?.dims_h_in), w_in: num(l.component?.dims_w_in), d_in: num(l.component?.dims_d_in),
        },
        weight_lbs: num(l.component?.weight_lbs),
        stackPosition: l.meta?.stackPosition ?? null,
        offsetFromTop_in: l.meta?.offsetFromTop_in ?? null,
      }));
    return {
      sectionIndex: s.section_number,
      role: setup.role ?? setup.sectionType ?? null,
      frameCode: layout.frameCode ?? computed.requiredFrameCode ?? null,
      frame: layout.frame ?? null,
      devices,
      componentLines: sectionLines
        .filter((l) => (l.category || '').toUpperCase() !== 'CIRCUIT BREAKER')
        .map((l) => ({ lineId: l.id, category: l.category, partNumber: l.part_number, qty: Number(l.quantity) })),
      cableEntry: layout.cableEntry ?? bd.cableEntry ?? null,
      cableExit: layout.cableExit ?? bd.cableExit ?? null,
    };
  });

  const payload = {
    payloadVersion: PAYLOAD_VERSION,
    meta: {
      switchboardId: board.id,
      configurationId: board.configuration_id,
      boardName: board.name,
      requestedArtifacts,
      units: 'in/lbs',
    },
    board: {
      boardType: board.board_type,
      standardsRegime: board.standards_regime,
      voltageSystem: bd.voltageSystemCode ?? bd.systemVoltage ?? null,
      mainBusRating_A: num(bd.mainBusRating),
      sccr_kA: num(bd.shortCircuitRating),
      nemaType: bd.nemaType ?? bd.ipRating ?? null,
      serviceEntrance: !!board.service_entrance,
      neutralPct: num(bd.neutralRating) ?? 100,
      accessType: bd.accessType ?? null,
    },
    bus: {
      scheduleRow: bd.busScheduleRow ?? null,
      mainRun_in: sectionPayload.reduce((a, s) => a + (s.frame?.width_in ?? 0), 0) || null,
      supportSpacing_in: bd.supportSpacing_in ?? null,
      estimatedCopperLbs,
      copperPricePerLb,
    },
    sections: sectionPayload,
    sldTopology: bd.sldTopology ?? null,
  };

  const errors = validatePayload(payload);
  if (errors.length) {
    const err = new Error(`payload validation failed: ${errors.join('; ')}`);
    err.code = 'PAYLOAD_INVALID';
    err.details = errors;
    throw err;
  }
  return payload;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Minimal structural validation — Phase E §4 (full JSON Schema later). */
function validatePayload(p) {
  const errors = [];
  if (p.payloadVersion !== PAYLOAD_VERSION) errors.push('payloadVersion mismatch');
  if (!p.meta?.switchboardId) errors.push('meta.switchboardId missing');
  if (!Array.isArray(p.sections)) errors.push('sections missing');
  if (!p.board) errors.push('board missing');
  for (const s of p.sections ?? []) {
    if (!Number.isFinite(s.sectionIndex)) errors.push('section without index');
    for (const d of s.devices ?? []) {
      if (d.ratedA == null) errors.push(`device ${d.designation}: ratedA missing`);
    }
  }
  // No pricing data may leak into CAD payloads
  const json = JSON.stringify(p);
  if (/"(price|unit_cost|unitPrice|cost)":/i.test(json)) errors.push('pricing field leaked into payload');
  return errors;
}

module.exports = { buildSolidworksPayload, validatePayload, PAYLOAD_VERSION };
