# Unresolved Gaps Report

## Gap 1: Side-by-Side Runtime Diff (Node vs Java)
- Static parity coverage expanded to include HTTP method + path assertions (`EnterpriseModuleHttpMethodParityTest`).
- Remaining gap: live response/status/body diff testing against running Node endpoints has not been executed in this pass.
- Runtime blocker in this pass: `LEGACY_NODE_BASE_URL` is not set, so live Node-vs-Java comparison test assumptions skip execution.

## Gap 2: Broad Integration Coverage
- Added focused unit/contract tests.
- Full integration suite for DB + filesystem + R2 + auth token flows is not yet fully expanded across every enterprise route permutation.

## Gap 3: Procurement/Part/Inventory Enrichment Depth
- File-manager procurement/part/inventory deep enrichment and legacy lazy-backfill behaviors from Node are partially implemented but not fully mirrored in all edge scenarios.

## Gap 4: Main-Admin Hard Delete Cross-Module Cascade
- Recycle-bin permanent deletes are implemented for projects/clients/vendors.
- Complex cross-table cleanup behavior for every legacy module is intentionally not generalized in this phase.
