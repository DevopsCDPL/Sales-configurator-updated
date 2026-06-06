# Project Workflow Parity Report

## Route Parity
- `/api/projects/workflow`
- `/api/projects/next-quotation-number`
- `/api/projects/next-project-number`
- `/api/projects` (list/create)
- `/api/projects/{id}` (get/update/delete)
- `/api/projects/{id}/status`
- `/api/projects/{id}/advance-workflow`
- `/api/projects/{id}/copy`
- `/api/projects/{id}/select-revision`
- `/api/projects/{id}/traveler-type`
- `/api/projects/{id}/analytics`
- `/api/projects/{id}/commission`

## Behavior Parity
- Forward workflow progression and status transition guards implemented.
- Numbering preview and generation implemented with company scope.
- Copy/revision/traveler-type semantics implemented.
- Soft-delete to recycle bin implemented.
- Analytics persistence and commission response contract implemented.

## Validation
- Route contract coverage: `EnterpriseModuleRouteContractTest`.
- Build and compile validation completed.
