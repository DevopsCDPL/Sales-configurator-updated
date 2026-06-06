package com.forge.configurator.api;

import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import com.forge.configurator.repository.ConfiguratorComponentCategoryRepository;
import com.forge.configurator.repository.ConfiguratorComponentRepository;
import com.forge.configurator.repository.ConfiguratorConfigurationRepository;
import com.forge.configurator.repository.ConfiguratorQuotationItemRepository;
import com.forge.configurator.repository.ConfiguratorQuotationRepository;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.configurator.service.ConfiguratorQuotationService;
import com.forge.configurator.service.DrawingGenerationService;
import com.forge.configurator.service.MarketDataService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.security.JwtAuthenticationFilter;
import com.forge.shared.security.JwtService;
import com.forge.shared.security.SecurityConfig;
import com.forge.shared.tenant.TenantContextFilter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = ConfiguratorController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        TenantContextFilter.class,
        JwtService.class,
})
@TestPropertySource(properties = {
        "app.security.jwt-secret=test-jwt-secret-for-configurator-tenant-tests-123456",
        "app.security.access-token-expiry=1h",
})
class ConfiguratorTenantIsolationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private ConfiguratorComponentRepository componentRepository;

    @MockBean
    private ConfiguratorComponentCategoryRepository categoryRepository;

    @MockBean
    private ConfiguratorConfigurationRepository configurationRepository;

    @MockBean
    private ConfiguratorQuotationRepository quotationRepository;

    @MockBean
    private ConfiguratorQuotationItemRepository quotationItemRepository;

    @MockBean
    private ConfiguratorQuotationService quotationService;

    @MockBean
    private MarketDataService marketDataService;

    @MockBean
    private DrawingGenerationService drawingGenerationService;

    @MockBean
    private DocumentRepository documentRepository;

    @MockBean
    private R2StorageService r2StorageService;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private SessionRepository sessionRepository;

    @Test
    void companyScopedUserCannotReadOtherTenantQuotation() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyA = UUID.randomUUID();
        UUID quotationId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        mockAuth(token, user(userId, "user", companyA));
        when(quotationRepository.findByIdAndCompanyId(quotationId, companyA)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/configurator/quotations/{id}", quotationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Quotation not found"));
    }

    @Test
    void platformAdminWithActiveCompanyHeaderCanReadScopedQuotation() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyB = UUID.randomUUID();
        UUID quotationId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        mockAuth(token, user(userId, "platform_admin", null));

        ConfiguratorQuotationEntity quotation = new ConfiguratorQuotationEntity();
        quotation.setId(quotationId);
        quotation.setCompanyId(companyB);
        quotation.setStatus("draft");
        quotation.setSold(false);
        quotation.setCreatedAt(Instant.now());

        when(quotationRepository.findByIdAndCompanyId(quotationId, companyB)).thenReturn(Optional.of(quotation));
        when(quotationItemRepository.findByQuotationIdOrderByLineNoAsc(quotationId)).thenReturn(List.of());

        mockMvc.perform(get("/api/configurator/quotations/{id}", quotationId)
                        .header("Authorization", "Bearer " + token)
                        .header("x-active-company-id", companyB.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(quotationId.toString()))
                .andExpect(jsonPath("$.data.company_id").value(companyB.toString()));
    }

    @Test
    void platformAdminWriteWithoutActiveCompanyHeaderIsRejected() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        mockAuth(token, user(userId, "platform_admin", null));

        mockMvc.perform(post("/api/configurator/configurations")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Scoped Config\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Platform admin must provide x-active-company-id for write operations."));
    }

    @Test
    void companyScopedUserCannotReadOtherTenantConfiguration() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyA = UUID.randomUUID();
        UUID configurationId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        mockAuth(token, user(userId, "user", companyA));
        when(configurationRepository.findByIdAndCompanyId(configurationId, companyA)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/configurator/configurations/{id}", configurationId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Configuration not found"));
    }

    private void mockAuth(String token, UserEntity user) {
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token)))
                .thenReturn(Optional.of(activeSession(user.getId(), sha256(token))));
        when(sessionRepository.save(org.mockito.ArgumentMatchers.any(SessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    private UserEntity user(UUID id, String role, UUID companyId) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setName("Tenant User");
        user.setEmail("tenant@forge.test");
        user.setRole(role);
        user.setCompanyId(companyId);
        user.setIsActive(true);
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
}
