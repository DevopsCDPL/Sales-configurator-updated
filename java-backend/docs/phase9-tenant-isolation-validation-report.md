# Phase 9 Tenant Isolation Validation Report

## Isolation Model (Java)
- Authenticated tenant context is established in `TenantContextFilter`.
- Company scope resolution rules:
  - `platform_admin` without header => unscoped (`platformAdmin=true`)
  - `platform_admin` with `x-active-company-id` => scoped to header company
  - `main_admin` without `company_id` => unscoped legacy/platform mode
  - all other users require `company_id`; otherwise request denied
- Configurator read/write endpoints enforce tenant ownership by company-scoped repository lookups (`findByIdAndCompanyId`) or equivalent specification filtering.

## Executed Isolation Tests
### Tenant context and header behavior
- `TenantContextIntegrationTest.platformAdminWithoutHeaderGetsUnscopedContext`
- `TenantContextIntegrationTest.platformAdminWithActiveCompanyHeaderGetsScopedContext`
- `TenantContextIntegrationTest.platformAdminWithInvalidActiveCompanyHeaderReturns400`
- `TenantContextIntegrationTest.nonAdminWithoutCompanyReturns403`
- `TenantContextIntegrationTest.nonAdminWithCompanyGetsTenantScopedContext`

### Cross-tenant ownership denial (Configurator)
- `ConfiguratorTenantIsolationIntegrationTest.companyScopedUserCannotReadOtherTenantQuotation`
- `ConfiguratorTenantIsolationIntegrationTest.companyScopedUserCannotReadOtherTenantConfiguration`
- `ConfiguratorTenantIsolationIntegrationTest.platformAdminWithActiveCompanyHeaderCanReadScopedQuotation`
- `ConfiguratorTenantIsolationIntegrationTest.platformAdminWriteWithoutActiveCompanyHeaderIsRejected`

## Result
- All above tests pass under `mvn -q test`.
- Verified tenant denial behavior for out-of-company configuration/quotation reads.
- Verified platform admin explicit workspace scoping behavior for header-selected tenant.

## Coverage Boundary
- Ownership checks for Java-migrated configurator resources are validated.
- Project/document Java module ownership tests are not executable in this repository phase because those modules are not yet migrated into `java-backend`.
