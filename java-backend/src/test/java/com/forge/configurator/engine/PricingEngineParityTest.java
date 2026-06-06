package com.forge.configurator.engine;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class PricingEngineParityTest {

    @Test
    void roundupMatchesLegacyBehavior() {
        assertEquals(1300.0, PricingEngine.roundup(1234.01, -2), 1e-9);
        assertEquals(12.4, PricingEngine.roundup(12.301, 1), 1e-9);
    }

    @Test
    void computeQuoteMatchesExpectedMathForDesiredGmStrategy() {
        PricingEngine engine = new PricingEngine();

        Map<String, Double> laborHours = new LinkedHashMap<>();
        for (String category : PricingEngine.LABOR_CATEGORIES) {
            laborHours.put(category, 0.0);
        }
        laborHours.put("CU", 1.5);
        laborHours.put("ASM", 0.5);

        PricingEngine.SectionInput section = new PricingEngine.SectionInput(
                "1",
                "Main Section",
                1000.0,
                2,
                laborHours,
                10.0,
                List.of(new PricingEngine.SectionLineItem("Shipping", 50.0))
        );

        Map<String, Double> lookup = new LinkedHashMap<>();
        lookup.put("LBR_CU_rate", 100.0);
        lookup.put("LBR_ASM_rate", 50.0);
        lookup.put("LBR_CNT_rate", 0.0);
        lookup.put("LBR_QC_rate", 0.0);
        lookup.put("LBR_TST_rate", 0.0);
        lookup.put("LBR_ENG_rate", 0.0);
        lookup.put("LBR_CAD_rate", 0.0);
        lookup.put("OVERHEAD_PCT", 0.10);
        lookup.put("COPPER_RATE_PER_LB", 4.0);

        PricingEngine.PricingStrategy pricing = new PricingEngine.PricingStrategy(
                "DESIRED GM%",
                0.25,
                null,
                -1
        );

        PricingEngine.ScheduleInput schedule = new PricingEngine.ScheduleInput(
                Instant.parse("2025-01-06T00:00:00Z"),
                1,
                3,
                2,
                1,
                1,
                1
        );

        PricingEngine.QuoteResult quote = engine.computeQuote(
                new PricingEngine.QuoteInput(List.of(section), lookup, pricing, schedule, List.of())
        );

        assertEquals(2000.0, quote.totals().get("material_total"), 1e-9);
        assertEquals(2350.0, quote.totals().get("section_cost_total"), 1e-9);
        assertEquals(240.0, quote.totals().get("overhead_amount"), 1e-9);
        assertEquals(80.0, quote.totals().get("copper_cost"), 1e-9);
        assertEquals(20.0, quote.copperTotal(), 1e-9);
        assertEquals(50.0, quote.totalLineAdders(), 1e-9);
        assertEquals(2720.0, quote.totalCost(), 1e-9);

        assertEquals(3626.6666666666665, quote.pricing().targetPrice(), 1e-9);
        assertEquals(3630.0, quote.pricing().roundedPrice(), 1e-9);
        assertEquals(910.0, quote.pricing().actualProfit(), 1e-9);
        assertEquals(910.0 / 3630.0, quote.pricing().actualGm(), 1e-12);

        assertNotNull(quote.schedule());
        assertEquals(Instant.parse("2025-01-06T00:00:00Z"), quote.schedule().orderDate());
        assertEquals(Instant.parse("2025-01-13T00:00:00Z"), quote.schedule().longLeadSubDate());
        assertEquals(Instant.parse("2025-01-27T00:00:00Z"), quote.schedule().longLeadApproveDate());
        assertEquals(Instant.parse("2025-01-20T00:00:00Z"), quote.schedule().engSubDate());
        assertEquals(Instant.parse("2025-01-27T00:00:00Z"), quote.schedule().releaseDate());
        assertEquals(Instant.parse("2025-02-10T00:00:00Z"), quote.schedule().rtsDate());
    }

    @Test
    void scheduleSkipsConfiguredHolidays() {
        PricingEngine engine = new PricingEngine();
        Instant start = Instant.parse("2025-01-06T00:00:00Z"); // Monday

        PricingEngine.ScheduleResult schedule = engine.computeSchedule(
                new PricingEngine.ScheduleInput(start, 1, 0, 0, 0, 0, 0),
                List.of(LocalDate.parse("2025-01-13"))
        );

        // 5 business days from Jan 6 is Jan 13, but holiday pushes to Jan 14.
        assertEquals(Instant.parse("2025-01-14T00:00:00Z"), schedule.longLeadSubDate());
    }
}
