# Tenant Isolation Validation Report

## Tenant Model
- Tenant scope derived from `TenantContext` + authenticated user role.
- Platform admin behavior supports active company override.
- Main/admin/user scopes map to company-bound record access.

## Enforcement Points
- Project/client/vendor/document/file-manager reads and writes scoped by resolved company.
- Recycle bin restore operations validate company ownership where applicable.
- R2 operations enforce company-prefix ownership.

## Automated Validation
- `OperationAccessPolicyTenantScopeTest` verifies:
  - platform admin with active tenant scope,
  - platform admin without active tenant,
  - fallback to user company for non-platform roles.

## Status
- Tenant scope logic validated in unit tests and compile checks.
