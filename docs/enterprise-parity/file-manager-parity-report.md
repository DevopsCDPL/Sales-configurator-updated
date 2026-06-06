# File Manager Parity Report

## Route Parity
- Tree/browse: `/api/file-manager/tree`, `/api/file-manager/browse`
- R2 endpoints: `/api/file-manager/r2/*`
- Folder APIs: `/api/file-manager/folders/by-path`, `/api/file-manager/folders/{id}`
- Documents APIs: `/api/file-manager/documents`, `/api/file-manager/documents/{id}/status`, `/download`, `/view`, `DELETE`
- Utility APIs: `/api/file-manager/projects`, `/parts`, `/inventory`, `/upload`, `/ensure-project-folders`, `/ensure-procurement-folders`, `/view-by-path`

## Behavior Parity
- Folder bootstrap and project/procurement folder ensure implemented.
- File upload path standardization and folder assignment implemented.
- Local-first file reads with R2 fallback implemented.
- R2 listing/view/download/delete/signed-url operations implemented with company ownership checks.

## Tenant Controls
- Company scope from tenant context enforced in list/folder/document reads.
- R2 key ownership verification rejects cross-company access.

## Validation
- Route contract test pass.
- Compile pass.
