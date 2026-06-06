# Phase 8 Parity Validation Report (Java Backend)

Date: 2026-05-18
Scope: Forge + Configurator migration hardening after compile stabilization.

## Objective

Validate deterministic parity for configurator pricing/BOM/labour behavior and ensure legacy route aliases are preserved alongside modern `/api/configurator/*` endpoints.

## What Was Validated

1. Engine math parity (unit tests)
- `PricingEngine.roundup` behavior for positive and negative factors.
- `PricingEngine.computeQuote` totals and pricing math for `DESIRED GM%` strategy.
- Schedule date derivation with business-day logic and holiday skipping.

2. BOM and labour aggregation parity (unit tests)
- BOM expansion from config payload and hydration from catalog values.
- String/decimal-compatible numeric coercion behavior.
- Section roll-up generation from BOM rows.
- Labour hours and cost roll-up by category (`CU`, `ASM`, `CNT`, `QC`, `TST`, `ENG`, `CAD`).

3. Compiler orchestration parity (unit tests)
- `stepLines` normalization to `selected_components` structure.
- Line-adder merge behavior and downstream total calculations.
- Aggregate totals (`total_cost`, `target_price`, `rounded_price`, `actual_profit`).

4. API route compatibility contract (unit tests)
- Confirmed presence of modern + legacy aliases, including:
  - `/api/configurator/components` and `/api/components`
  - `/api/configurator/categories` and `/api/categories`
  - `/api/configurator/configurations` and `/api/configs`
  - `/api/configurator/preview` and `/api/quotation/preview`
  - `/api/configurator/compile` and `/api/quotation/compile`
  - `/api/configurator/quotations` and `/api/quotation`
  - `/api/configurator/market/copper` and `/api/market/copper`
  - `/api/configurator/drawing-generation/health` and `/api/solidworks/health`
  - `/api/quotation/health`

## Test Artifacts Added

- `src/test/java/com/forge/configurator/engine/PricingEngineParityTest.java`
- `src/test/java/com/forge/configurator/engine/BomAndLabourEngineParityTest.java`
- `src/test/java/com/forge/configurator/engine/QuotationCompilerParityTest.java`
- `src/test/java/com/forge/configurator/api/ConfiguratorControllerRouteContractTest.java`

## Quality Cleanup

- Removed unused field/constructor injection in auth service:
  - `src/main/java/com/forge/auth/service/AuthService.java`

## Execution Result

Command run:
- `mvn -q test`

Result:
- Exit code `0` (all tests passed)

## Remaining Gaps (Next Phase)

1. Runtime API integration parity checks
- Execute authenticated request/response contract tests against running Spring app.
- Validate status codes and payload shape parity versus Node/Python behavior.

2. Tenant and role enforcement integration tests
- Verify `x-active-company-id` and platform-admin write-path constraints under real filters.

3. PDF and document persistence parity in environment
- Validate generated files, document linkage, and retrieval behavior with storage backends.

4. Market + drawing proxy resilience checks
- Validate non-happy path responses and pass-through status handling under upstream failures.
