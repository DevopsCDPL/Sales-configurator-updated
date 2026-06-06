/**
 * Tenant Isolation Middleware
 * ────────────────────────────
 * Injects tenant scoping into requests.
 *
 * Rules:
 *   platform_admin → NO tenant filter (sees all tenants)
 *   main_admin with company_id → filtered by their company
 *   all other roles → filtered by user's company_id
 *
 * Usage:
 *   router.get('/', authenticate, tenantScope, controller.getAll);
 *
 * After this middleware runs, `req.tenantScope` is set:
 *   - { company_id: '<uuid>' }   for tenant-scoped users
 *   - {}                          for platform_admin (no filter)
 *
 * Controllers MUST use `req.tenantScope` in their Sequelize `where` clauses.
 */

const tenantContext = require('./tenantContext');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sets the `app.company_id` PostgreSQL session variable on a pooled connection.
 * Used by RLS policies (Phase 4) as a DB-level safety net.
 *
 * IMPORTANT — connection pool note:
 *   This query checks out a connection, sets the variable, and returns it.
 *   Subsequent queries in the same request may use different pool connections.
 *   Full per-request correctness requires transactions (SET LOCAL) which is a
 *   future refactoring task. For now this provides best-effort enforcement and
 *   is always correct when the pool reuses the same connection (typical case).
 *   The primary isolation layer is Phase 2 (Sequelize beforeFind hooks).
 */
async function _setDbCompanyId(companyId) {
  try {
    const { sequelize } = require('../models');
    await sequelize.query(
      "SELECT set_config('app.company_id', $1::text, false)",
      { bind: [companyId || ''] }
    );
  } catch (err) {
    // Non-fatal — Phase 2 hooks are the primary isolation mechanism
    const logger = require('../utils/logger');
    logger.warn({ err: err.message }, '[RLS] set_config failed');
  }
}

const tenantScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  // Platform admins can optionally enter a company workspace by sending
  // an explicit company override header from the client.
  if (req.user.role === 'platform_admin') {
    const activeCompanyId = req.headers['x-active-company-id'];
    const trimmed = typeof activeCompanyId === 'string' ? activeCompanyId.trim() : null;
    if (trimmed && !UUID_RE.test(trimmed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid x-active-company-id header: must be a valid UUID.',
      });
    }
    req.activeCompanyId = trimmed || null;
    req.tenantScope = req.activeCompanyId ? { company_id: req.activeCompanyId } : {};
    // Platform admin with active company = scoped; without = sees all (isPlatformAdmin=true)
    return tenantContext.run(
      { companyId: req.activeCompanyId || null, isPlatformAdmin: !req.activeCompanyId },
      async () => { await _setDbCompanyId(req.activeCompanyId || ''); return next(); }
    );
  }

  // main_admin without company_id: legacy/platform-level — allow but no scope
  if (req.user.role === 'main_admin' && !req.user.company_id) {
    req.tenantScope = {};
    return tenantContext.run(
      { companyId: null, isPlatformAdmin: true },
      async () => { await _setDbCompanyId(''); return next(); }
    );
  }

  if (!req.user.company_id) {
    return res.status(403).json({
      success: false,
      message: 'No company assigned. Contact your administrator.',
    });
  }

  // All users with company_id (including main_admin) are tenant-scoped
  req.activeCompanyId = req.user.company_id;
  req.tenantScope = { company_id: req.user.company_id };
  return tenantContext.run(
    { companyId: req.user.company_id, isPlatformAdmin: false },
    async () => { await _setDbCompanyId(req.user.company_id); return next(); }
  );
};

/**
 * Helper to build a WHERE clause that includes tenant scoping.
 * Merges req.tenantScope with any existing where conditions.
 */
const buildTenantWhere = (req, extraWhere = {}) => {
  return { ...extraWhere, ...(req.tenantScope || {}) };
};

/**
 * Verify a Sequelize model instance belongs to the current tenant.
 * Returns true if access is allowed, false if denied.
 */
const verifyTenantRecord = (req, record) => {
  if (!req.tenantScope || !req.tenantScope.company_id) return true; // platform_admin
  if (!record) return false;
  return record.company_id === req.tenantScope.company_id;
};

/**
 * Resolve a company_id for record creation.
 * Throws if company_id cannot be determined — prevents NULL inserts.
 *
 * Priority: explicit value → req.tenantScope → req.user.company_id
 */
const resolveCompanyId = (req, explicitCompanyId) => {
  const resolved =
    explicitCompanyId ||
    (req.tenantScope && req.tenantScope.company_id) ||
    (req.user && req.user.company_id) ||
    null;

  if (!resolved) {
    const err = new Error('company_id is required but could not be determined.');
    err.status = 400;
    throw err;
  }
  return resolved;
};

module.exports = { tenantScope, buildTenantWhere, verifyTenantRecord, resolveCompanyId };
