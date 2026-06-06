# Phase 10 Transaction Consistency Analysis

Date: 2026-05-18

## Scope
Assess consistency behavior of configurator quotation compile/persist/regenerate flows after parity changes.

## Compile and Persist Flow
Method:
- `ConfiguratorQuotationService.compileAndPersistQuotation(...)`

Transactional behavior:
- Annotated `@Transactional`.
- Deletes prior BOM/labour rows for configuration.
- Inserts newly computed BOM rows and labour rows.
- Persists quotation header and quotation items.
- Optional PDF generation is attempted after quotation persistence.

Consistency characteristics:
1. Core quotation data is transactionally persisted as a single unit.
2. PDF generation failure is intentionally non-fatal in compile flow (caught and ignored) to preserve quotation persistence.
3. This matches expected behavior where document generation is auxiliary and not allowed to roll back valid quotation data.

## Regenerate PDF Flow
Method:
- `ConfiguratorQuotationService.regenerateQuotationPdf(...)`

Transactional behavior:
- Annotated `@Transactional`.
- Uses persisted snapshot (`bom_spec` + `pricing_spec`) to build compilation payload.
- Calls PDF generation/store service.
- On success updates quotation `pdfDocumentId`.
- On failure throws `ApiException(500)`.

Consistency characteristics:
1. Regeneration is deterministic against persisted snapshot, not mutable runtime config.
2. PDF linkage updates are atomic with successful regeneration path.
3. Failure path does not mutate quotation linkage state.

## Risk Assessment
Low operational risk for data consistency in current path.

Caveat:
- PDF generation storage side effects may occur before local DB update in extreme failure windows; this is a known cross-resource consistency class (DB + file storage) and is not newly introduced by Phase 10 changes.
