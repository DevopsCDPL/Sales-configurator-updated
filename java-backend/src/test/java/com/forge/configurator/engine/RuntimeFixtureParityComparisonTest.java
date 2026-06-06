package com.forge.configurator.engine;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.forge.configurator.entity.ConfiguratorComponentEntity;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class RuntimeFixtureParityComparisonTest {

    private static final double EPS = 1e-9;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_REF = new TypeReference<>() {
    };

    @Test
    void javaCompilerMatchesNodeCompilerForRuntimeFixture() throws Exception {
        Assumptions.assumeTrue(nodeAvailable(), "Node runtime is required for side-by-side fixture comparison.");

        Path fixturePath = resourcePath("configurator-fixtures/runtime-fixture-01.json");
        Path runnerPath = resourcePath("configurator-fixtures/node-engine-runner.js");
        Path backendRoot = Path.of("..", "backend").toAbsolutePath().normalize();

        Map<String, Object> fixture = MAPPER.readValue(Files.readString(fixturePath), MAP_REF);

        QuotationCompiler.CompiledQuotation javaCompiled = runJavaCompiler(fixture);
        Map<String, Object> nodeResult = runNodeCompiler(runnerPath, fixturePath, backendRoot);
        Map<String, Object> nodeCompiled = map(nodeResult.get("compiled"));

        @SuppressWarnings("unchecked")
        List<BomEngine.BomRow> javaRows = (List<BomEngine.BomRow>) javaCompiled.bomSpec().get("rows");
        List<Map<String, Object>> nodeRows = listOfMaps(map(nodeCompiled.get("bom_spec")).get("rows"));

        assertEquals(nodeRows.size(), javaRows.size(), "BOM row count mismatch");
        for (int i = 0; i < javaRows.size(); i++) {
            BomEngine.BomRow j = javaRows.get(i);
            Map<String, Object> n = nodeRows.get(i);
            assertEquals(text(n.get("part_number"), null), j.partNumber(), "part_number mismatch at row " + i);
            assertEquals(text(n.get("step_key"), null), j.stepKey(), "step_key mismatch at row " + i);
            assertEquals(integer(n.get("section_number"), 0), j.sectionNumber() == null ? 0 : j.sectionNumber(), "section_number mismatch at row " + i);
            assertNear(num(n.get("quantity")), j.quantity(), "quantity mismatch at row " + i);
            assertNear(num(n.get("unit_cost")), j.unitCost(), "unit_cost mismatch at row " + i);
            assertNear(num(n.get("total_cost")), j.totalCost(), "total_cost mismatch at row " + i);
        }

        Map<String, Object> nodeLabour = map(nodeCompiled.get("labour"));
        assertCategoryMapParity(map(nodeLabour.get("hours")), javaCompiled.labour().hours(), "labour.hours");
        assertCategoryMapParity(map(nodeLabour.get("costs")), javaCompiled.labour().costs(), "labour.costs");
        assertCategoryMapParity(map(nodeLabour.get("rates")), javaCompiled.labour().rates(), "labour.rates");
        assertNear(num(map(nodeLabour.get("totals")).get("hours_total")), javaCompiled.labour().totals().get("hours_total"), "labour.totals.hours_total mismatch");
        assertNear(num(map(nodeLabour.get("totals")).get("cost_total")), javaCompiled.labour().totals().get("cost_total"), "labour.totals.cost_total mismatch");

        Map<String, Object> nodeTotals = map(nodeCompiled.get("totals"));
        for (String key : List.of("material_total", "section_cost_total", "overhead_amount", "copper_cost", "total_cost", "target_price", "rounded_price", "actual_profit", "actual_gm")) {
            assertNear(num(nodeTotals.get(key)), javaCompiled.totals().get(key), "totals mismatch for " + key);
        }

        Map<String, Object> nodeQuote = map(nodeCompiled.get("quote"));
        Map<String, Object> nodeQuotePricing = map(nodeQuote.get("pricing"));
        assertNear(num(nodeQuotePricing.get("rounded_price")), javaCompiled.quote().pricing().roundedPrice(), "quote.pricing.rounded_price mismatch");

        String nodeRts = text(map(nodeQuote.get("schedule")).get("rts_date"), null);
        String javaRts = javaCompiled.quote().schedule().rtsDate() == null
                ? null
                : javaCompiled.quote().schedule().rtsDate().toString();
        assertEquals(normalizedIso(nodeRts), normalizedIso(javaRts), "schedule.rts_date mismatch");
    }

    private QuotationCompiler.CompiledQuotation runJavaCompiler(Map<String, Object> fixture) {
        Map<String, Object> configData = map(fixture.get("configData"));
        Map<String, Object> normalizedConfig = QuotationCompiler.normalizeConfigurationData(configData);

        BomEngine.Catalog catalog = buildCatalog(listOfMaps(fixture.get("components")));

        Map<String, Double> lookup = toDoubleMap(map(fixture.get("lookup")));

        Map<String, Object> pricingRaw = map(fixture.get("pricing"));
        PricingEngine.PricingStrategy pricing = new PricingEngine.PricingStrategy(
                text(pricingRaw.get("strategy"), "DESIRED GM%"),
                nullableDouble(pricingRaw.get("desired_gm_pct")),
                nullableDouble(pricingRaw.get("desired_price")),
                integer(pricingRaw.get("roundup_factor"), -1)
        );

        Map<String, Object> scheduleRaw = map(fixture.get("schedule"));
        PricingEngine.ScheduleInput schedule = new PricingEngine.ScheduleInput(
                instant(scheduleRaw.get("order_date")),
                integer(scheduleRaw.get("long_lead_sub_weeks"), 0),
                integer(scheduleRaw.get("long_lead_approve_weeks"), 0),
                integer(scheduleRaw.get("eng_sub_weeks"), 0),
                integer(scheduleRaw.get("sub_approve_weeks"), 0),
                integer(scheduleRaw.get("lead_time_weeks"), 0),
                integer(scheduleRaw.get("mfg_time_weeks"), 0)
        );

        List<LocalDate> holidays = new ArrayList<>();
        for (Object holiday : list(fixture.get("holidays"))) {
            if (holiday == null) {
                continue;
            }
            String text = String.valueOf(holiday);
            if (text.length() >= 10) {
                text = text.substring(0, 10);
            }
            holidays.add(LocalDate.parse(text));
        }

        List<QuotationCompiler.LineAdder> lineAdders = new ArrayList<>();
        for (Map<String, Object> adder : listOfMaps(fixture.get("lineAdders"))) {
            lineAdders.add(new QuotationCompiler.LineAdder(
                    text(adder.get("section_id"), null),
                    text(adder.get("desc"), ""),
                    num(adder.get("value"))
            ));
        }

        QuotationCompiler compiler = new QuotationCompiler(new BomEngine(), new PricingEngine(), new LabourEngine());
        return compiler.compileQuotation(
                map(fixture.get("configuration")),
                normalizedConfig,
                catalog,
                lookup,
                pricing,
                schedule,
                holidays,
                lineAdders,
                null
        );
    }

    private Map<String, Object> runNodeCompiler(Path runnerPath, Path fixturePath, Path backendRoot) throws Exception {
        Process process = new ProcessBuilder(
                "node",
                runnerPath.toAbsolutePath().toString(),
                fixturePath.toAbsolutePath().toString(),
                backendRoot.toString()
        ).start();

        String stdout;
        String stderr;
        try (InputStream out = process.getInputStream(); InputStream err = process.getErrorStream()) {
            stdout = slurp(out);
            stderr = slurp(err);
        }

        int exit = process.waitFor();
        assertEquals(0, exit, "Node fixture runner failed: " + stderr);
        assertFalse(stdout.isBlank(), "Node fixture runner returned empty output");
        return MAPPER.readValue(stdout, MAP_REF);
    }

    private BomEngine.Catalog buildCatalog(List<Map<String, Object>> components) {
        Map<UUID, ConfiguratorComponentEntity> byId = new LinkedHashMap<>();
        Map<String, ConfiguratorComponentEntity> byPartNumber = new LinkedHashMap<>();

        for (Map<String, Object> component : components) {
            ConfiguratorComponentEntity entity = new ConfiguratorComponentEntity();
            UUID id = uuid(component.get("id"));
            entity.setId(id);
            entity.setPartNumber(text(component.get("part_number"), null));
            entity.setName(text(component.get("name"), null));
            entity.setDescription(text(component.get("description"), null));
            entity.setCategory(text(component.get("category"), null));
            entity.setComponentType(text(component.get("component_type"), null));
            entity.setPrice(decimal(component.get("price")));
            entity.setMaterialCost(decimal(component.get("material_cost")));
            entity.setMatCost(decimal(component.get("mat_cost")));
            entity.setLaborCost(decimal(component.get("labor_cost")));
            entity.setLbrCu(decimal(component.get("lbr_cu")));
            entity.setLbrAsm(decimal(component.get("lbr_asm")));
            entity.setLbrCnt(decimal(component.get("lbr_cnt")));
            entity.setLbrQc(decimal(component.get("lbr_qc")));
            entity.setLbrTst(decimal(component.get("lbr_tst")));
            entity.setLbrEng(decimal(component.get("lbr_eng")));
            entity.setLbrCad(decimal(component.get("lbr_cad")));

            if (id != null) {
                byId.put(id, entity);
            }
            if (entity.getPartNumber() != null) {
                byPartNumber.put(entity.getPartNumber(), entity);
            }
        }

        return new BomEngine.Catalog(byId, byPartNumber);
    }

    private void assertCategoryMapParity(Map<String, Object> node, Map<String, Double> javaValues, String label) {
        Set<String> categories = new LinkedHashSet<>();
        categories.addAll(node.keySet());
        categories.addAll(javaValues.keySet());
        for (String category : categories) {
            assertNear(num(node.get(category)), javaValues.getOrDefault(category, 0.0), label + " mismatch for " + category);
        }
    }

    private static Path resourcePath(String resourcePath) throws Exception {
        var url = Thread.currentThread().getContextClassLoader().getResource(resourcePath);
        assertNotNull(url, "Missing resource: " + resourcePath);
        return Path.of(url.toURI());
    }

    private static boolean nodeAvailable() {
        try {
            Process process = new ProcessBuilder("node", "--version").start();
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception ex) {
            return false;
        }
    }

    private static String slurp(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        stream.transferTo(output);
        return output.toString(StandardCharsets.UTF_8);
    }

    private static Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> source) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : source.entrySet()) {
                out.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return out;
        }
        return new LinkedHashMap<>();
    }

    private static List<Object> list(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private static List<Map<String, Object>> listOfMaps(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object raw : list(value)) {
            if (raw instanceof Map<?, ?> source) {
                out.add(map(source));
            }
        }
        return out;
    }

    private static Map<String, Double> toDoubleMap(Map<String, Object> source) {
        Map<String, Double> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            out.put(entry.getKey(), num(entry.getValue()));
        }
        return out;
    }

    private static UUID uuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return uuid;
        }
        try {
            return UUID.fromString(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private static String text(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value);
        return text.isBlank() ? fallback : text;
    }

    private static int integer(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private static double num(Object value) {
        if (value == null) {
            return 0.0;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return 0.0;
        }
    }

    private static Double nullableDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private static Instant instant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof LocalDate localDate) {
            return localDate.atStartOfDay().toInstant(ZoneOffset.UTC);
        }
        try {
            return Instant.parse(String.valueOf(value));
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private static void assertNear(double expected, double actual, String message) {
        assertEquals(expected, actual, EPS, message);
    }

    private static String normalizedIso(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value).toString();
        } catch (Exception ex) {
            return String.valueOf(value).toLowerCase(Locale.ROOT);
        }
    }
}
