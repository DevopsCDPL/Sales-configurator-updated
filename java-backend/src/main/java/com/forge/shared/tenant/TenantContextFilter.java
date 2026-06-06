package com.forge.shared.tenant;

import com.forge.shared.security.AuthenticatedUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class TenantContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
                String role = user.role();
                if ("platform_admin".equals(role)) {
                    String activeHeader = request.getHeader("x-active-company-id");
                    UUID activeCompanyId = null;
                    if (activeHeader != null && !activeHeader.isBlank()) {
                        try {
                            activeCompanyId = UUID.fromString(activeHeader.trim());
                        } catch (IllegalArgumentException ex) {
                            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                            response.setContentType("application/json");
                            response.getWriter().write("{\"success\":false,\"message\":\"Invalid x-active-company-id header: must be a valid UUID.\"}");
                            return;
                        }
                    }
                    TenantContext.set(new TenantContext.State(activeCompanyId, activeCompanyId == null, activeCompanyId));
                } else if ("main_admin".equals(role) && user.companyId() == null) {
                    TenantContext.set(new TenantContext.State(null, true, null));
                } else {
                    if (user.companyId() == null) {
                        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"success\":false,\"message\":\"No company assigned. Contact your administrator.\"}");
                        return;
                    }
                    TenantContext.set(new TenantContext.State(user.companyId(), false, user.companyId()));
                }
            }

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }
}
