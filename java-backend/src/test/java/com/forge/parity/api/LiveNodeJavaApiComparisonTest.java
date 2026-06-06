package com.forge.parity.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
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
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@WebMvcTest(controllers = ConfiguratorController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        TenantContextFilter.class,
        JwtService.class,
})
@TestPropertySource(properties = {
        "app.security.jwt-secret=test-jwt-secret-for-live-node-compare-123456",
        "app.security.access-token-expiry=1h",
})
class LiveNodeJavaApiComparisonTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ConfiguratorComponentRepository componentRepository;

        @MockBean
        private UserRepository userRepository;

        @MockBean
        private SessionRepository sessionRepository;

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
    void comparesNodeAndJavaHealthResponsesWhenLegacyBaseUrlProvided() throws Exception {
        String legacyBaseUrl = System.getenv("LEGACY_NODE_BASE_URL");
        Assumptions.assumeTrue(legacyBaseUrl != null && !legacyBaseUrl.isBlank(),
                "Set LEGACY_NODE_BASE_URL to run live Node-vs-Java API comparison.");

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest nodeRequest = HttpRequest.newBuilder()
                .uri(URI.create(legacyBaseUrl.replaceAll("/$", "") + "/api/quotation/health"))
                .GET()
                .build();
        HttpResponse<String> nodeResponse = client.send(nodeRequest, HttpResponse.BodyHandlers.ofString());

        var javaResponse = mockMvc.perform(get("/api/quotation/health")).andReturn().getResponse();

        assertEquals(nodeResponse.statusCode(), javaResponse.getStatus(), "Status mismatch against live Node API");

        JsonNode nodeJson = objectMapper.readTree(nodeResponse.body());
        JsonNode javaJson = objectMapper.readTree(javaResponse.getContentAsString());
        assertEquals(nodeJson, javaJson, "Body mismatch against live Node API");
    }
}
