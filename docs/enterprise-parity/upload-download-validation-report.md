# Upload/Download Validation Report

## Upload Path
- Project and generic file-manager uploads are accepted as multipart.
- Files are written to local storage with normalized relative paths.
- Metadata persisted in `documents` table with module/document context.
- Optional R2 upload enabled when configured.

## Download/View Path
- Local file retrieval is primary strategy.
- If local file is missing, R2 fallback retrieval is attempted.
- Successful R2 fetch can backfill local storage for future reads.
- Content type and inline/attachment headers are returned according to route.

## Validation
- `DocumentLifecycleServiceTest` verifies upload persistence + local read retrieval.
- Compile pass confirms endpoint/service wiring.

## Notes
- Full end-to-end runtime comparison against Node storage backends is tracked as a remaining gap.
