# Phase 11 API Parity Validation Report

Date: 2026-05-18
Phase: Configurator + Auth API Parity Layer (Java Spring Boot)

## Objective
Validate strict API contract parity for migrated Java endpoints against legacy Node behavior without redesigning routes, payload contracts, auth semantics, validation envelopes, tenant isolation, or compatibility aliases.

## Implemented Parity Scope
1. Auth route alias parity:
- Added dual mapping for profile endpoint to support both /api/auth/profile and /api/auth/me.

2. Configurator payload contract parity:
- Added explicit DTO contract layer for component and configuration create APIs with snake_case canonical fields and camelCase aliases.
- Preserved unknown-field tolerance for payload compatibility.

3. Validation and error envelope parity:
- Expanded centralized exception handling for constraint violations, type mismatches, missing request parameters, and malformed JSON body payloads.

4. Route alias and endpoint surface parity:
- Added route contract tests for auth and configurator aliases, including quotation and drawing-generation aliases.

5. Runtime parity comparison harness:
- Added fixture-driven runtime parity test that compares Java responses with deterministic Node baseline cases.
- Added optional live Node-vs-Java comparison test for direct runtime parity check when legacy Node base URL is available.

## Validation Evidence
Command executed:
- mvn -q test (in java-backend)

Surefire summary (latest run):
- Total tests: 34
- Failures: 0
- Errors: 0
- Skipped: 1 (live Node comparison skipped when LEGACY_NODE_BASE_URL is not set)

Key parity suites passing:
- AuthControllerRouteContractTest
- AuthSecurityIntegrationTest
- ConfiguratorControllerRouteContractTest
- ConfiguratorDtoSerializationParityTest
- ApiRuntimeParityFixtureComparisonTest
- ConfiguratorTenantIsolationIntegrationTest
- TenantContextIntegrationTest

## Decision
Status: PASS

Rationale:
- Contract-level route parity, payload compatibility, error envelope behavior, and tenant guardrails are validated by deterministic tests.
- Runtime parity fixture cases pass with exact response status/body matching.
- No regressions were introduced into existing parity or engine test suites.
