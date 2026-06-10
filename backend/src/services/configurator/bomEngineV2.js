'use strict';

/**
 * bomEngineV2.js — Phase D spec §2 (section-scoped BOM, pure)
 *
 * One row stream, two aggregations:
 *   eBOM — switchboard → section → category (engineering / SolidWorks)
 *   mBOM — part number + where-used (purchasing / Phase F demands)
 *
 * Auto-quantity generators (GEN-*) compute what nobody should pick by
 * hand. Every generator row is traceable (generator_id + inputs hash).
 * bomEngine.js (v1) is untouched; flag CONFIGURATOR_V2_BOM selects.
 */

const crypto = require('crypto');

const hashInputs = (obj) =>
  crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 12);

/**
 * @param {Object} board   { id, name, boardData: {mainBusRating, shortCircuitRating, neutralRating, ...} }
 * @param {Array}  sections [{ id, sectionIndex, setup, layout, computed }]
 * @param {Array}  lines    component lines (plain objects, both scopes)
 * @param {Object} std      Engineering Standards { busSchedule, busSupportSpacing, frameLibrary }
 * @param {Object} copperEst optional copper estimator result (Phase D §4)
 * @returns {{ rows, ebom, mbom, totals }}
 */
function compileBomV2(board, sections, lines, std, copperEst = null) {
  const rows = [];

  // 1. Component lines pass through (device + picked lines)
  for (const l of lines) {
    rows.push({
      switchboard_id: board.id,
      section_id: l.section_id ?? null,
      sectionIndex: l.sectionIndex ?? sectionIndexOf(sections, l.section_id),
      scope: l.scope,
      category: l.category,
      part_number: l.part_number ?? null,
      description: l.name ?? l.description ?? null,
      quantity: Number(l.quantity) || 0,
      unit: l.unit ?? 'ea',
      unit_cost: Number(l.unit_cost ?? l.unitPrice ?? 0),
      price_status: l.price_status ?? l.priceStatus ?? 'FIRM',
      labor_hours: l.labor_hours ?? l.laborHours ?? {},
      source: l.source ?? 'user',
      generator_id: null,
      copper_weight_lbs: null,
    });
  }

  const bd = board.boardData ?? {};
  const busRating = Number(bd.mainBusRating) || 0;
  const sccr = Number(bd.shortCircuitRating) || 0;
  const neutralPct = Number(String(bd.neutralRating ?? '100').replace('%', '')) || 100;
  const widths = sections.map((s) => Number(s.layout?.frame?.width_in) || 0);
  const mainRun = widths.reduce((a, b) => a + b, 0);

  // 2. GEN-BUS-MAIN — bars from schedule × run length
  const sched = (std.busSchedule ?? [])
    .filter((r) => r.ratingA >= busRating && (r.material ?? 'Cu') === (bd.busMaterial === 'Aluminium' ? 'Al' : 'Cu'))
    .sort((a, b) => a.ratingA - b.ratingA)[0];
  if (sched && mainRun > 0) {
    const gid = 'GEN-BUS-MAIN';
    const ih = hashInputs({ sched, mainRun, neutralPct });
    const barDesc = `${sched.barThk_in}" x ${sched.barW_in}" ${sched.material} bar, ${sched.plating}`;
    rows.push(genRow(board, gid, ih, 'BUSSING', `Phase bus — ${barDesc} × ${mainRun}" run`, sched.barsPerPhase * 3, 'bar-run'));
    rows.push(genRow(board, gid, ih, 'BUSSING', `Neutral bus (${neutralPct}%) — ${barDesc}`, Math.ceil(sched.barsPerPhase * (neutralPct / 100)), 'bar-run'));
    rows.push(genRow(board, gid, ih, 'BUSSING', `Ground bus — 0.25" x 2" Cu × ${mainRun}" [SEED]`, 1, 'bar-run'));
  }

  // 3. GEN-GLASTIC — supports per SCCR spacing
  const spacingRow = (std.busSupportSpacing ?? [])
    .filter((r) => r.sccr_kA >= sccr)
    .sort((a, b) => a.sccr_kA - b.sccr_kA)[0];
  if (spacingRow && mainRun > 0) {
    const qty = Math.ceil(mainRun / spacingRow.maxSpacing_in) + 1;
    rows.push(genRow(board, 'GEN-GLASTIC', hashInputs({ spacingRow, mainRun }), 'GLASTIC',
      `Bus support (glastic) — spacing ${spacingRow.maxSpacing_in}" @ ${sccr} kA`, qty, 'ea'));
  }

  // 4. GEN-HW-JOINT — joint kits at section boundaries
  if (sections.length > 1 && sched) {
    const joints = (sections.length - 1) * sched.barsPerPhase * 3;
    rows.push(genRow(board, 'GEN-HW-JOINT', hashInputs({ joints }), 'HARDWARE',
      'Bus joint kit (bolts + Belleville washers) [SEED 1/joint]', joints, 'kit'));
  }

  // 5. GEN-LABEL — R2/R3
  rows.push(genRow(board, 'GEN-LABEL', hashInputs({ n: sections.length }), 'SAFETY',
    'Arc-flash warning label (NEC 110.16)', Math.max(sections.length, 1), 'ea'));
  rows.push(genRow(board, 'GEN-LABEL', hashInputs({ b: board.id }), 'SAFETY',
    'SCCR + ratings nameplate (UL 891)', 1, 'ea'));

  // 6. GEN-FILLER — remaining space per section
  for (const s of sections) {
    const remaining = Number(s.computed?.remainingHeightIn) || 0;
    if (remaining >= 6) {
      rows.push({
        ...genRow(board, 'GEN-FILLER', hashInputs({ s: s.sectionIndex, remaining }), 'HARDWARE',
          `Filler plates — section ${s.sectionIndex} (${remaining}" open)`, Math.ceil(remaining / 12), 'ea'),
        section_id: s.id, sectionIndex: s.sectionIndex, scope: 'section',
      });
    }
  }

  // 7. GEN-LUG — terminations [v1: devices × poles]
  const deviceLines = lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER');
  const lugQty = deviceLines.reduce((a, l) => a + (Number(l.meta?.poles) || 3) * (Number(l.quantity) || 1), 0);
  if (lugQty > 0) {
    rows.push(genRow(board, 'GEN-LUG', hashInputs({ lugQty }), 'LUGS',
      'Mechanical lug, load-side termination [SEED 1/pole — refined with cable sizing]', lugQty, 'ea'));
  }

  // 8. Copper estimate row (Phase D §4.2)
  if (copperEst && copperEst.estimatedLbs > 0) {
    rows.push({
      ...genRow(board, 'GEN-COPPER-EST', hashInputs(copperEst), 'BUSSING',
        `Copper bus structure (ESTIMATED ${copperEst.estimatedLbs} lbs @ $${copperEst.pricePerLb ?? '—'}/lb)`, 1, 'lot'),
      unit_cost: copperEst.costUsd ?? 0,
      price_status: 'ESTIMATED',
      copper_weight_lbs: copperEst.estimatedLbs,
    });
  }

  // ── Aggregations ──
  const ebom = {};
  for (const r of rows) {
    const sec = r.scope === 'section' ? `Section ${r.sectionIndex ?? '?'}` : 'Board';
    ebom[sec] = ebom[sec] ?? {};
    ebom[sec][r.category ?? 'OTHER'] = ebom[sec][r.category ?? 'OTHER'] ?? [];
    ebom[sec][r.category ?? 'OTHER'].push(r);
  }

  const mbomMap = new Map();
  for (const r of rows) {
    const key = r.part_number || `${r.category}::${r.description}`;
    const prev = mbomMap.get(key) ?? {
      part_number: r.part_number, category: r.category, description: r.description,
      quantity: 0, unit: r.unit, unit_cost: r.unit_cost, price_status: r.price_status,
      whereUsed: [],
    };
    prev.quantity += r.quantity;
    prev.whereUsed.push(r.scope === 'section' ? `S${r.sectionIndex}` : 'BOARD');
    if (r.price_status !== 'FIRM') prev.price_status = r.price_status;
    mbomMap.set(key, prev);
  }
  const mbom = [...mbomMap.values()];

  const totals = {
    materialTotal: rows.reduce((a, r) => a + r.quantity * (r.unit_cost || 0), 0),
    rowCount: rows.length,
    nonFirmCount: rows.filter((r) => r.price_status !== 'FIRM').length,
    copperEstLbs: copperEst?.estimatedLbs ?? 0,
    laborHours: sumLabor(rows),
  };

  return { rows, ebom, mbom, totals };
}

function genRow(board, generatorId, inputsHash, category, description, quantity, unit) {
  return {
    switchboard_id: board.id,
    section_id: null,
    sectionIndex: null,
    scope: 'board',
    category,
    part_number: null,
    description,
    quantity,
    unit,
    unit_cost: 0,
    price_status: 'FIRM',
    labor_hours: {},
    source: 'generator',
    generator_id: generatorId,
    generator_inputs_hash: inputsHash,
    copper_weight_lbs: null,
  };
}

function sectionIndexOf(sections, sectionId) {
  return sections.find((s) => s.id === sectionId)?.sectionIndex ?? null;
}

function sumLabor(rows) {
  const buckets = { cu: 0, asm: 0, cnt: 0, qc: 0, tst: 0, eng: 0, cad: 0 };
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.labor_hours ?? {})) {
      const key = k.toLowerCase();
      if (key in buckets) buckets[key] += Number(v) * r.quantity || 0;
    }
  }
  buckets.total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return buckets;
}

module.exports = { compileBomV2, hashInputs };
