/**
 * Tenant Context — AsyncLocalStorage-based per-request context store.
 *
 * This module provides a request-scoped storage slot for the current tenant's
 * company_id. It is set by the tenantScope middleware and read by Sequelize
 * hooks in models/index.js to automatically inject tenant filters.
 *
 * Using Node's built-in AsyncLocalStorage — no extra dependencies required.
 *
 * ─── HTTP requests ──────────────────────────────────────────────────────────
 * The tenantScope middleware calls tenantContext.run() for every incoming
 * request. All DB queries inside that async chain automatically inherit the
 * context. You do not need to do anything special in controllers.
 *
 * ─── Background tasks (cron, queue workers, batch jobs) ────────────────────
 * AsyncLocalStorage context does NOT propagate outside an HTTP request.
 * Any background task that queries the DB must use one of these two helpers:
 *
 *   // Scoped to a single company:
 *   await tenantContext.runWithTenantContext(companyId, async () => {
 *     await Project.findAll(); // auto-scoped to companyId
 *   });
 *
 *   // Platform-admin level (sees all companies — use with care):
 *   await tenantContext.runAsPlatformAdmin(async () => {
 *     await Company.findAll(); // no company_id filter
 *   });
 *
 * WARNING: Never add DB queries to a background task without one of the above
 * wrappers. Without a wrapper, Sequelize hooks are no-ops and all RLS
 * set_config calls are skipped. After Phase 1, the DB-level RLS policy will
 * block cross-tenant reads, but the result is an error — not silent safety.
 */

const { AsyncLocalStorage } = require('async_hooks');

const _store = new AsyncLocalStorage();

const tenantContext = {
  /**
   * Run a callback inside a new context store. Called by middleware.
   * @param {object|null} value  - { companyId, isPlatformAdmin }
   * @param {Function}    fn     - Continuation (next())
   */
  run(value, fn) {
    _store.run(value, fn);
  },

  /**
   * Read the current tenant context.
   * Returns null outside of a request (e.g., cron jobs, seeding).
   * @returns {{ companyId: string|null, isPlatformAdmin: boolean } | null}
   */
  get() {
    return _store.getStore() ?? null;
  },

  /**
   * Return just the company_id string, or null if platform_admin / no context.
   */
  getCompanyId() {
    const ctx = _store.getStore();
    if (!ctx || ctx.isPlatformAdmin) return null;
    return ctx.companyId ?? null;
  },

  /**
   * Run a background task scoped to a single tenant company.
   *
   * Use this for any non-HTTP operation (cron jobs, queue workers, batch
   * processing) that should query data for one specific company.
   * The Sequelize beforeFind hook and RLS set_config will behave exactly
   * as they do inside a normal HTTP request for that company.
   *
   * @param {string}   companyId  - UUID of the target company
   * @param {Function} fn         - Async function to execute in context
   * @returns {Promise<*>}        - Resolves with fn's return value
   *
   * @example
   *   await tenantContext.runWithTenantContext(company.id, async () => {
   *     const projects = await Project.findAll(); // scoped to company.id
   *     await sendWeeklyReport(projects);
   *   });
   */
  runWithTenantContext(companyId, fn) {
    if (!companyId) {
      throw new Error(
        '[tenantContext] runWithTenantContext requires a valid companyId. ' +
        'Use runAsPlatformAdmin() if you need access to all companies.'
      );
    }
    return _store.run({ companyId, isPlatformAdmin: false, isBackgroundTask: true }, fn);
  },

  /**
   * Run a background task with platform-admin scope (sees all companies).
   *
   * Use this ONLY for genuinely cross-tenant operations such as subscription
   * expiry checks, global analytics, or platform-level maintenance. The
   * Sequelize hooks will NOT inject a company_id filter in this context.
   *
   * @param {Function} fn  - Async function to execute in context
   * @returns {Promise<*>} - Resolves with fn's return value
   *
   * @example
   *   await tenantContext.runAsPlatformAdmin(async () => {
   *     await platformAdminService.checkSubscriptions();
   *   });
   */
  runAsPlatformAdmin(fn) {
    return _store.run({ companyId: null, isPlatformAdmin: true, isBackgroundTask: true }, fn);
  },
};

module.exports = tenantContext;
