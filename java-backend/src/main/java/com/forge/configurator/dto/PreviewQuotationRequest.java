package com.forge.configurator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;
import java.util.UUID;

public record PreviewQuotationRequest(
        @JsonProperty("configuration_id") UUID configurationId,
        Map<String, Object> overrides
) {
}
