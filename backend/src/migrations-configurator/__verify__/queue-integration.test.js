const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('swgplay_staging', 'postgres', 'postgres', {
  host: '127.0.0.1', port: 5433, dialect: 'postgres', logging: false,
});
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log('FAIL:', n, d ?? ''); } };

(async () => {
  const q = (sql, repl) => sequelize.query(sql, { replacements: repl });

  // fixtures
  const [[{ id: cfg }]] = (await q(`INSERT INTO configurator_configurations DEFAULT VALUES RETURNING id`));
  const [[{ id: sb }]] = (await q(`INSERT INTO configurator_switchboards (configuration_id, name) VALUES (:cfg,'QTest') RETURNING id`, { cfg }));

  const enqueue = async (hash, type = 'FULL', priority = 5) => {
    const [[row]] = await q(`
      INSERT INTO configurator_solidworks_jobs (switchboard_id, job_type, payload, payload_version, payload_hash, priority)
      VALUES (:sb, :type, '{"payloadVersion":"1.0"}', '1.0', :hash, :priority) RETURNING id`, { sb, type, hash, priority });
    return row.id;
  };
  const lease = async (agent) => {
    const [rows] = await q(`
      UPDATE configurator_solidworks_jobs j
         SET status='leased', leased_by_agent_id=:agent, lease_expires_at=NOW() + interval '5 minutes', updated_at=NOW()
       WHERE j.id = (SELECT id FROM configurator_solidworks_jobs
                      WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
                      ORDER BY priority ASC, created_at ASC
                      FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING j.id, j.job_type, j.priority`, { agent });
    return rows[0] ?? null;
  };

  // priority ordering: COPPER_ONLY (2) leases before FULL (5)
  const jFull = await enqueue('hash-full-1', 'FULL', 5);
  const jCopper = await enqueue('hash-copper-1', 'COPPER_ONLY', 2);
  const a1 = '11111111-1111-1111-1111-111111111111';
  const a2 = '22222222-2222-2222-2222-222222222222';
  const first = await lease(a1);
  ok('priority: copper first', first?.id === jCopper, first);
  const second = await lease(a2);
  ok('two agents distribute', second?.id === jFull && second.id !== first.id);
  const none = await lease(a1);
  ok('queue drained', none === null);

  // lease expiry reclaim
  await q(`UPDATE configurator_solidworks_jobs SET lease_expires_at = NOW() - interval '1 minute' WHERE id = :id`, { id: jFull });
  await q(`UPDATE configurator_solidworks_jobs SET status='queued', leased_by_agent_id=NULL, lease_expires_at=NULL, attempts=attempts+1
           WHERE status IN ('leased','running') AND lease_expires_at < NOW()`);
  const reclaimed = await lease(a1);
  ok('expired lease reclaimed + attempt++', reclaimed?.id === jFull);
  const [[att]] = await q(`SELECT attempts FROM configurator_solidworks_jobs WHERE id=:id`, { id: jFull });
  ok('attempts incremented', att.attempts === 1, att);

  // idempotency: same hash + active status → dedupe (service-level SELECT first)
  const [dupes] = await q(`SELECT id FROM configurator_solidworks_jobs WHERE payload_hash='hash-copper-1' AND status IN ('queued','leased','running')`);
  ok('hash lookup finds active job (dedupe basis)', dupes.length === 1);

  // handoff outbox unique idempotency key
  await q(`INSERT INTO configurator_handoff_events (event_type, idempotency_key, status) VALUES ('order.sales_order','quote-1','done')`);
  let dup = false;
  try { await q(`INSERT INTO configurator_handoff_events (event_type, idempotency_key, status) VALUES ('order.sales_order','quote-1','pending')`); }
  catch { dup = true; }
  ok('outbox idempotency key UNIQUE enforced', dup);

  // component line section-scope CHECK at app level — verify FK cascade instead
  await q(`INSERT INTO configurator_component_lines (switchboard_id, scope, category, quantity) VALUES (:sb,'board','SPD',1)`, { sb });
  await q(`DELETE FROM configurator_switchboards WHERE id=:sb`, { sb });
  const [[{ n }]] = await q(`SELECT count(*)::int AS n FROM configurator_component_lines WHERE switchboard_id=:sb`, { sb });
  ok('CASCADE: lines deleted with switchboard', n === 0);
  const [[{ n: jn }]] = await q(`SELECT count(*)::int AS n FROM configurator_solidworks_jobs WHERE switchboard_id=:sb`, { sb });
  ok('CASCADE: jobs deleted with switchboard', jn === 0);

  console.log(`\nQUEUE/DB INTEGRATION: ${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); process.exit(1); });
