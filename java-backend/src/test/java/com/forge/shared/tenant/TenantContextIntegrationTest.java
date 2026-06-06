package com.forge.shared.tenant;

import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.shared.security.AuthenticatedUser;
import com.forge.shared.security.JwtAuthenticationFilter;
import com.forge.shared.security.JwtService;
import com.forge.shared.security.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = TenantContextIntegrationTest.TenantProbeController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        TenantContextFilter.class,
        JwtService.class,
        TenantContextIntegrationTest.TenantProbeController.class,
})
@TestPropertySource(properties = {
        "app.security.jwt-secret=test-jwt-secret-for-tenant-context-tests-123456",
        "app.security.access-token-expiry=1h",
})
class TenantContextIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private SessionRepository sessionRepository;

    @Test
    void platformAdminWithoutHeaderGetsUnscopedContext() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        mockAuth(token, user(userId, "platform_admin", null, true));

        mockMvc.perform(get("/api/test/tenant-context")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.platformAdmin").value(true))
                .andExpect(jsonPath("$.data.companyId").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void platformAdminWithActiveCompanyHeaderGetsScopedContext() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activeCompanyId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        mockAuth(token, user(userId, "platform_admin", null, true));

        mockMvc.perform(get("/api/test/tenant-context")
                        .header("Authorization", "Bearer " + token)
                        .header("x-active-company-id", activeCompanyId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.platformAdmin").value(false))
                .andExpect(jsonPath("$.data.companyId").value(activeCompanyId.toString()))
                .andExpect(jsonPath("$.data.activeCompanyId").value(activeCompanyId.toString()));
    }

    @Test
    void platformAdminWithInvalidActiveCompanyHeaderReturns400() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        mockAuth(token, user(userId, "platform_admin", null, true));

        mockMvc.perform(get("/api/test/tenant-context")
                        .header("Authorization", "Bearer " + token)
                        .header("x-active-company-id", "not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Invalid x-active-company-id header: must be a valid UUID."));
    }

    @Test
    void nonAdminWithoutCompanyReturns403() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        mockAuth(token, user(userId, "user", null, true));

        mockMvc.perform(get("/api/test/tenant-context")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("No company assigned. Contact your administrator."));
    }

    @Test
    void nonAdminWithCompanyGetsTenantScopedContext() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        mockAuth(token, user(userId, "user", companyId, true));

        mockMvc.perform(get("/api/test/tenant-context")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.platformAdmin").value(false))
                .andExpect(jsonPath("$.data.companyId").value(companyId.toString()))
                .andExpect(jsonPath("$.data.activeCompanyId").value(companyId.toString()));
    }

            @Test
            void tenantContextDoesNotLeakAcrossRequests() throws Exception {
            UUID userId = UUID.randomUUID();
            UUID companyId = UUID.randomUUID();
            String token = jwtService.generateAccessToken(userId);
            mockAuth(token, user(userId, "platform_admin", null, true));

            mockMvc.perform(get("/api/test/tenant-context")
                    .header("Authorization", "Bearer " + token)
                    .header("x-active-company-id", companyId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.companyId").value(companyId.toString()))
                .andExpect(jsonPath("$.data.platformAdmin").value(false));

            mockMvc.perform(get("/api/test/tenant-context")
                    .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.companyId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.platformAdmin").value(true));
            }

    private void mockAuth(String token, UserEntity user) {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token)))
                .thenReturn(Optional.of(activeSession(user.getId(), sha256(token))));
        when(sessionRepository.save(org.mockito.ArgumentMatchers.any(SessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    private UserEntity user(UUID id, String role, UUID companyId, boolean active) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setName("Tenant User");
        user.setEmail("tenant@forge.test");
        user.setRole(role);
        user.setCompanyId(companyId);
        user.setIsActive(active);
        user.setModulePermissions(Map.of());
        return user;
    }

    private SessionEntity activeSession(UUID userId, String tokenHash) {
        SessionEntity session = new SessionEntity();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setTokenHash(tokenHash);
        session.setIsActive(true);
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        session.setCreatedAt(Instant.now());
        session.setUpdatedAt(Instant.now());
        return session;
    }

    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    @RestController
    static class TenantProbeController {
        @GetMapping("/api/test/tenant-context")
        public Map<String, Object> probe(Authentication authentication) {
            AuthenticatedUser user = (AuthenticatedUser) authentication.getPrincipal();
            TenantContext.State state = TenantContext.get();

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("role", user.role());
            data.put("companyId", state == null || state.companyId() == null ? null : state.companyId().toString());
            data.put("activeCompanyId", state == null || state.activeCompanyId() == null ? null : state.activeCompanyId().toString());
            data.put("platformAdmin", state != null && state.platformAdmin());

            return Map.of("success", true, "data", data);
        }
    }
}
