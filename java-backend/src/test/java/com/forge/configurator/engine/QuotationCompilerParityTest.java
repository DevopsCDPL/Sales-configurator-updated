package com.forge.configurator.engine;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuotationCompilerParityTest {

    @Test
    void normalizeConfigurationDataMapsStepLinesToSelectedComponents() {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("componentId", "11111111-1111-1111-1111-111111111111");
        line.put("partNumber", "PN-TEST");
        line.put("name", "Test Component");
        line.put("unitPrice", 12.5);
        line.put("quantity", 3);

        Map<String, Object> stepLines = new LinkedHashMap<>();
        stepLines.put("enclosure", List.of(line));

        Map<String, Object> configData = new LinkedHashMap<>();
        configData.put("stepLines", stepLines);

        Map<String, Object> normalized = QuotationCompiler.normalizeConfigurationData(configData);
        assertTrue(normalized.containsKey("enclosure"));

        @SuppressWarnings("unchecked")
        Map<String, Object> step = (Map<String, Object>) normalized.get("enclosure");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> selected = (List<Map<String, Object>>) step.get("selected_components");

        assertNotNull(selected);
        assertEquals(1, selected.size());
        assertEquals("11111111-1111-1111-1111-111111111111", selected.getFirst().get("component_id"));
        assertEquals("PN-TEST", selected.getFirst().get("part_number"));
        assertEquals(12.5, ((Number) selected.getFirst().get("unit_cost")).doubleValue(), 1e-9);
        assertEquals(3.0, ((Number) selected.getFirst().get("quantity")).doubleValue(), 1e-9);
    }

    @Test
    void compileQuotationIncludesLineAddersAndProducesTotals() {
        QuotationCompiler compiler = new QuotationCompiler(new BomEngine(), new PricingEngine(), new LabourEngine());

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("name", "Manual Item");
        row.put("part_number", "MAN-1");
        row.put("quantity", 1);
        row.put("unit_cost", 100.0);
        row.put("unit_material_cost", 100.0);
        row.put("lbr_cu", 1.0);
        row.put("section_number", 0);

        Map<String, Object> step = new LinkedHashMap<>();
        step.put("bom_rows", List.of(row));

        Map<String, Object> configData = new LinkedHashMap<>();
        configData.put("plus_comp", step);

        Map<String, Double> lookup = new LinkedHashMap<>();
        lookup.put("LBR_CU_rate", 100.0);
        lookup.put("LBR_ASM_rate", 0.0);
        lookup.put("LBR_CNT_rate", 0.0);
        lookup.put("LBR_QC_rate", 0.0);
        lookup.put("LBR_TST_rate", 0.0);
        lookup.put("LBR_ENG_rate", 0.0);
        lookup.put("LBR_CAD_rate", 0.0);
        lookup.put("OVERHEAD_PCT", 0.10);
        lookup.put("COPPER_RATE_PER_LB", 0.0);

        QuotationCompiler.CompiledQuotation result = compiler.compileQuotation(
                Map.of("id", "cfg-1"),
                configData,
                new BomEngine.Catalog(Map.of(), Map.of()),
                lookup,
                new PricingEngine.PricingStrategy("DESIRED PRICE", null, 300.0, -1),
                new PricingEngine.ScheduleInput(Instant.parse("2025-01-06T00:00:00Z"), 0, 0, 0, 0, 0, 0),
                List.of(),
                List.of(new QuotationCompiler.LineAdder("0", "Shipping", 25.0)),
                null
        );

        assertEquals(1, result.items().size());
        assertEquals(25.0, result.quote().totalLineAdders(), 1e-9);
        assertFalse(result.quote().addersGrouped().isEmpty());

        // total cost = material(100) + labour(100) + adders(25) + overhead(22.5)
        assertEquals(247.5, result.quote().totalCost(), 1e-9);
        assertEquals(300.0, result.totals().get("target_price"), 1e-9);
        assertEquals(300.0, result.totals().get("rounded_price"), 1e-9);
        assertEquals(52.5, result.totals().get("actual_profit"), 1e-9);
    }
}
