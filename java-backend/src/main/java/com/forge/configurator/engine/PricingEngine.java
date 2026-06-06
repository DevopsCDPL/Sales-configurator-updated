package com.forge.configurator.engine;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

public class PricingEngine {
    public static final String CALC_VERSION = "1.1.0";
    public static final List<String> LABOR_CATEGORIES = List.of("CU", "ASM", "CNT", "QC", "TST", "ENG", "CAD");

    public record SectionLineItem(String desc, double value) {
    }

    public record SectionInput(String id,
                               String description,
                               double unitMaterialCost,
                               int qty,
                               Map<String, Double> laborHoursPerUnit,
                               double copperWeightPerUnit,
                               List<SectionLineItem> lineItems) {
    }

    public record PricingStrategy(String strategy, Double desiredGmPct, Double desiredPrice, int roundupFactor) {
    }

    public record ScheduleInput(Instant orderDate,
                                int longLeadSubWeeks,
                                int longLeadApproveWeeks,
                                int engSubWeeks,
                                int subApproveWeeks,
                                int leadTimeWeeks,
                                int mfgTimeWeeks) {
    }

    public record AddersGroupedItem(String desc, double total) {
    }

    public record LaborCategoryBreakdown(double hours, double cost, double rate) {
    }

    public record SectionBreakdown(String id,
                                   String description,
                                   int qty,
                                   double materialTotal,
                                   Map<String, LaborCategoryBreakdown> labor,
                                   double sectionTotal,
                                   double copperTotal) {
    }

    public record PricingResult(double targetPrice,
                                double roundedPrice,
                                double actualProfit,
                                double actualGm,
                                int roundupFactor) {
    }

    public record ScheduleResult(Instant orderDate,
                                 Instant longLeadSubDate,
                                 Instant longLeadApproveDate,
                                 Instant engSubDate,
                                 Instant releaseDate,
                                 Instant rtsDate) {
    }

    public record QuoteResult(Instant generatedAt,
                              String calcVersion,
                              List<SectionBreakdown> sectionBreakdown,
                              Map<String, Double> totals,
                              Map<String, Double> laborCosts,
                              Map<String, Double> laborHours,
                              List<AddersGroupedItem> addersGrouped,
                              double totalLineAdders,
                              double totalCost,
                              PricingResult pricing,
                              ScheduleResult schedule,
                              double copperTotal) {
    }

    public record QuoteInput(List<SectionInput> sections,
                             Map<String, Double> lookup,
                             PricingStrategy pricing,
                             ScheduleInput schedule,
                             List<LocalDate> holidays) {
    }

    public static double roundup(double value, int factor) {
        if (factor < 0) {
            double base = Math.pow(10, Math.abs(factor));
            return Math.ceil(value / base) * base;
        }
        double base = Math.pow(10, factor);
        return Math.ceil(value * base) / base;
    }

    private static Instant businessDayAdd(Instant start, int businessDays, Set<LocalDate> holidays) {
        if (businessDays <= 0) {
            return start;
        }
        LocalDate date = start.atOffset(ZoneOffset.UTC).toLocalDate();
        int added = 0;
        while (added < businessDays) {
            date = date.plusDays(1);
            if (date.getDayOfWeek().getValue() >= 6) {
                continue;
            }
            if (holidays.contains(date)) {
                continue;
            }
            added++;
        }
        return date.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    public QuoteResult computeQuote(QuoteInput input) {
        if (input.sections() == null) {
            throw new IllegalArgumentException("sections is required");
        }
        if (input.lookup() == null) {
            throw new IllegalArgumentException("lookup is required");
        }
        if (input.pricing() == null) {
            throw new IllegalArgumentException("pricing is required");
        }

        List<SectionBreakdown> sectionBreakdowns = new ArrayList<>();
        Map<String, Double> laborCosts = new LinkedHashMap<>();
        Map<String, Double> laborHours = new LinkedHashMap<>();
        for (String cat : LABOR_CATEGORIES) {
            laborCosts.put(cat, 0.0);
            laborHours.put(cat, 0.0);
        }

        double materialTotal = 0.0;
        double sectionCostTotal = 0.0;
        double copperTotal = 0.0;

        for (SectionInput sec : input.sections()) {
            int qty = Math.max(0, sec.qty());
            double matTotal = sec.unitMaterialCost() * qty;
            materialTotal += matTotal;

            double copper = sec.copperWeightPerUnit() * qty;
            copperTotal += copper;

            Map<String, LaborCategoryBreakdown> perCat = new LinkedHashMap<>();
            double laborSumCost = 0.0;
            for (String cat : LABOR_CATEGORIES) {
                double hpu = num(sec.laborHoursPerUnit().get(cat));
                double hours = hpu * qty;
                double rate = num(input.lookup().get("LBR_" + cat + "_rate"));
                double cost = hours * rate;
                perCat.put(cat, new LaborCategoryBreakdown(hours, cost, rate));

                laborCosts.put(cat, laborCosts.get(cat) + cost);
                laborHours.put(cat, laborHours.get(cat) + hours);
                laborSumCost += cost;
            }

            double sectionTotal = matTotal + laborSumCost;
            sectionCostTotal += sectionTotal;
            sectionBreakdowns.add(new SectionBreakdown(
                    sec.id(),
                    sec.description(),
                    qty,
                    matTotal,
                    perCat,
                    sectionTotal,
                    copper
            ));
        }

        Map<String, Double> addersMap = new HashMap<>();
        for (SectionInput sec : input.sections()) {
            for (SectionLineItem li : sec.lineItems()) {
                addersMap.merge(li.desc(), li.value(), Double::sum);
            }
        }

        List<AddersGroupedItem> addersGrouped = addersMap.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> new AddersGroupedItem(e.getKey(), e.getValue()))
                .toList();

        double totalLineAdders = addersGrouped.stream().mapToDouble(AddersGroupedItem::total).sum();

        double overheadPct = num(input.lookup().get("OVERHEAD_PCT"));
        double copperRate = num(input.lookup().get("COPPER_RATE_PER_LB"));
        double copperCost = copperTotal * copperRate;
        double baseCost = sectionCostTotal + totalLineAdders;
        double overheadAmount = baseCost * overheadPct;
        double totalCost = baseCost + overheadAmount + copperCost;

        PricingResult pricing = computePricing(totalCost, input.pricing());
        ScheduleResult schedule = computeSchedule(input.schedule(), input.holidays());

        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("material_total", materialTotal);
        totals.put("section_cost_total", sectionCostTotal);
        totals.put("overhead_amount", overheadAmount);
        totals.put("copper_cost", copperCost);

        return new QuoteResult(
                Instant.now(),
                CALC_VERSION,
                sectionBreakdowns,
                totals,
                laborCosts,
                laborHours,
                addersGrouped,
                totalLineAdders,
                totalCost,
                pricing,
                schedule,
                copperTotal
        );
    }

    public PricingResult computePricing(double totalCost, PricingStrategy pricing) {
        String strategy = pricing.strategy() == null ? "DESIRED GM%" : pricing.strategy();
        double targetPrice;
        if ("DESIRED GM%".equals(strategy)) {
            double gm = pricing.desiredGmPct() == null ? 0.0 : pricing.desiredGmPct();
            if (gm >= 1) {
                throw new IllegalArgumentException("desired_gm_pct must be < 1");
            }
            targetPrice = totalCost / (1 - gm);
        } else {
            targetPrice = pricing.desiredPrice() == null ? totalCost : pricing.desiredPrice();
        }

        int roundupFactor = pricing.roundupFactor();
        double roundedPrice = roundup(targetPrice, roundupFactor);
        double actualProfit = roundedPrice - totalCost;
        double actualGm = roundedPrice == 0 ? 0 : actualProfit / roundedPrice;

        return new PricingResult(targetPrice, roundedPrice, actualProfit, actualGm, roundupFactor);
    }

    public ScheduleResult computeSchedule(ScheduleInput schedule, List<LocalDate> holidays) {
        ScheduleInput effective = schedule == null
                ? new ScheduleInput(null, 0, 0, 0, 0, 0, 0)
                : schedule;

        Instant now = Instant.now();
        Instant orderDate = effective.orderDate() == null ? now.plus(15, ChronoUnit.DAYS) : effective.orderDate();

        Set<LocalDate> holidaySet = holidays == null ? Set.of() : new HashSet<>(holidays);
        Instant longLeadSub = effective.longLeadSubWeeks() > 0
                ? businessDayAdd(orderDate, effective.longLeadSubWeeks() * 5, holidaySet)
                : null;
        Instant engSub = effective.engSubWeeks() > 0
                ? businessDayAdd(orderDate, effective.engSubWeeks() * 5, holidaySet)
                : null;
        Instant release = engSub != null && effective.subApproveWeeks() > 0
                ? businessDayAdd(engSub, effective.subApproveWeeks() * 5, holidaySet)
                : engSub;

        int totalRtsWeeks = effective.leadTimeWeeks() + effective.mfgTimeWeeks();
        Instant rts = release != null && totalRtsWeeks > 0
                ? businessDayAdd(release, totalRtsWeeks * 5, holidaySet)
                : release;

        Instant longLeadApprove = effective.longLeadApproveWeeks() > 0
                ? businessDayAdd(orderDate, effective.longLeadApproveWeeks() * 5, holidaySet)
                : null;

        return new ScheduleResult(orderDate, longLeadSub, longLeadApprove, engSub, release, rts);
    }

    private double num(Double value) {
        return value == null ? 0.0 : value;
    }
}
