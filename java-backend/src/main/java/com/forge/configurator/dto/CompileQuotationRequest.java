package com.forge.configurator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;
import java.util.UUID;

public record CompileQuotationRequest(
        @JsonProperty("configuration_id") UUID configurationId,
        Map<String, Object> overrides,
        @JsonProperty("generate_pdf") Boolean generatePdf,
        String customer
) {
}
