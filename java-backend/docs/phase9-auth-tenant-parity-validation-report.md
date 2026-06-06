# Phase 9 Auth + Tenant Parity Validation Report

## Scope
This report validates strict parity migration for Node auth + tenant infrastructure behavior into `java-backend`.

Validated areas:
- JWT auth behavior and unauthorized handling parity
- Session revocation enforcement (`token_hash` lookup)
- Refresh-token cookie parity behavior
- Platform-admin tenant override header behavior (`x-active-company-id`)
- Configurator quotation/configuration tenant ownership enforcement

## Implemented Parity Changes
- `JwtAuthenticationFilter` now returns Node-parity JSON error messages for:
  - invalid token
  - expired token
  - revoked/expired session hash lookup miss
  - inactive/missing user
- Public auth endpoints are excluded from JWT bearer parsing to match Node middleware routing semantics.
- `SecurityConfig` now returns JSON for unauthenticated and access-denied responses.
- `AuthController` refresh-cookie behavior now matches Node:
  - `secure=true` and `SameSite=None` in production (`NODE_ENV=production`)
  - `secure=false` and `SameSite=Lax` otherwise
  - unauthorized refresh clears cookie (`Max-Age=0`)
- `AuthService` parity branches added:
  - configured admin self-heal account creation/update on login
  - forced unlock/reactivation/restore paths for configured admin credentials
  - configured admin password hash resync path
  - same-company admin fallback in contact-admin resolution
- `TenantContextFilter` error text aligned with Node contracts.

## Validation Evidence
Test command:
- `mvn -q test`

Execution result:
- exit code: `0`

New integration tests executed and passing:
- `AuthSecurityIntegrationTest`
- `TenantContextIntegrationTest`
- `ConfiguratorTenantIsolationIntegrationTest`

## Notes
- Java parity currently covers migrated Java modules (`auth`, `configurator`, shared security/tenant layers).
- Legacy Node modules not yet migrated to Java (project/document module endpoints) are out-of-scope for executable Java tests in this phase.
