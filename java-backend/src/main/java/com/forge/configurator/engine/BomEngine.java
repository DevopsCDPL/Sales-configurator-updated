package com.forge.configurator.engine;

import com.forge.configurator.entity.ConfiguratorComponentEntity;

import java.math.BigDecimal;
import java.util.*;

public class BomEngine {
    public static final List<String> STEP_KEYS = List.of(
            "system_design",
            "enclosure",
            "bussing",
            "glastic",
            "cam_lock_panel",
            "spd_ats",
            "controls",
            "ct_vt_cpt",
            "conduit_fittings",
            "wire_cable",
            "standard_bom",
            "labour",
            "plus_comp",
            "sld"
    );

    public record Catalog(Map<UUID, ConfiguratorComponentEntity> byId,
                          Map<String, ConfiguratorComponentEntity> byPartNumber) {
    }

    public record BomRow(UUID componentId,
                         String partNumber,
                         String name,
                         String description,
                         String category,
                         String componentType,
                         double quantity,
                         String unit,
                         double unitCost,
                         double totalCost,
                         double unitMaterialCost,
                         double unitLaborCost,
                         double lbrCu,
                         double lbrAsm,
                         double lbrCnt,
                         double lbrQc,
                         double lbrTst,
                         double lbrEng,
                         double lbrCad,
                         double copperWeightPerUnit,
                         String stepKey,
                         Integer sectionNumber,
                         Map<String, Object> meta) {
    }

    public record ExpansionResult(List<BomRow> rows,
                                  Map<String, Map<String, Object>> byStep,
                                  Map<Integer, Map<String, Object>> bySection,
                                  Map<String, Double> totals) {
    }

    public ExpansionResult expandConfig(Map<String, Object> configData, Catalog catalog) {
        Map<String, Object> data = configData == null ? Map.of() : configData;
        Map<UUID, ConfiguratorComponentEntity> byId = catalog == null ? Map.of() : catalog.byId();
        Map<String, ConfiguratorComponentEntity> byPartNumber = catalog == null ? Map.of() : catalog.byPartNumber();

        List<BomRow> rows = new ArrayList<>();

        for (String stepKey : STEP_KEYS) {
            Object nodeObj = data.get(stepKey);
            if (!(nodeObj instanceof Map<?, ?> stepNodeRaw)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> stepNode = (Map<String, Object>) stepNodeRaw;

            List<Map<String, Object>> entries = new ArrayList<>();
            Object bomRowsObj = stepNode.get("bom_rows");
            if (bomRowsObj instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) {
                        entries.add(castMap(m));
                    }
                }
            } else {
                Object selected = stepNode.get("selected_components");
                if (selected instanceof List<?> list) {
                    for (Object o : list) {
                        if (o instanceof Map<?, ?> m) {
                            entries.add(castMap(m));
                        }
                    }
                } else {
                    Object items = stepNode.get("items");
                    if (items instanceof List<?> list2) {
                        for (Object o : list2) {
                            if (o instanceof Map<?, ?> m) {
                                entries.add(castMap(m));
                            }
                        }
                    }
                }
            }

            for (Map<String, Object> entry : entries) {
                ConfiguratorComponentEntity component = hydrateEntry(entry, byId, byPartNumber);
                rows.add(buildRow(entry, component, stepKey));
            }
        }

        Map<String, Map<String, Object>> byStep = new LinkedHashMap<>();
        Map<Integer, Map<String, Object>> bySection = new LinkedHashMap<>();
        double materialTotal = 0;
        double unitCostTotal = 0;

        for (BomRow row : rows) {
            Map<String, Object> step = byStep.computeIfAbsent(row.stepKey(), key -> {
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("rows", new ArrayList<BomRow>());
                map.put("total_cost", 0.0);
                return map;
            });
            @SuppressWarnings("unchecked")
            List<BomRow> stepRows = (List<BomRow>) step.get("rows");
            stepRows.add(row);
            step.put("total_cost", ((double) step.get("total_cost")) + row.totalCost());

            int sec = row.sectionNumber() == null ? 0 : row.sectionNumber();
            Map<String, Object> secBucket = bySection.computeIfAbsent(sec, key -> {
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("rows", new ArrayList<BomRow>());
                map.put("total_cost", 0.0);
                map.put("material_total", 0.0);
                return map;
            });
            @SuppressWarnings("unchecked")
            List<BomRow> secRows = (List<BomRow>) secBucket.get("rows");
            secRows.add(row);
            secBucket.put("total_cost", ((double) secBucket.get("total_cost")) + row.totalCost());
            secBucket.put("material_total", ((double) secBucket.get("material_total")) + (row.unitMaterialCost() * row.quantity()));

            materialTotal += row.unitMaterialCost() * row.quantity();
            unitCostTotal += row.totalCost();
        }

        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("row_count", (double) rows.size());
        totals.put("material_total", materialTotal);
        totals.put("unit_cost_total", unitCostTotal);

        return new ExpansionResult(rows, byStep, bySection, totals);
    }

    public List<PricingEngine.SectionInput> sectionsFromBomRows(List<BomRow> rows) {
        Map<String, SectionAccumulator> grouped = new LinkedHashMap<>();

        for (BomRow row : rows) {
            String id = row.sectionNumber() == null ? "0" : String.valueOf(row.sectionNumber());
            SectionAccumulator acc = grouped.computeIfAbsent(id, key -> new SectionAccumulator(id));
            acc.materialTotal += row.unitMaterialCost() * row.quantity();
            acc.copperTotal += row.copperWeightPerUnit() * row.quantity();
            acc.laborHours.merge("CU", row.lbrCu() * row.quantity(), Double::sum);
            acc.laborHours.merge("ASM", row.lbrAsm() * row.quantity(), Double::sum);
            acc.laborHours.merge("CNT", row.lbrCnt() * row.quantity(), Double::sum);
            acc.laborHours.merge("QC", row.lbrQc() * row.quantity(), Double::sum);
            acc.laborHours.merge("TST", row.lbrTst() * row.quantity(), Double::sum);
            acc.laborHours.merge("ENG", row.lbrEng() * row.quantity(), Double::sum);
            acc.laborHours.merge("CAD", row.lbrCad() * row.quantity(), Double::sum);
        }

        List<PricingEngine.SectionInput> result = new ArrayList<>();
        for (SectionAccumulator acc : grouped.values()) {
            result.add(new PricingEngine.SectionInput(
                    acc.id,
                    "Section " + acc.id,
                    acc.materialTotal,
                    1,
                    acc.laborHours,
                    acc.copperTotal,
                    List.of()
            ));
        }
        return result;
    }

    private ConfiguratorComponentEntity hydrateEntry(Map<String, Object> entry,
                                                     Map<UUID, ConfiguratorComponentEntity> byId,
                                                     Map<String, ConfiguratorComponentEntity> byPartNumber) {
        Object componentId = entry.get("component_id");
        if (componentId == null) {
            componentId = entry.get("componentId");
        }
        if (componentId instanceof String idText) {
            try {
                UUID id = UUID.fromString(idText);
                if (byId.containsKey(id)) {
                    return byId.get(id);
                }
            } catch (Exception ignored) {
            }
        }

        Object part = entry.get("part_number");
        if (part == null) {
            part = entry.get("partNumber");
        }
        if (part instanceof String partNumber) {
            return byPartNumber.get(partNumber);
        }

        return null;
    }

    private BomRow buildRow(Map<String, Object> entry, ConfiguratorComponentEntity comp, String stepKey) {
        double quantity = numCoerce(first(entry, "quantity"), 1);
        double unitCost = entry.containsKey("unit_cost") || entry.containsKey("unitPrice")
                ? numCoerce(first(entry, "unit_cost", "unitPrice"), 0)
                : numCoerce(value(comp == null ? null : comp.getPrice()),
                numCoerce(value(comp == null ? null : comp.getMaterialCost()), numCoerce(value(comp == null ? null : comp.getMatCost()), 0)));

        double unitMaterialCost = entry.containsKey("unit_material_cost")
                ? numCoerce(entry.get("unit_material_cost"), 0)
                : numCoerce(value(comp == null ? null : comp.getMaterialCost()), numCoerce(value(comp == null ? null : comp.getMatCost()), 0));

        double unitLaborCost = entry.containsKey("unit_labor_cost")
                ? numCoerce(entry.get("unit_labor_cost"), 0)
                : numCoerce(value(comp == null ? null : comp.getLaborCost()), 0);

        UUID componentId = null;
        Object rawCompId = first(entry, "component_id", "componentId");
        if (rawCompId instanceof String text) {
            try {
                componentId = UUID.fromString(text);
            } catch (Exception ignored) {
            }
        }
        if (componentId == null && comp != null) {
            componentId = comp.getId();
        }

        Integer sectionNumber = null;
        Object secRaw = entry.get("section_number");
        if (secRaw != null) {
            sectionNumber = (int) Math.round(numCoerce(secRaw, 0));
        }

        return new BomRow(
                componentId,
                str(first(entry, "part_number", "partNumber"), comp == null ? null : comp.getPartNumber()),
                str(first(entry, "name"), comp == null ? null : comp.getName()),
                str(first(entry, "description"), comp == null ? null : comp.getDescription()),
                str(first(entry, "category"), comp == null ? null : comp.getCategory()),
                str(first(entry, "component_type"), comp == null ? null : comp.getComponentType()),
                quantity,
                str(first(entry, "unit"), "ea"),
                unitCost,
                unitCost * quantity,
                unitMaterialCost,
                unitLaborCost,
                numCoerce(first(entry, "lbr_cu"), numCoerce(value(comp == null ? null : comp.getLbrCu()), 0)),
                numCoerce(first(entry, "lbr_asm"), numCoerce(value(comp == null ? null : comp.getLbrAsm()), 0)),
                numCoerce(first(entry, "lbr_cnt"), numCoerce(value(comp == null ? null : comp.getLbrCnt()), 0)),
                numCoerce(first(entry, "lbr_qc"), numCoerce(value(comp == null ? null : comp.getLbrQc()), 0)),
                numCoerce(first(entry, "lbr_tst"), numCoerce(value(comp == null ? null : comp.getLbrTst()), 0)),
                numCoerce(first(entry, "lbr_eng"), numCoerce(value(comp == null ? null : comp.getLbrEng()), 0)),
                numCoerce(first(entry, "lbr_cad"), numCoerce(value(comp == null ? null : comp.getLbrCad()), 0)),
                numCoerce(first(entry, "copper_weight_per_unit"), 0),
                stepKey,
                sectionNumber,
                map(first(entry, "meta"))
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private Object first(Map<String, Object> entry, String... keys) {
        for (String key : keys) {
            if (entry.containsKey(key)) {
                return entry.get(key);
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> v) {
            return (Map<String, Object>) v;
        }
        return Map.of();
    }

    private String str(Object value, String fallback) {
        return value == null ? fallback : String.valueOf(value);
    }

    private Object value(BigDecimal decimal) {
        return decimal;
    }

    private double numCoerce(Object value, double fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text);
            } catch (Exception ignored) {
            }
        }
        if (value instanceof BigDecimal decimal) {
            return decimal.doubleValue();
        }
        return fallback;
    }

    private static class SectionAccumulator {
        private final String id;
        private double materialTotal;
        private double copperTotal;
        private final Map<String, Double> laborHours = new LinkedHashMap<>();

        private SectionAccumulator(String id) {
            this.id = id;
            for (String cat : PricingEngine.LABOR_CATEGORIES) {
                laborHours.put(cat, 0.0);
            }
        }
    }
}
