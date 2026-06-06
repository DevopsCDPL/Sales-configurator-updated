package com.forge.configurator.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ConfiguratorDtoSerializationParityTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void componentPayloadAcceptsSnakeCaseAndCamelCase() throws Exception {
        String snakeCase = """
                {
                  "part_number": "CB-400A",
                  "component_type": "breaker",
                  "material_cost": 200.25,
                  "is_active": true,
                  "image_url": "https://img/1.png",
                  "specifications": {"k":"v"}
                }
                """;

        String camelCase = """
                {
                  "partNumber": "CB-400A",
                  "componentType": "breaker",
                  "materialCost": 200.25,
                  "isActive": true,
                  "imageUrl": "https://img/1.png",
                  "specifications": {"k":"v"}
                }
                """;

        ConfiguratorComponentPayload snake = MAPPER.readValue(snakeCase, ConfiguratorComponentPayload.class);
        ConfiguratorComponentPayload camel = MAPPER.readValue(camelCase, ConfiguratorComponentPayload.class);

        assertEquals(snake.partNumber(), camel.partNumber());
        assertEquals(snake.componentType(), camel.componentType());
        assertEquals(snake.materialCost(), camel.materialCost());
        assertEquals(snake.isActive(), camel.isActive());
        assertEquals(snake.imageUrl(), camel.imageUrl());
        assertEquals(snake.specifications(), camel.specifications());
    }

    @Test
    void configurationPayloadAcceptsSnakeCaseAndCamelCase() throws Exception {
        UUID projectId = UUID.randomUUID();

        String snakeCase = """
                {
                  "project_id": "%s",
                  "config_data": {"a":1},
                  "active_step": "controls",
                  "progress_pct": 42,
                  "is_template": false,
                  "is_draft": true
                }
                """.formatted(projectId);

        String camelCase = """
                {
                  "projectId": "%s",
                  "configData": {"a":1},
                  "activeStep": "controls",
                  "progressPct": 42,
                  "isTemplate": false,
                  "isDraft": true
                }
                """.formatted(projectId);

        ConfiguratorConfigurationPayload snake = MAPPER.readValue(snakeCase, ConfiguratorConfigurationPayload.class);
        ConfiguratorConfigurationPayload camel = MAPPER.readValue(camelCase, ConfiguratorConfigurationPayload.class);

        assertEquals(snake.projectId(), camel.projectId());
        assertEquals(snake.configData(), camel.configData());
        assertEquals(snake.activeStep(), camel.activeStep());
        assertEquals(snake.progressPct(), camel.progressPct());
        assertEquals(snake.isTemplate(), camel.isTemplate());
        assertEquals(snake.isDraft(), camel.isDraft());
    }

    @Test
    void componentPayloadSerializesExpectedSnakeCaseKeys() {
        ConfiguratorComponentPayload payload = new ConfiguratorComponentPayload(
                "CB-400A",
                "Breaker",
                "CIRCUIT BREAKER",
                null,
                null,
                "breaker",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                Map.of("k", "v"),
                "https://img/1.png",
                null,
                null,
                true
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> raw = MAPPER.convertValue(payload, Map.class);
        assertNotNull(raw.get("part_number"));
        assertNotNull(raw.get("component_type"));
        assertNotNull(raw.get("is_active"));
        assertNotNull(raw.get("image_url"));
    }
}
