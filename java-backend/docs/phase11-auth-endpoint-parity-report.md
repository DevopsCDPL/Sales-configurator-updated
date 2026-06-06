# Phase 11 Auth Endpoint Parity Report

Date: 2026-05-18

## Scope
Auth API route and behavior parity for the migrated Java layer, with focus on route aliases, authentication semantics, and stable envelope/error behavior.

## Route Contract Coverage
Validated auth endpoint set includes:
- /api/auth/login
- /api/auth/register
- /api/auth/verify-2fa
- /api/auth/refresh
- /api/auth/logout
- /api/auth/profile
- /api/auth/me
- /api/auth/contact-admin

Parity note:
- /api/auth/me and /api/auth/profile both resolve to the same profile behavior to preserve legacy client compatibility.

## Behavior Parity Checks
1. Unauthenticated profile/me requests:
- Enforced unauthorized behavior remains consistent.

2. Authenticated profile/me requests:
- Auth principal extraction and response envelope behavior validated.

3. Contact-admin flow:
- Runtime parity fixture validates deterministic response contract for the endpoint.

## Evidence
Primary tests:
- AuthControllerRouteContractTest: route-level contract parity
- AuthSecurityIntegrationTest: security and behavior parity
- ApiRuntimeParityFixtureComparisonTest: fixture-based runtime response parity for auth cases

Latest test results for auth suites:
- AuthControllerRouteContractTest: pass
- AuthSecurityIntegrationTest: pass (8 tests)

## Decision
Status: PASS

## Residual Notes
- Live legacy Node side-by-side runtime comparison is available only when LEGACY_NODE_BASE_URL is configured; otherwise fixture parity remains the authoritative baseline in automated runs.
