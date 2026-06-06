package com.forge.configurator.engine;

import com.forge.configurator.entity.ConfiguratorComponentEntity;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BomAndLabourEngineParityTest {

    @Test
    void expandConfigHydratesCatalogRowsAndStringEncodedDecimals() {
        BomEngine engine = new BomEngine();

        UUID componentId = UUID.randomUUID();
        ConfiguratorComponentEntity component = new ConfiguratorComponentEntity();
        component.setId(componentId);
        component.setPartNumber("PN-001");
        component.setName("Breaker");
        component.setCategory("CIRCUIT BREAKER");
        component.setPrice(new BigDecimal("250.50"));
        component.setMaterialCost(new BigDecimal("200.25"));
        component.setLaborCost(new BigDecimal("50.25"));
        component.setLbrCu(new BigDecimal("0.25"));
        component.setLbrAsm(new BigDecimal("0.75"));

        BomEngine.Catalog catalog = new BomEngine.Catalog(
                Map.of(componentId, component),
                Map.of("PN-001", component)
        );

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("component_id", componentId.toString());
        row.put("quantity", 2);

        Map<String, Object> step = new LinkedHashMap<>();
        step.put("selected_components", List.of(row));

        Map<String, Object> config = new LinkedHashMap<>();
        config.put("enclosure", step);

        BomEngine.ExpansionResult result = engine.expandConfig(config, catalog);

        assertEquals(1, result.rows().size());
        BomEngine.BomRow bomRow = result.rows().getFirst();
        assertEquals(componentId, bomRow.componentId());
        assertEquals("PN-001", bomRow.partNumber());
        assertEquals(2.0, bomRow.quantity(), 1e-9);
        assertEquals(250.50, bomRow.unitCost(), 1e-9);
        assertEquals(501.0, bomRow.totalCost(), 1e-9);
        assertEquals(200.25, bomRow.unitMaterialCost(), 1e-9);
        assertEquals(0.25, bomRow.lbrCu(), 1e-9);
        assertEquals(0.75, bomRow.lbrAsm(), 1e-9);

        assertEquals(400.5, result.totals().get("material_total"), 1e-9);
        assertEquals(501.0, result.totals().get("unit_cost_total"), 1e-9);
    }

    @Test
    void sectionsFromBomRowsAndLabourSummaryMatchLegacyAggregation() {
        BomEngine bomEngine = new BomEngine();
        LabourEngine labourEngine = new LabourEngine();

        BomEngine.BomRow row1 = new BomEngine.BomRow(
                UUID.randomUUID(),
                "A",
                "A",
                "A",
                "CAT",
                "TYPE",
                2.0,
                "ea",
                100.0,
                200.0,
                80.0,
                20.0,
                1.0,
                0.5,
                0,
                0,
                0,
                0,
                0,
                3.0,
                "enclosure",
                1,
                Map.of()
        );

        BomEngine.BomRow row2 = new BomEngine.BomRow(
                UUID.randomUUID(),
                "B",
                "B",
                "B",
                "CAT",
                "TYPE",
                1.0,
                "ea",
                50.0,
                50.0,
                40.0,
                10.0,
                0.25,
                0.25,
                0,
                0,
                0,
                0,
                0,
                2.0,
                "controls",
                1,
                Map.of()
        );

        List<BomEngine.BomRow> rows = List.of(row1, row2);

        List<PricingEngine.SectionInput> sections = bomEngine.sectionsFromBomRows(rows);
        assertEquals(1, sections.size());

        PricingEngine.SectionInput section = sections.getFirst();
        assertEquals("1", section.id());
        assertEquals(200.0, section.unitMaterialCost(), 1e-9); // 80*2 + 40*1
        assertEquals(8.0, section.copperWeightPerUnit(), 1e-9); // 3*2 + 2*1
        assertEquals(2.25, section.laborHoursPerUnit().get("CU"), 1e-9); // 1*2 + 0.25*1
        assertEquals(1.25, section.laborHoursPerUnit().get("ASM"), 1e-9); // 0.5*2 + 0.25*1

        Map<String, Double> lookup = new LinkedHashMap<>();
        lookup.put("LBR_CU_rate", 100.0);
        lookup.put("LBR_ASM_rate", 50.0);
        lookup.put("LBR_CNT_rate", 0.0);
        lookup.put("LBR_QC_rate", 0.0);
        lookup.put("LBR_TST_rate", 0.0);
        lookup.put("LBR_ENG_rate", 0.0);
        lookup.put("LBR_CAD_rate", 0.0);

        LabourEngine.LabourSummary labour = labourEngine.computeLabour(rows, lookup);
        assertEquals(2.25, labour.hours().get("CU"), 1e-9);
        assertEquals(1.25, labour.hours().get("ASM"), 1e-9);
        assertEquals(225.0, labour.costs().get("CU"), 1e-9);
        assertEquals(62.5, labour.costs().get("ASM"), 1e-9);
        assertEquals(287.5, labour.totals().get("cost_total"), 1e-9);
        assertEquals(3.5, labour.totals().get("hours_total"), 1e-9);
    }
}
