'use strict';

/**
 * 20260614000001-backfill-cb-specs — one-time backfill of STRUCTURED breaker
 * specs parsed from the name, for CIRCUIT BREAKER components missing them.
 *
 * WHY: the 133 TPS-priced legacy breakers (e.g. "800A-1200A 3P 65kA LSI - Power")
 * carry their ratings ONLY in the name — specifications.ratedCurrentA etc. are
 * absent. The line-up candidate filter requires a structured ratedCurrentA
 * (breakerRatedCurrent >= design current), so these TPS breakers were SILENTLY
 * EXCLUDED from auto-selection and never competed with the fully-spec'd
 * cbCatalogSeed breakers. Backfilling structured specs makes the TPS breakers
 * eligible; the TPS-first ranking (pickCheapest / rules matcher) then prefers
 * them. Provenance (priceSource) is left untouched.
 *
 * Idempotent: only fills fields that are currently missing. Runs once (boot,
 * SequelizeMeta-tracked); re-running is a no-op once specs exist.
 */

/** Parse "800A-1200A 3P 65kA LSI Dip - Power" → structured spec fields. */
function parseBreakerName(name) {
  const n = String(name || '');
  const out = {};

  // Rated current: take the HIGHEST amp value in the name (frame/trip range top).
  const amps = [...n.matchAll(/(\d+(?:\.\d+)?)\s*A\b/gi)].map((m) => Number(m[1])).filter((x) => x > 0);
  if (amps.length) out.ratedCurrentA = Math.max(...amps);

  // Interrupting kA
  const ka = /(\d+(?:\.\d+)?)\s*kA/i.exec(n);
  if (ka) out.interruptingKA = Number(ka[1]);

  // Poles
  const p = /(\d)\s*P\b/i.exec(n);
  if (p) out.poles = Number(p[1]);

  // Protection functions
  const prot = /\b(LSIG|LSI|LSG|LIG|LI|TMA|TMF)\b/i.exec(n);
  if (prot) out.protectionFunctions = prot[1].toUpperCase();

  // Device class + mounting heuristic: "Power" line = drawout ACB; molded-case
  // (Dip / TMA / TMF / MCCB) = fixed MCCB; explicit ACB/MCCB/MCB wins.
  const cls = /\b(ACB|MCCB|MCB|ICCB)\b/i.exec(n);
  if (cls) out.deviceClass = cls[1].toUpperCase();
  else if (/\bpower\b/i.test(n)) out.deviceClass = 'ACB';
  else if (/\b(dip|tma|tmf)\b/i.test(n)) out.deviceClass = 'MCCB';

  if (!out.mounting) {
    if (/\bpower\b/i.test(n) || out.deviceClass === 'ACB') out.mounting = 'Drawout';
    else if (out.deviceClass === 'MCCB') out.mounting = 'Fixed';
  }
  return out;
}

module.exports = {
  async up() {
    const models = require('../models');
    const C = models.ConfiguratorComponent;
    const { Op } = require('sequelize');
    const rows = await C.findAll({ where: { category: 'CIRCUIT BREAKER' } });
    let updated = 0;
    for (const r of rows) {
      const sp = r.specifications || {};
      const parsed = parseBreakerName(r.name);
      const merged = { ...sp };
      let changed = false;
      for (const k of Object.keys(parsed)) {
        const cur = merged[k];
        if (cur == null || cur === '' ) { merged[k] = parsed[k]; changed = true; }
      }
      if (changed) {
        await r.update({ specifications: merged }).catch(() => {});
        updated += 1;
      }
    }
    console.log(`[backfill-cb-specs] structured specs filled on ${updated}/${rows.length} circuit breakers`);
  },

  async down() {
    // Non-destructive: leave backfilled specs in place.
  },
};
