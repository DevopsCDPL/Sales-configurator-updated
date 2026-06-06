# Phase 10 Unresolved Parity Gaps

Date: 2026-05-18

## Critical / Major Gaps
None identified in current scope.

## Observed Parity Sensitivity (Non-Blocking)
1. Fixture line-price completeness:
- If a step-line omits explicit `unitPrice`, parity can depend on each engine's fallback behavior path.
- Current fixture now sets explicit line unit price to keep deterministic equivalence for direct engine comparison.

2. Timestamp text formatting:
- Node and Java can serialize equivalent instants with different string precision (`.000Z` vs `Z`).
- Runtime test normalizes instants before assert.

## Remaining Validation Depth Opportunities
1. Add more fixtures for:
- Deep multi-section adders with ordering stress
- Large mixed manual + selected component sets
- Edge schedule/holiday crossing behavior

2. Add snapshot round-trip fixture:
- Persist quote/bom JSON in DB-shaped payload
- Rehydrate and compare regenerated PDF input payload parity

## Conclusion
No unresolved parity gaps that currently block Phase 10 completion criteria for this migration slice.
