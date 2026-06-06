package com.forge.configurator.engine;

import java.util.*;

public class QuotationCompiler {
    private final BomEngine bomEngine;
    private final PricingEngine pricingEngine;
    private final LabourEngine labourEngine;

    public QuotationCompiler(BomEngine bomEngine, PricingEngine pricingEngine, LabourEngine labourEngine) {
        this.bomEngine = bomEngine;
        this.pricingEngine = pricingEngine;
        this.labourEngine = labourEngine;
    }

    public record LineAdder(String sectionId, String desc, double value) {
    }

    public record QuotationItem(int lineNumber,
                                UUID componentId,
                                String partNumber,
                                String description,
                                String category,
                                String stepKey,
                                Integer sectionNumber,
                                double quantity,
                                String unit,
                                double unitCost,
                                double totalCost,
                                Map<String, Object> meta) {
    }

    public record CompiledQuotation(Map<String, Object> configuration,
                                    PricingEngine.QuoteResult quote,
                                    LabourEngine.LabourSummary labour,
                                    List<QuotationItem> items,
                                    Map<String, Object> bomSpec,
                                    Map<String, Object> pricingSpec,
                                    Map<String, Double> totals) {
    }

    public CompiledQuotation compileQuotation(Map<String, Object> configuration,
                                              Map<String, Object> configData,
                                              BomEngine.Catalog catalog,
                                              Map<String, Double> lookup,
                                              PricingEngine.PricingStrategy pricing,
                                              PricingEngine.ScheduleInput schedule,
                                              List<java.time.LocalDate> holidays,
                                              List<LineAdder> lineAdders,
                                              List<PricingEngine.SectionInput> preBuiltSections) {
        BomEngine.ExpansionResult bom = bomEngine.expandConfig(configData, catalog);

        List<PricingEngine.SectionInput> sections;
        if (preBuiltSections != null && !preBuiltSections.isEmpty()) {
            sections = new ArrayList<>(preBuiltSections);
        } else {
            sections = new ArrayList<>(bomEngine.sectionsFromBomRows(bom.rows()));
        }

        if (lineAdders != null && !lineAdders.isEmpty()) {
            Map<String, List<PricingEngine.SectionLineItem>> grouped = new HashMap<>();
            for (LineAdder adder : lineAdders) {
                String id = adder.sectionId() == null || adder.sectionId().isBlank()
                        ? (sections.isEmpty() ? "0" : sections.getFirst().id())
                        : adder.sectionId();
                grouped.computeIfAbsent(id, key -> new ArrayList<>())
                        .add(new PricingEngine.SectionLineItem(adder.desc(), adder.value()));
            }

            sections = sections.stream().map(section -> {
                List<PricingEngine.SectionLineItem> extras = grouped.get(section.id());
                if (extras == null || extras.isEmpty()) {
                    return section;
                }
                List<PricingEngine.SectionLineItem> merged = new ArrayList<>(section.lineItems());
                merged.addAll(extras);
                return new PricingEngine.SectionInput(
                        section.id(),
                        section.description(),
                        section.unitMaterialCost(),
                        section.qty(),
                        section.laborHoursPerUnit(),
                        section.copperWeightPerUnit(),
                        merged
                );
            }).toList();
        }

        PricingEngine.QuoteResult quote = pricingEngine.computeQuote(
                new PricingEngine.QuoteInput(sections, lookup, pricing, schedule, holidays)
        );

        LabourEngine.LabourSummary labour = labourEngine.computeLabour(bom.rows(), lookup);

        List<QuotationItem> items = new ArrayList<>();
        for (int i = 0; i < bom.rows().size(); i++) {
            BomEngine.BomRow row = bom.rows().get(i);
            items.add(new QuotationItem(
                    i + 1,
                    row.componentId(),
                    row.partNumber(),
                    row.description() == null ? row.name() : row.description(),
                    row.category(),
                    row.stepKey(),
                    row.sectionNumber(),
                    row.quantity(),
                    row.unit(),
                    row.unitCost(),
                    row.totalCost(),
                    row.meta()
            ));
        }

        Map<String, Object> bomSpec = new LinkedHashMap<>();
        bomSpec.put("rows", bom.rows());
        bomSpec.put("by_step", bom.byStep());
        bomSpec.put("by_section", bom.bySection());
        bomSpec.put("totals", bom.totals());

        Map<String, Object> pricingSpec = new LinkedHashMap<>();
        pricingSpec.put("lookup", lookup);
        pricingSpec.put("pricing_strategy", pricing);
        pricingSpec.put("schedule", schedule);
        pricingSpec.put("holidays", holidays);
        pricingSpec.put("line_adders", lineAdders == null ? List.of() : lineAdders);
        pricingSpec.put("sections_input", sections);
        pricingSpec.put("quote", quote);
        pricingSpec.put("labour_summary", labour);

        Map<String, Double> totals = new LinkedHashMap<>();
        totals.putAll(quote.totals());
        totals.put("total_cost", quote.totalCost());
        totals.put("target_price", quote.pricing().targetPrice());
        totals.put("rounded_price", quote.pricing().roundedPrice());
        totals.put("actual_profit", quote.pricing().actualProfit());
        totals.put("actual_gm", quote.pricing().actualGm());

        return new CompiledQuotation(configuration, quote, labour, items, bomSpec, pricingSpec, totals);
    }

    public static Map<String, Object> normalizeConfigurationData(Map<String, Object> configData) {
        if (configData == null) {
            return Map.of();
        }

        Map<String, Object> out = new LinkedHashMap<>(configData);
        Object stepLinesRaw = configData.get("stepLines");
        if (!(stepLinesRaw instanceof Map<?, ?> stepLinesAny)) {
            return out;
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> stepLines = (Map<String, Object>) stepLinesAny;

        for (String stepKey : BomEngine.STEP_KEYS) {
            Object linesRaw = stepLines.get(stepKey);
            if (!(linesRaw instanceof List<?> lines) || lines.isEmpty()) {
                continue;
            }

            List<Map<String, Object>> selected = new ArrayList<>();
            for (Object lineRaw : lines) {
                if (!(lineRaw instanceof Map<?, ?> lineAny)) {
                    continue;
                }
                Map<String, Object> line = castMap(lineAny);
                Map<String, Object> mapped = new LinkedHashMap<>();
                mapped.put("component_id", first(line, "componentId", "component_id"));
                mapped.put("part_number", first(line, "partNumber", "part_number"));
                mapped.put("name", line.get("name"));
                mapped.put("unit_cost", first(line, "unitPrice", "unit_cost"));
                Object qty = line.get("quantity");
                mapped.put("quantity", qty instanceof Number ? ((Number) qty).doubleValue() : 1);
                mapped.put("meta", line.containsKey("meta") ? line.get("meta") : Map.of());
                selected.add(mapped);
            }

            Object existing = out.get(stepKey);
            if (existing instanceof Map<?, ?> existingMap) {
                @SuppressWarnings("unchecked")
                Map<String, Object> existingTyped = new LinkedHashMap<>((Map<String, Object>) existingMap);
                boolean alreadyHasData = hasData(existingTyped, "bom_rows")
                        || hasData(existingTyped, "selected_components")
                        || hasData(existingTyped, "items");
                if (!alreadyHasData) {
                    existingTyped.put("selected_components", selected);
                    out.put(stepKey, existingTyped);
                }
            } else {
                out.put(stepKey, Map.of("selected_components", selected));
            }
        }

        return out;
    }

    private static Object first(Map<String, Object> map, String a, String b) {
        if (map.containsKey(a)) {
            return map.get(a);
        }
        return map.get(b);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private static boolean hasData(Map<String, Object> map, String key) {
        Object raw = map.get(key);
        return raw instanceof List<?> list && !list.isEmpty();
    }
}
