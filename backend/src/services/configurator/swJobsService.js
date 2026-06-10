'use strict';

/**
 * swJobsService.js — Phase E spec §2/§5 (SolidWorks job queue)
 *
 * Postgres-backed queue with lease + heartbeat. The Windows agent is
 * PULL-based: it polls /api/sw-jobs/next — nothing connects inbound to
 * the SolidWorks machine. ngrok proxy path is retired.
 */

const crypto = require('crypto');
const { models, sequelize } = require('../../models');

const RETRYABLE = new Set(['SW_HUNG', 'SW_CRASH', 'LICENSE_UNAVAILABLE', 'GEOMETRY_FAIL', 'UPLOAD_FAIL']);
const BACKOFF_MIN = [1, 5, 15]; // Phase E §1 E1-3

function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Enqueue — idempotent on payload hash for active jobs (Phase E §2.1). */
async function enqueue({ switchboardId, configurationId, quotationId, jobType, payload, priority, requestedBy, companyId }) {
  const hash = payloadHash(payload);
  const existing = await models.ConfiguratorSolidworksJob.findOne({
    where: {
      payload_hash: hash,
      job_type: jobType,
      status: ['queued', 'leased', 'running'],
    },
  });
  if (existing) return { job: existing, deduped: true };

  const job = await models.ConfiguratorSolidworksJob.create({
    switchboard_id: switchboardId,
    configuration_id: configurationId ?? null,
    quotation_id: quotationId ?? null,
    job_type: jobType,
    payload,
    payload_version: payload.payloadVersion || '1.0',
    payload_hash: hash,
    priority: priority ?? (jobType === 'COPPER_ONLY' ? 2 : 5),
    requested_by: requestedBy ?? null,
    company_id: companyId ?? null,
  });
  await models.ConfiguratorSwitchboard.update(
    { drawings_status: 'queued' },
    { where: { id: switchboardId } }
  ).catch(() => {});
  return { job, deduped: false };
}

/**
 * Lease the next job for an agent — atomic SKIP LOCKED (Phase E §2.2).
 * Also reclaims expired leases first.
 */
async function leaseNext({ agentId, supportedVersions = ['1.0'], jobTypes = ['FULL', 'DRAWINGS', 'COPPER_ONLY'], leaseMinutes = 5 }) {
  // Reclaim expired leases
  await sequelize.query(`
    UPDATE configurator_solidworks_jobs
       SET status = 'queued', leased_by_agent_id = NULL, lease_expires_at = NULL,
           attempts = attempts + 1
     WHERE status IN ('leased','running') AND lease_expires_at < NOW()
  `);
  // Terminal-fail jobs that exhausted attempts during reclaim
  await sequelize.query(`
    UPDATE configurator_solidworks_jobs
       SET status = 'failed', last_error_code = COALESCE(last_error_code,'SW_HUNG'),
           last_error_message = COALESCE(last_error_message,'lease expired (agent lost)')
     WHERE status = 'queued' AND attempts >= max_attempts
  `);

  const [rows] = await sequelize.query(
    `
    UPDATE configurator_solidworks_jobs j
       SET status = 'leased', leased_by_agent_id = :agentId,
           lease_expires_at = NOW() + (:leaseMin || ' minutes')::interval,
           updated_at = NOW()
     WHERE j.id = (
       SELECT id FROM configurator_solidworks_jobs
        WHERE status = 'queued'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND payload_version IN (:versions)
          AND job_type IN (:types)
        ORDER BY priority ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING j.*
    `,
    { replacements: { agentId, leaseMin: String(leaseMinutes), versions: supportedVersions, types: jobTypes } }
  );
  const job = rows?.[0] ?? null;
  if (job) {
    await models.ConfiguratorSolidworksAgent.update(
      { last_seen_at: new Date() },
      { where: { id: agentId } }
    ).catch(() => {});
  }
  return job;
}

/** Heartbeat — extends lease, updates progress, surfaces cancel flag. */
async function heartbeat({ jobId, agentId, progress, leaseMinutes = 5 }) {
  const job = await models.ConfiguratorSolidworksJob.findByPk(jobId);
  if (!job || job.leased_by_agent_id !== agentId) return { ok: false, cancel: true };
  await job.update({
    status: 'running',
    progress: progress ?? job.progress,
    lease_expires_at: new Date(Date.now() + leaseMinutes * 60 * 1000),
  });
  await models.ConfiguratorSwitchboard.update(
    { drawings_status: 'running' },
    { where: { id: job.switchboard_id } }
  ).catch(() => {});
  return { ok: true, cancel: !!job.cancel_requested };
}

/** Success — register artifacts + post-processing (Phase E §5.2 / Phase D §5). */
async function complete({ jobId, agentId, artifacts = [], copper = null }) {
  const job = await models.ConfiguratorSolidworksJob.findByPk(jobId);
  if (!job || job.leased_by_agent_id !== agentId) throw new Error('job not leased by this agent');

  await job.update({
    status: 'succeeded',
    artifacts,
    completed_at: new Date(),
    progress: { step: 'done', pct: 100 },
  });
  await models.ConfiguratorSwitchboard.update(
    { drawings_status: job.job_type === 'COPPER_ONLY' ? undefined : 'generated' },
    { where: { id: job.switchboard_id } }
  ).catch(() => {});

  let reconciliation = null;
  if (copper && Number.isFinite(Number(copper.total_lbs))) {
    reconciliation = await createCopperReconciliation(job, copper);
  }
  return { job, reconciliation };
}

/** Phase D §5 — reconciliation with threshold routing. */
async function createCopperReconciliation(job, copper) {
  const exact = Number(copper.total_lbs);
  const estimated = Number(job.payload?.bus?.estimatedCopperLbs ?? copper.estimated_lbs ?? 0);
  const pricePerLb = Number(job.payload?.bus?.copperPricePerLb ?? 0) || null;
  const thresholdPct = Number(process.env.COPPER_TRUEUP_THRESHOLD_PCT || 5);
  const deltaPct = estimated > 0 ? ((exact - estimated) / estimated) * 100 : 0;
  const status = Math.abs(deltaPct) <= thresholdPct ? 'ok' : 'review';

  return models.ConfiguratorCopperReconciliation.create({
    switchboard_id: job.switchboard_id,
    quotation_id: job.quotation_id,
    solidworks_job_id: job.id,
    estimated_lbs: estimated,
    exact_lbs: exact,
    delta_pct: Math.round(deltaPct * 100) / 100,
    price_per_lb: pricePerLb,
    margin_impact_usd: pricePerLb ? Math.round((exact - estimated) * pricePerLb * 100) / 100 : null,
    per_section: copper.perSection ?? null,
    status,
    company_id: job.company_id,
  });
}

/** Failure — typed error codes drive retry policy (Phase E §3). */
async function fail({ jobId, agentId, errorCode, errorMessage }) {
  const job = await models.ConfiguratorSolidworksJob.findByPk(jobId);
  if (!job || job.leased_by_agent_id !== agentId) throw new Error('job not leased by this agent');

  const attempts = job.attempts + 1;
  const retryable = RETRYABLE.has(errorCode) && attempts < job.max_attempts;
  const backoffMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];

  await job.update({
    status: retryable ? 'queued' : 'failed',
    attempts,
    last_error_code: errorCode,
    last_error_message: errorMessage,
    leased_by_agent_id: null,
    lease_expires_at: null,
    next_attempt_at: retryable ? new Date(Date.now() + backoffMin * 60 * 1000) : null,
    completed_at: retryable ? null : new Date(),
  });
  if (!retryable) {
    await models.ConfiguratorSwitchboard.update(
      { drawings_status: 'failed' },
      { where: { id: job.switchboard_id } }
    ).catch(() => {});
  }
  return { retryable, attempts };
}

async function cancel({ jobId }) {
  const job = await models.ConfiguratorSolidworksJob.findByPk(jobId);
  if (!job) return null;
  if (['queued'].includes(job.status)) {
    await job.update({ status: 'cancelled', completed_at: new Date() });
  } else if (['leased', 'running'].includes(job.status)) {
    await job.update({ cancel_requested: true }); // cooperative
  }
  return job;
}

module.exports = { enqueue, leaseNext, heartbeat, complete, fail, cancel, payloadHash };
