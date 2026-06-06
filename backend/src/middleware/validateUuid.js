/**
 * UUID route-parameter validation.
 *
 * Design:
 *  - Express `router.param(name, cb)` fires BEFORE the route handler whenever a
 *    named parameter is present in a matched route on that specific router.
 *  - Because param handlers are local to the router they're registered on (not
 *    inherited by child routers), `applyUuidValidation(router)` must be called
 *    once per sub-router in routes/index.js.
 *
 * Naming convention used to identify UUID params:
 *  - Exact name  : "id"
 *  - camelCase   : ends with "Id"   (e.g. projectId, userId, companyId)
 *  - snake_case  : ends with "_id"  (e.g. project_id)
 *
 * Non-UUID params (role, category, documentType, grade, form, slotKey,
 * revision, token, module) don't match this pattern and are never validated.
 */

'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every UUID-style param name seen across all route files.
// Kept explicit so a typo in a new route (e.g. ":userId" vs ":user_id") is
// caught at review time rather than silently skipped at runtime.
const UUID_PARAM_NAMES = [
  'id',
  'projectId',
  'project_id',
  'userId',
  'companyId',
  'conversationId',
  'rfqId',
  'itemId',
  'estimateId',
  'materialId',
];

/**
 * Returns an Express param callback that rejects non-UUID values for the
 * given parameter name with a 400 response.
 */
function makeUuidValidator(paramName) {
  return function uuidParamValidator(req, res, next, value) {
    if (!UUID_RE.test(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ID: '${paramName}' must be a valid UUID (received "${value}").`,
      });
    }
    next();
  };
}

/**
 * Register UUID param validators on a router instance.
 * Call once per Express Router that defines UUID route parameters.
 *
 * @param {import('express').Router} router
 */
function applyUuidValidation(router) {
  for (const paramName of UUID_PARAM_NAMES) {
    router.param(paramName, makeUuidValidator(paramName));
  }
}

module.exports = { applyUuidValidation };
