package com.forge.operations.service;

import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import com.forge.shared.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
public class OperationAccessPolicy {
    private static final Set<String> REAL_ROLES = Set.of(
            "platform_admin",
            "main_admin",
            "admin",
            "user",
            "sales_engineer"
    );

    public AuthenticatedUser requirePrincipal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return principal;
    }

    public UUID resolveCompanyScope(AuthenticatedUser user) {
        TenantContext.State state = TenantContext.get();
        if (state != null) {
            if (state.companyId() != null) {
                return state.companyId();
            }
            if (state.platformAdmin()) {
                return null;
            }
        }
        return user.companyId();
    }

    public UUID resolveWriteCompanyScope(AuthenticatedUser user) {
        UUID companyScope = resolveCompanyScope(user);
        if (companyScope == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Platform admin must provide x-active-company-id for write operations.");
        }
        return companyScope;
    }

    public boolean hasCompanyAccess(UUID recordCompanyId, UUID companyScope) {
        return companyScope == null || Objects.equals(recordCompanyId, companyScope);
    }

    public void requireCompanyAccess(UUID recordCompanyId, UUID companyScope, String deniedMessage) {
        if (!hasCompanyAccess(recordCompanyId, companyScope)) {
            throw new ApiException(HttpStatus.FORBIDDEN, deniedMessage == null ? "Access denied" : deniedMessage);
        }
    }

    public void requireNodeAuthorize(AuthenticatedUser user, String... allowedRolesOrModules) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }

        if ("platform_admin".equals(user.role()) || "main_admin".equals(user.role())) {
            return;
        }

        Set<String> allowed = Set.of(allowedRolesOrModules);
        if (allowed.contains(user.role())) {
            return;
        }

        if (("user".equals(user.role()) || "sales_engineer".equals(user.role())) && hasAllowedModule(user, allowed)) {
            return;
        }

        throw new ApiException(HttpStatus.FORBIDDEN, "You do not have permission to perform this action.");
    }

    public void requireCoAdmin(AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        if (!"main_admin".equals(user.role()) && !"platform_admin".equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "Only Owner, Co-Owner, or Super Admin can access this resource.");
        }
    }

    public void requireMainAdmin(AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        if (!"main_admin".equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only Super Admin can permanently delete records");
        }
    }

    private boolean hasAllowedModule(AuthenticatedUser user, Set<String> allowedRolesOrModules) {
        Map<String, Object> perms = user.modulePermissions();
        if (perms == null || perms.isEmpty()) {
            return false;
        }

        for (String key : allowedRolesOrModules) {
            if (REAL_ROLES.contains(key)) {
                continue;
            }
            Object raw = perms.get(key);
            if (raw instanceof Boolean value && value) {
                return true;
            }
            if (raw != null && "true".equals(String.valueOf(raw).toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }
}
