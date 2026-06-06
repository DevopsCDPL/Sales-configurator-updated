# Phase 9 Unresolved Security Risks Inventory

## Status
This inventory lists security-relevant items that remain open after Phase 9 parity implementation.

## Open Risks
1. **Thread-local tenant context is not cross-thread by default**
- Severity: High (future async risk)
- Detail: `TenantContext` uses `ThreadLocal`; if background executors or `@Async` are introduced, tenant scope will not propagate automatically.
- Mitigation: Introduce explicit context propagation wrappers/decorators for async executors.

2. **No DB-level RLS enforcement equivalent in Java layer**
- Severity: High
- Detail: Node stack includes DB session variable + RLS posture; Java migration currently enforces tenant isolation at filter/controller/repository levels.
- Mitigation: Add PostgreSQL RLS + session-variable enforcement in Java datasource lifecycle or strict DB policies.

3. **Configured admin recovery path depends on environment hardening**
- Severity: Medium
- Detail: Node-parity recovery behavior uses `ADMIN_EMAIL`/`ADMIN_PASSWORD`. If defaults remain in production, recovery path increases credential risk.
- Mitigation: Require strong non-default secrets and enforce startup validation for production deployments.

4. **2FA OTP delivery parity not fully implemented in Java service**
- Severity: Medium
- Detail: Java keeps OTP generation/verification flow but does not yet send OTP email in this phase.
- Mitigation: Integrate audited email sender with delivery failure monitoring.

5. **Auth endpoint rate limiting parity not present in Java**
- Severity: Medium
- Detail: Node protects login/refresh/contact-admin with rate limit middleware; Java endpoints currently do not enforce equivalent throttling.
- Mitigation: Add per-IP and per-account throttling on auth endpoints.

## Residual Risk Summary
- Tenant isolation and auth/session checks are functionally validated for migrated modules.
- The largest residual risks are infrastructure-level safeguards (RLS) and future async propagation behavior.
