package com.forge.configurator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DrawingGenerationService {
    private static final Set<String> ALLOWED_BREAKERS = Set.of("ABB", "SCHNEIDER", "SIEMENS");

    private final String baseUrl;
    private final Duration timeout;
    private final HttpClient client;
    private final ObjectMapper objectMapper;

    public DrawingGenerationService(@Value("${app.drawing.solidworks-api-url:http://localhost:5100}") String baseUrl,
                                    @Value("${app.drawing.timeout-seconds:30}") long timeoutSeconds,
                                    ObjectMapper objectMapper) {
        this.baseUrl = baseUrl;
        this.timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
        this.client = HttpClient.newBuilder().connectTimeout(this.timeout).build();
        this.objectMapper = objectMapper;
    }

    public DrawingResponse health() {
        return request("GET", "/api/health", null);
    }

    public DrawingResponse listJobs() {
        return request("GET", "/Drawings/jobs", null);
    }

    public DrawingResponse getJob(String jobId) {
        return request("GET", "/Drawings/jobs/" + encode(jobId), null);
    }

    public DrawingResponse listJobFiles(String jobId) {
        return request("GET", "/Drawings/jobs/" + encode(jobId) + "/files", null);
    }

    public DrawingResponse downloadJobFile(String jobId, String filename) {
        String path = "/Drawings/jobs/" + encode(jobId) + "/download?file=" + encode(filename);
        return request("GET", path, null);
    }

    public DrawingResponse createDrawing(String folderName, Integer panelCount, String circuitBreakerBrand) {
        if (folderName == null || folderName.isBlank() || folderName.length() > 200) {
            return DrawingResponse.error(422, "folderName must be 1..200 chars");
        }
        if (panelCount == null || panelCount < 1 || panelCount > 20) {
            return DrawingResponse.error(422, "panelCount must be an integer 1..20");
        }

        String brand = circuitBreakerBrand == null ? "" : circuitBreakerBrand.toUpperCase();
        if (!ALLOWED_BREAKERS.contains(brand)) {
            return DrawingResponse.error(422, "circuitBreakerBrand must be one of ABB, SCHNEIDER, SIEMENS");
        }

        return request("POST", "/Drawings/create", Map.of(
                "folderName", folderName,
                "panelCount", panelCount,
                "circuitBreakerBrand", brand
        ));
    }

    private DrawingResponse request(String method, String path, Map<String, Object> jsonBody) {
        try {
            String normalizedBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(normalizedBase + path))
                    .timeout(timeout)
                    .header("Accept", "application/json")
                    .header("ngrok-skip-browser-warning", "true");

            if (jsonBody != null) {
                String body = objectMapper.writeValueAsString(jsonBody);
                builder.header("Content-Type", "application/json");
                builder.method(method, HttpRequest.BodyPublishers.ofString(body));
            } else {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            }

            HttpResponse<byte[]> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
            int status = response.statusCode();
            String contentType = response.headers().firstValue("content-type").orElse("application/octet-stream");
            byte[] body = response.body() == null ? new byte[0] : response.body();

            if (contentType.contains("application/json")) {
                Map<String, Object> json = body.length == 0
                    ? Map.of()
                    : readJsonMap(body);
                return new DrawingResponse(status < 400, status, false, null, json, null, contentType);
            }
            if (contentType.startsWith("text/")) {
                String text = new String(body, StandardCharsets.UTF_8);
                return new DrawingResponse(status < 400, status, false, null, text, null, contentType);
            }
            return new DrawingResponse(status < 400, status, false, null, null, body, contentType);
        } catch (Exception ex) {
            return new DrawingResponse(false, 503, true,
                    ex.getClass().getSimpleName().equals("HttpTimeoutException")
                            ? "SolidWorks API timed out"
                            : "SolidWorks API unreachable: " + ex.getMessage(),
                    null,
                    null,
                    "application/json");
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJsonMap(byte[] body) throws java.io.IOException {
        return objectMapper.readValue(body, Map.class);
    }

    public record DrawingResponse(boolean ok,
                                  int status,
                                  boolean fallback,
                                  String error,
                                  Object body,
                                  byte[] bytes,
                                  String contentType) {
        public static DrawingResponse error(int status, String message) {
            return new DrawingResponse(false, status, false, message, null, null, "application/json");
        }
    }

    public List<String> allowedBreakers() {
        return List.copyOf(ALLOWED_BREAKERS);
    }
}
