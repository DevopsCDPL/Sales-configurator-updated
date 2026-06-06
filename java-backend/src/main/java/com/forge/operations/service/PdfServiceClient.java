package com.forge.operations.service;

import com.forge.shared.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * HTTP client for the pdf-service microservice.
 * The pdf-service generates PDFs, uploads them to R2, and returns the R2 key.
 */
@Service
public class PdfServiceClient {

    private static final Logger log = LoggerFactory.getLogger(PdfServiceClient.class);

    private final RestTemplate restTemplate;
    private final String pdfServiceUrl;
    private final String pdfServiceSecret;

    public PdfServiceClient(
            @Value("${app.pdf-service.url:http://localhost:3100}") String pdfServiceUrl,
            @Value("${app.pdf-service.secret:}") String pdfServiceSecret
    ) {
        this.pdfServiceUrl    = pdfServiceUrl;
        this.pdfServiceSecret = pdfServiceSecret;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(60_000);
        this.restTemplate = new RestTemplate(factory);
    }

    /**
     * Send a PDF generation request to the pdf-service.
     *
     * @param payload the full request payload (must include "type" field)
     * @return response data map: { r2_url, file_name, file_path, size }
     * @throws ApiException on non-2xx responses or connection errors
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> generatePdf(Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (pdfServiceSecret != null && !pdfServiceSecret.isBlank()) {
            headers.set("X-PDF-Service-Secret", pdfServiceSecret);
        }

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
        String url = pdfServiceUrl + "/api/pdf/generate";

        try {
            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url,
                    HttpMethod.POST,
                    entity,
                    new ParameterizedTypeReference<>() {}
            );

            Map<String, Object> body = response.getBody();
            if (body == null) {
                throw new ApiException(
                        org.springframework.http.HttpStatus.BAD_GATEWAY,
                        "pdf-service returned empty response"
                );
            }

            Boolean success = (Boolean) body.get("success");
            if (Boolean.FALSE.equals(success)) {
                String error = (String) body.getOrDefault("error", "Unknown pdf-service error");
                throw new ApiException(org.springframework.http.HttpStatus.BAD_GATEWAY, error);
            }

            Object data = body.get("data");
            if (!(data instanceof Map)) {
                throw new ApiException(
                        org.springframework.http.HttpStatus.BAD_GATEWAY,
                        "pdf-service response missing 'data' field"
                );
            }

            log.info("pdf-service generated PDF: type={}", payload.get("type"));
            return (Map<String, Object>) data;

        } catch (RestClientException e) {
            log.error("pdf-service request failed: {}", e.getMessage());
            throw new ApiException(
                    org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                    "PDF service unavailable: " + e.getMessage()
            );
        }
    }
}
