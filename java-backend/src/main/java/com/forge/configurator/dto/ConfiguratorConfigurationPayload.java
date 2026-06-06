package com.forge.configurator.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ConfiguratorConfigurationPayload(
        String code,
        String name,
        String description,
        @JsonProperty("project_id") @JsonAlias("projectId") UUID projectId,
        @JsonProperty("config_data") @JsonAlias("configData") Map<String, Object> configData,
        @JsonProperty("active_step") @JsonAlias("activeStep") String activeStep,
        @JsonProperty("progress_pct") @JsonAlias("progressPct") Integer progressPct,
        @JsonProperty("is_template") @JsonAlias("isTemplate") Boolean isTemplate,
        @JsonProperty("is_draft") @JsonAlias("isDraft") Boolean isDraft
) {
}
