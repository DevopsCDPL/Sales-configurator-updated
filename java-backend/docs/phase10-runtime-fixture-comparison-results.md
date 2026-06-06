# Phase 10 Runtime Fixture Comparison Results

Date: 2026-05-18

## Fixture Inputs
Fixture file:
- `src/test/resources/configurator-fixtures/runtime-fixture-01.json`

Fixture contains:
- Configuration identity payload
- `configData` with `stepLines` and manual `plus_comp.bom_rows`
- Deterministic component catalog entries
- Labour/overhead lookup rates
- Pricing strategy (`DESIRED GM%`) + roundup factor
- Schedule inputs + holiday list
- Line adders

## Comparison Harness
Node execution:
- `src/test/resources/configurator-fixtures/node-engine-runner.js`
- Uses legacy Node engines (`bomEngine`, `labourEngine`, `pricingEngine`, `quotationCompiler`) with Node-style normalization.

Java execution:
- `RuntimeFixtureParityComparisonTest`
- Uses Java `BomEngine`, `LabourEngine`, `PricingEngine`, `QuotationCompiler` on the same fixture data.

## Assertions Performed
1. BOM parity:
- Row count
- `part_number`, `step_key`, `section_number`
- `quantity`, `unit_cost`, `total_cost`

2. Labour parity:
- Category `hours`, `costs`, `rates`
- `hours_total`, `cost_total`

3. Totals parity:
- `material_total`
- `section_cost_total`
- `overhead_amount`
- `copper_cost`
- `total_cost`
- `target_price`
- `rounded_price`
- `actual_profit`
- `actual_gm`

4. Quote parity:
- `quote.pricing.rounded_price`
- `quote.schedule.rts_date` (normalized to equivalent instant)

## Result
Status: PASS

Notes:
- Timestamp formatting precision (`.000Z` vs `Z`) is normalized before comparison to avoid false mismatches.
- Numeric comparisons use epsilon tolerance to avoid floating-point formatting noise.
