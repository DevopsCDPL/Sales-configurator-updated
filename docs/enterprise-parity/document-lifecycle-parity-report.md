# Document Lifecycle Parity Report

## Route Parity
- `/api/documents/project/{projectId}`
- `/api/documents/{id}`
- `/api/documents/{id}/view`
- `/api/documents/{id}/download`
- `/api/documents/project/{projectId}/quotation`
- `/api/documents/project/{projectId}/work-order`
- `/api/documents/project/{projectId}/traveller`
- `/api/documents/project/{projectId}/coc`
- `/api/documents/project/{projectId}/packing-list`
- `/api/documents/project/{projectId}/upload`
- `/api/documents/{id}/finalize`
- `/api/documents/merge`
- `/api/documents/{id}` (delete)

## Lifecycle Coverage
- Generated documents: persisted, versioned, foldered, optionally pushed to R2.
- Uploaded documents: persisted with metadata, version update and status updates.
- Read/view/download: local read with R2 fallback and cache-back to local storage.
- Merge: PDF merge, skip unsupported files, expose merge stats headers.
- Delete: local + R2 best-effort cleanup with DB record removal.

## Validation
- `DocumentLifecycleServiceTest`: upload/versioning, local read path, merge behavior all passing.
- Compile pass.
