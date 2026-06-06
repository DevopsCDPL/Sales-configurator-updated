# Phase 10 Remaining Migration Risks

Date: 2026-05-18

## Risk 1: Fixture Coverage Breadth
Level: Medium

Description:
- Current runtime parity is validated on a deterministic representative fixture, not full production permutation space.

Mitigation:
- Add additional fixtures for high-variance combinations (section ordering, heavy adders, sparse fields, high BOM cardinality).

## Risk 2: Node Runtime Dependency in Side-by-Side Test
Level: Low

Description:
- Node parity test is guarded by runtime availability assumption.
- In environments without Node, side-by-side assertion test can be skipped.

Mitigation:
- Ensure CI agent used for parity gate has Node installed.
- Keep pure-Java parity invariants as supplemental checks.

## Risk 3: Cross-Resource Atomicity (DB + PDF storage)
Level: Low

Description:
- PDF generation/store and DB linkage update are separate resources.
- Rare partial side-effect windows are possible in unexpected infra failures.

Mitigation:
- Periodic reconciliation job for unattached generated documents.
- Optional idempotent regeneration endpoint retry policy.

## Risk 4: Numeric/Timestamp Textual Representation Drift
Level: Low

Description:
- Equal numeric/time values may serialize differently as text across runtimes.

Mitigation:
- Compare semantically (numeric tolerance and instant normalization), as done in runtime parity test.

## Overall Risk Posture
Low-to-medium, acceptable for current migration phase with listed mitigations and additional fixture expansion in subsequent hardening pass.
