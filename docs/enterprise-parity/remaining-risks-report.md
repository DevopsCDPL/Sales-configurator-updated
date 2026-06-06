# Remaining Risks Report

## Risk 1: Runtime Behavior Drift in Rare Payload Shapes
- Service/controller parity covers mainstream payloads.
- Rare payload permutations from legacy clients may still expose shape drift.
- Mitigation: run Node-vs-Java fixture replay and add failing cases as tests.

## Risk 2: Storage Key Convention Edge Cases
- R2 key normalization supports current patterns.
- Legacy or manually-inserted paths may still miss fallback in uncommon cases.
- Mitigation: add regression fixtures for historical key patterns.

## Risk 3: Authorization Nuance for Custom Roles
- Core role checks are mapped.
- Some custom-module permission combinations may need additional role matrix tests.
- Mitigation: add permission matrix tests per endpoint and module.

## Risk 4: Hard-Delete Referential Integrity
- Permanent delete can fail when DB constraints require pre-delete child cleanup.
- Mitigation: implement module-specific cascade handlers where required by production data.

## Risk 5: Performance of File Counts and Enrichment
- Some parity queries are intentionally straightforward and may be less efficient under high volume.
- Mitigation: optimize with aggregate queries and targeted projections after parity acceptance.
