# Phase 10 Serialization Compatibility Analysis

Date: 2026-05-18

## Scope
Compatibility of JSON payload structure between Node and Java for:
- `bom_spec`
- `pricing_spec`
- Snapshot rehydration for PDF regeneration

## BOM Spec Compatibility
Persisted structure contains:
- `rows`
- `by_step`
- `by_section`
- `totals`

Snapshot rehydration uses:
- `rows[*].component_id`
- `rows[*].part_number`
- `rows[*].description|name`
- `rows[*].category`
- `rows[*].step_key`
- `rows[*].section_number`
- `rows[*].quantity`
- `rows[*].unit`
- `rows[*].unit_cost`
- `rows[*].total_cost`
- `rows[*].meta`

## Pricing Spec Compatibility
Persisted structure contains:
- `quote`
- `labour_summary`
- contextual pricing inputs/sections metadata

Snapshot rehydration uses:
- `quote.generated_at`
- `quote.calc_version`
- `quote.totals`
- `quote.labor_costs`
- `quote.labor_hours`
- `quote.adders_grouped`
- `quote.total_line_adders`
- `quote.total_cost`
- `quote.pricing.*`
- `quote.schedule.*`
- `quote.copper_total`
- `labour_summary.hours|costs|rates|totals`

## Type Compatibility Notes
1. Numeric fields:
- JSON numerics from Node and Java are consumed as `Number` and normalized to double in reconstruction.

2. Timestamp fields:
- Instant parsing supports canonical ISO forms used in both implementations.
- Equivalent timestamp strings with formatting differences are semantically compatible.

3. Optional/null handling:
- Rehydration helpers default missing maps/lists to empty structures.
- Core totals can be reconstructed from quotation header values if quote internals are sparse.

## Outcome
Serialization compatibility is sufficient for current parity scope and runtime fixture validation.
