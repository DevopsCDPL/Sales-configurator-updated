'use strict';

/**
 * handoffService.js — Phase F spec §2 (Order Confirmation, outbox pattern)
 *
 * Every cross-boundary step is recorded in configurator_handoff_events
 * with an idempotency key. Replaying order.confirm creates NOTHING
 * twice. Failed steps are retryable individually; a recorded acceptance
 * is never rolled back.
 */

const { models } = require('../../models');
const swJobs = require('./swJobsService');
const { buildSolidworksPayload } = require('./solidworksPayloadBuilder');

/** Run one outbox step idempotently. */
async function runStep(eventType, idempotencyKey, companyId, fn) {
  const [event, created] = await models.ConfiguratorHandoffEvent.findOrCreate({
    where: { event_type: eventType, idempotency_key: idempotencyKey },
    defaults: { status: 'pending', company_id: companyId ?? null },
  });
  if (!created && event.status === 'done') return { skipped: true, result: event.result };

  try {
    const result = await fn();
    await event.update({ status: 'done', result: result ?? {}, attempts: event.attempts + 1, error: null });
    return { skipped: false, result };
  } catch (err) {
    await event.update({ status: 'failed', error: String(err?.message ?? err), attempts: event.attempts + 1 });
    throw err;
  }
}

/**
 * order.confirm — Phase F §2.1. Trigger: quotation accepted.
 * Steps are individually idempotent; partial failure leaves retryable
 * failed events without rolling back completed steps.
 */
async function confirmOrder({ quotation, configuration, switchboards, userId, companyId }) {
  const key = String(quotation.id);
  const results = {};
  const stepErrors = [];

  // 1. Sales order
  try {
    const r = await runStep('order.sales_order', key, companyId, async () => {
      if (!models.SalesOrder) return { note: 'SalesOrder model unavailable — manual creation required' };
      const so = await models.SalesOrder.create({
        project_id: configuration?.project_id ?? null,
        company_id: companyId ?? null,
        status: 'confirmed',
        total_amount: quotation.grand_total ?? 0,
        currency: quotation.currency ?? 'USD',
        notes: `Auto-created from configurator quotation ${quotation.id} (rev ${quotation.revision ?? 0})`,
        created_by: userId ?? null,
      }).catch((e) => ({ error: String(e.message) }));
      return { salesOrderId: so?.id ?? null, error: so?.error };
    });
    results.salesOrder = r;
  } catch (e) { stepErrors.push(['order.sales_order', e.message]); }

  // 2. Lock configuration + switchboards (design freeze)
  try {
    results.lock = await runStep('order.lock_config', key, companyId, async () => {
      await models.ConfiguratorSwitchboard.update(
        { status: 'locked' },
        { where: { configuration_id: configuration.id } }
      );
      return { locked: true };
    });
  } catch (e) { stepErrors.push(['order.lock_config', e.message]); }

  // 3. Enqueue FULL SolidWorks job per switchboard
  try {
    results.swJobs = await runStep('order.sw_jobs', key, companyId, async () => {
      const jobs = [];
      for (const sb of switchboards) {
        try {
          const payload = await buildSolidworksPayload(sb.id);
          const { job, deduped } = await swJobs.enqueue({
            switchboardId: sb.id,
            configurationId: configuration.id,
            quotationId: quotation.id,
            jobType: 'FULL',
            payload,
            requestedBy: userId,
            companyId,
          });
          jobs.push({ switchboardId: sb.id, jobId: job.id, deduped });
        } catch (err) {
          jobs.push({ switchboardId: sb.id, error: String(err.message) });
        }
      }
      return { jobs };
    });
  } catch (e) { stepErrors.push(['order.sw_jobs', e.message]); }

  // 4. Material demands from component lines (mBOM → procurement)
  try {
    results.demands = await runStep('order.demands', key, companyId, async () => {
      const lines = await models.ConfiguratorComponentLine.findAll({
        where: { switchboard_id: switchboards.map((s) => s.id) },
      });
      // Aggregate by part number (mBOM view)
      const byPart = new Map();
      for (const l of lines) {
        const pk = l.part_number || l.component_id || l.id;
        const prev = byPart.get(pk) ?? { partNumber: l.part_number, componentId: l.component_id, qty: 0, category: l.category };
        prev.qty += Number(l.quantity) || 0;
        byPart.set(pk, prev);
      }
      // Mapping gate — Phase F §3.2: unmapped parts land in the queue
      const demands = [];
      let unmapped = 0;
      for (const d of byPart.values()) {
        let mapping = null;
        if (d.componentId) {
          mapping = await models.ConfiguratorComponentMaterialMap.findOne({
            where: { component_id: d.componentId },
          });
          if (!mapping) {
            await models.ConfiguratorComponentMaterialMap.create({
              component_id: d.componentId,
              confidence: 'unmapped',
              company_id: companyId ?? null,
            }).catch(() => {});
            unmapped += 1;
          }
        }
        demands.push({ ...d, mapped: !!mapping && mapping.confidence !== 'unmapped' });
      }
      return { demandCount: demands.length, unmappedCount: unmapped, demands };
    });
  } catch (e) { stepErrors.push(['order.demands', e.message]); }

  return { quotationId: quotation.id, results, stepErrors, ok: stepErrors.length === 0 };
}

/** Retry a failed handoff step by event id. */
async function retryEvent(eventId) {
  const event = await models.ConfiguratorHandoffEvent.findByPk(eventId);
  if (!event || event.status === 'done') return event;
  await event.update({ status: 'pending' });
  return event;
}

module.exports = { confirmOrder, runStep, retryEvent };
