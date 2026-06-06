# Phase 10 Parity Validation Report

Date: 2026-05-18
Phase: Configurator Entity + Engine Parity Migration (Java)

## Objective
Validate that Java configurator quotation behavior remains aligned with legacy Node configurator behavior without redesigning architecture, changing rounding semantics, or changing quotation total semantics.

## Implemented Parity Work
1. Snapshot regeneration parity in quotation lifecycle:
- `ConfiguratorQuotationService.regenerateQuotationPdf(...)` now regenerates from persisted quotation snapshot (`bom_spec` + `pricing_spec`) rather than recompiling mutable live config state.
- Added snapshot reconstruction helper that rebuilds `CompiledQuotation` from persisted JSON structures.

2. PDF document metadata parity tightening:
- `PdfQuotationService` metadata fields aligned with configurator document conventions (`module_type=configurator`, `document_type=configurator_quotation`, `status=final`, `file_type=generated`, workflow stage alignment).

3. Missing entity/repository parity artifact:
- Added `ConfiguratorComponentCompatibilityEntity`.
- Added `ConfiguratorComponentCompatibilityRepository`.

4. Runtime fixture parity harness:
- Added deterministic fixture JSON for side-by-side engine comparison.
- Added Node runner script that executes legacy Node engines against the same fixture.
- Added Java parity comparison test that executes Node + Java and compares critical output surfaces.
- Added lifecycle parity test for snapshot-driven PDF regeneration behavior.

## Validation Evidence
Test execution:
- Command: `mvn -q test` in `java-backend`.
- Result: no surefire failure markers (`NO_TEST_FAILURE_MARKERS`).

New tests included:
- `RuntimeFixtureParityComparisonTest`
- `ConfiguratorQuotationServiceLifecycleParityTest`

## Parity Decision
Status: PASS (with residual risk notes documented separately)

Rationale:
- Runtime fixture test confirms side-by-side Java/Node parity for BOM rows, labour rollups, quote totals, pricing output, and RTS schedule equivalence for the same input fixture.
- Lifecycle test confirms PDF regeneration path uses persisted snapshot data, matching Node lifecycle expectation.
- Full Java test suite remains green after integration.

## Non-Goals Preserved
- No redesign of configurator architecture.
- No intentional rounding algorithm changes.
- No intentional quotation total formula changes.
