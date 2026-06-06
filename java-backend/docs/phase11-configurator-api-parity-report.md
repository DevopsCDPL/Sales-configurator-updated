# Phase 11 Configurator API Parity Report

Date: 2026-05-18

## Scope
Configurator and quotation API parity for route aliases, payload contracts, and validation behavior expected by legacy Node clients.

## Contract Changes Applied
1. Explicit payload DTO layer:
- ConfiguratorComponentPayload introduced with snake_case canonical fields and camelCase alias support.
- ConfiguratorConfigurationPayload introduced with snake_case canonical fields and camelCase alias support.
- Unknown JSON fields are ignored for backward-compatible payload ingestion.

2. Controller wiring parity:
- Component create endpoint now consumes typed DTO contract.
- Configuration create endpoint now consumes typed DTO contract.

3. Drawing download validation path:
- file request parameter changed to optional at mapping layer so controller logic can preserve explicit 422-style validation response handling.

4. Route alias parity coverage:
- Contract assertions added for quotation id/pdf/mark-sold aliases.
- Contract assertions added for system-parameters and system-sections aliases.
- Contract assertions added for drawing-generation aliases.

## Evidence
Primary tests:
- ConfiguratorControllerRouteContractTest
- ConfiguratorDtoSerializationParityTest
- ApiRuntimeParityFixtureComparisonTest
- ConfiguratorTenantIsolationIntegrationTest

Latest suite status:
- ConfiguratorControllerRouteContractTest: pass
- ConfiguratorDtoSerializationParityTest: pass
- ConfiguratorTenantIsolationIntegrationTest: pass
- ApiRuntimeParityFixtureComparisonTest: pass

## Decision
Status: PASS

## Compatibility Notes
- DTO record-based contract tests are sensitive to field-order changes; constructor-based tests were corrected to match record signature and now compile/execute successfully.
