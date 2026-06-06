# Phase 11 Unresolved API Compatibility Gaps

Date: 2026-05-18

## Summary
No blocking parity gaps were found for the implemented auth/configurator parity scope. Remaining items are non-blocking verification-depth gaps.

## Open Gaps
1. Live Node runtime coverage breadth
- Severity: Medium
- Current state: direct Node-vs-Java runtime comparison is available but optional and currently covers health endpoint when LEGACY_NODE_BASE_URL is provided.
- Impact: fixture parity remains deterministic baseline, but does not prove every endpoint against a running legacy process in CI.

2. Fixture corpus size
- Severity: Low
- Current state: runtime fixture file covers key auth/validation/configurator parity cases but not every edge branch.
- Impact: additional cases could improve confidence for rarely used input combinations.

3. External side-effect endpoint equivalence
- Severity: Low
- Current state: endpoints involving integrations (for example, file or external delivery side effects) are validated by contract tests, not full legacy side-effect replay.
- Impact: behavior parity for side effects is inferred from contract and lifecycle tests rather than end-to-end dual execution.

## Recommended Follow-up
- Expand runtime fixture set with additional auth error branches and configurator alias edge cases.
- Enable LEGACY_NODE_BASE_URL in a nightly parity job to execute live side-by-side comparison routinely.

## Decision
Overall migration parity decision remains PASS with the above non-blocking gaps tracked.
