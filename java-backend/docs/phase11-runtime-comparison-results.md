# Phase 11 Runtime Comparison Results

Date: 2026-05-18

## Comparison Modes
1. Fixture-based deterministic parity (always runs in CI/local)
- Test: ApiRuntimeParityFixtureComparisonTest
- Baseline file: src/test/resources/api-parity/runtime-node-java-cases.json

2. Live Node-vs-Java direct runtime parity (optional)
- Test: LiveNodeJavaApiComparisonTest
- Requires environment variable LEGACY_NODE_BASE_URL

## Fixture Case Results
Fixture suite cases validated:
- health endpoint parity
- unauthorized me/profile parity
- preview missing configuration_id validation envelope parity
- invalid UUID envelope parity
- contact-admin response parity

Result:
- All fixture cases passed (status code and JSON body equality assertions passed).

## Live Runtime Comparison Result
Latest run status:
- LiveNodeJavaApiComparisonTest skipped (LEGACY_NODE_BASE_URL not set in environment)

Live test behavior:
- When enabled, executes the same request against legacy Node and Java for /api/quotation/health and compares exact status/body.

## Conclusion
Status: PASS for deterministic fixture parity.
Status: CONDITIONAL for live side-by-side parity (requires external legacy Node runtime).
