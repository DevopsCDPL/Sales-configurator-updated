package com.forge.parity.api;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.forge.auth.api.AuthController;
import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.auth.service.AuthService;
import com.forge.configurator.api.ConfiguratorController;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@WebMvcTest(controllers = {AuthController.class, ConfiguratorController.class})
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        TenantContextFilter.class,
        JwtService.class,
})
@TestPropertySource(properties = {
        "app.security.jwt-secret=test-jwt-secret-for-api-runtime-parity-fixtures-123456",
        "app.security.access-token-expiry=1h",
        "app.security.refresh-token-days=30",
        "NODE_ENV=development",
})
class ApiRuntimeParityFixtureComparisonTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private AuthService authService;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private SessionRepository sessionRepository;

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

    @Test
    void javaResponsesMatchNodeParityFixtureCases() throws Exception {
        when(authService.resolveContactAdmin("user@forge.test")).thenReturn("admin@forge.test");

        List<Map<String, Object>> fixtures = loadCases();
        for (Map<String, Object> fixture : fixtures) {
            runCase(fixture);
        }
    }

    private void runCase(Map<String, Object> fixture) throws Exception {
        String name = String.valueOf(fixture.get("name"));
        String method = String.valueOf(fixture.get("method"));
        String path = String.valueOf(fixture.get("path"));
        String auth = String.valueOf(fixture.getOrDefault("auth", "none"));

        MockHttpServletRequestBuilder request = buildRequest(method, path, fixture.get("body"));
        if ("user".equalsIgnoreCase(auth)) {
            request = withUserAuth(request);
        }

        MockHttpServletResponse response = mockMvc.perform(request).andReturn().getResponse();

        int expectedStatus = ((Number) fixture.get("expectedStatus")).intValue();
        assertEquals(expectedStatus, response.getStatus(), "Status mismatch for case: " + name);

        JsonNode expectedBody = objectMapper.valueToTree(fixture.get("expectedBody"));
        JsonNode actualBody = objectMapper.readTree(response.getContentAsString());
        assertEquals(expectedBody, actualBody, "Payload mismatch for case: " + name);
    }

    private MockHttpServletRequestBuilder buildRequest(String method, String path, Object body) throws Exception {
        MockHttpServletRequestBuilder builder;
        if ("POST".equalsIgnoreCase(method)) {
            builder = post(path).contentType(MediaType.APPLICATION_JSON);
            if (body != null) {
                builder.content(objectMapper.writeValueAsString(body));
            } else {
                builder.content("{}");
            }
            return builder;
        }

        if ("GET".equalsIgnoreCase(method)) {
            return get(path);
        }

        throw new IllegalArgumentException("Unsupported method in fixture: " + method);
    }

    private MockHttpServletRequestBuilder withUserAuth(MockHttpServletRequestBuilder builder) {
        UUID userId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        UserEntity user = new UserEntity();
        user.setId(userId);
        user.setName("Fixture User");
        user.setEmail("fixture.user@forge.test");
        user.setRole("user");
        user.setCompanyId(companyId);
        user.setCompanyName("Fixture Co");
        user.setIsActive(true);
        user.setModulePermissions(Map.of());

        SessionEntity session = new SessionEntity();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setTokenHash(sha256(token));
        session.setIsActive(true);
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        session.setCreatedAt(Instant.now());
        session.setUpdatedAt(Instant.now());

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token))).thenReturn(Optional.of(session));
        when(sessionRepository.save(any(SessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        return builder.header("Authorization", "Bearer " + token);
    }

    private List<Map<String, Object>> loadCases() throws Exception {
        try (var stream = Thread.currentThread().getContextClassLoader()
                .getResourceAsStream("api-parity/runtime-node-java-cases.json")) {
            if (stream == null) {
                throw new IllegalStateException("Missing runtime parity fixture file");
            }
            return objectMapper.readValue(stream, new TypeReference<>() {
            });
        }
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
