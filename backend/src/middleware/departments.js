'use strict';

/**
 * Department RBAC — permission map + Express guard.
 *
 * Policy v1 (CONSERVATIVE). Resources:
 *   'configurator', 'catalog', 'procurement', 'quality',
 *   'logistics', 'workorders', 'analytics', 'users'
 *
 *   main_admin / admin / platform_admin → everything
 *   procurement   → catalog, procurement, workorders (read context)
 *   quality       → quality, workorders
 *   logistics     → logistics, workorders
 *   packing       → logistics, workorders
 *   manufacturing / assembly / outsourcing / commissioning
 *                 → workorders (+ configurator for read context)
 *   everyone authenticated → read-only basics (configurator, catalog)
 *
 * NON-REGRESSION RULE (critical):
 *   `can()` only restricts the 8 NEW department roles. Any role it does
 *   NOT recognize (legacy: user, sales_engineer, custom roles, or
 *   anything not in DEPARTMENT_ROLES) returns TRUE — i.e. legacy roles
 *   keep their previous, unguarded behavior. We never 403 a role we
 *   don't know about. Only department roles outside their resource map
 *   get `false`.
 *
 * APPLICATION STATUS:
 *   Applied now ONLY to vendor procurement routes (procurement resource).
 *   TODO — apply requireResource() next (follow-up, to avoid breaking
 *   live flows overnight) to:
 *     - configurator V2 routes      → requireResource('configurator')
 *     - catalog / parts master      → requireResource('catalog')
 *     - quality module routes       → requireResource('quality')
 *     - logistics / packing routes  → requireResource('logistics')
 *     - work order routes           → requireResource('workorders')
 *     - analytics / reporting       → requireResource('analytics')
 */

// The 8 new department roles. Only these are subject to can() restriction.
const DEPARTMENT_ROLES = [
  'manufacturing',
  'procurement',
  'assembly',
  'outsourcing',
  'quality',
  'packing',
  'logistics',
  'commissioning',
];

// Roles with unconditional full access.
const FULL_ACCESS_ROLES = ['platform_admin', 'main_admin', 'admin'];

// Resource map for the 8 department roles. Anything not listed → denied
// for that department role only.
const DEPARTMENT_ACCESS = {
  procurement:   ['catalog', 'procurement', 'workorders'],
  quality:       ['quality', 'workorders'],
  logistics:     ['logistics', 'workorders'],
  packing:       ['logistics', 'workorders'],
  manufacturing: ['workorders', 'configurator'],
  assembly:      ['workorders', 'configurator'],
  outsourcing:   ['workorders', 'configurator'],
  commissioning: ['workorders', 'configurator'],
};

/**
 * @param {string} role     - User.role value
 * @param {string} resource - one of the resource keys above
 * @returns {boolean} whether the role may access the resource
 */
function can(role, resource) {
  if (!role) return false;
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  // Legacy / unknown roles keep their previous unguarded behavior.
  if (!DEPARTMENT_ROLES.includes(role)) return true;
  // Known department role: restrict to its allowed resource list.
  const allowed = DEPARTMENT_ACCESS[role] || [];
  return allowed.includes(resource);
}

/**
 * Express middleware factory. Guards a route by resource.
 * Must run AFTER `authenticate` (relies on req.user).
 * 401 if no user, 403 if !can.
 */
function requireResource(resource) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }
    if (!can(req.user.role, resource)) {
      return res.status(403).json({
        success: false,
        message: `Your department role does not have access to ${resource}.`,
      });
    }
    return next();
  };
}

module.exports = { DEPARTMENT_ROLES, can, requireResource };
