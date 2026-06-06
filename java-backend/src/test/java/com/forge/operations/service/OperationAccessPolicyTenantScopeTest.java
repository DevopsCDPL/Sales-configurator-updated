package com.forge.operations.service;

import com.forge.shared.security.AuthenticatedUser;
import com.forge.shared.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class OperationAccessPolicyTenantScopeTest {
    private final OperationAccessPolicy policy = new OperationAccessPolicy();

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void resolveCompanyScopeUsesActiveTenantForPlatformAdmin() {
        UUID activeCompanyId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "platform@forge.test", "platform_admin", null, null, Map.of());

        TenantContext.set(new TenantContext.State(activeCompanyId, true, activeCompanyId));

        assertEquals(activeCompanyId, policy.resolveCompanyScope(user));
    }

    @Test
    void resolveCompanyScopeReturnsNullWhenPlatformAdminHasNoActiveTenant() {
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "platform@forge.test", "platform_admin", null, null, Map.of());

        TenantContext.set(new TenantContext.State(null, true, null));

        assertNull(policy.resolveCompanyScope(user));
    }

    @Test
    void resolveCompanyScopeFallsBackToUserCompanyForNonPlatformRoles() {
        UUID companyId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "admin@forge.test", "admin", companyId, "Forge", Map.of());

        assertEquals(companyId, policy.resolveCompanyScope(user));
    }
}
