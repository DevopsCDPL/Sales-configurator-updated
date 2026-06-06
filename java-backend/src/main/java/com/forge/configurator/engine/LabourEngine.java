package com.forge.configurator.engine;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class LabourEngine {

    public record LabourSummary(Map<String, Double> hours,
                                Map<String, Double> costs,
                                Map<String, Double> rates,
                                Map<String, Double> totals) {
    }

    public Map<String, Double> aggregateHoursFromBomRows(List<BomEngine.BomRow> rows) {
        Map<String, Double> hours = new LinkedHashMap<>();
        for (String cat : PricingEngine.LABOR_CATEGORIES) {
            hours.put(cat, 0.0);
        }

        for (BomEngine.BomRow row : rows) {
            double qty = row.quantity();
            hours.merge("CU", row.lbrCu() * qty, Double::sum);
            hours.merge("ASM", row.lbrAsm() * qty, Double::sum);
            hours.merge("CNT", row.lbrCnt() * qty, Double::sum);
            hours.merge("QC", row.lbrQc() * qty, Double::sum);
            hours.merge("TST", row.lbrTst() * qty, Double::sum);
            hours.merge("ENG", row.lbrEng() * qty, Double::sum);
            hours.merge("CAD", row.lbrCad() * qty, Double::sum);
        }

        return hours;
    }

    public LabourSummary costFromHours(Map<String, Double> hours, Map<String, Double> lookup) {
        Map<String, Double> resultHours = new LinkedHashMap<>();
        Map<String, Double> costs = new LinkedHashMap<>();
        Map<String, Double> rates = new LinkedHashMap<>();

        double totalHours = 0;
        double totalCost = 0;

        for (String cat : PricingEngine.LABOR_CATEGORIES) {
            double h = num(hours.get(cat));
            double rate = num(lookup.get("LBR_" + cat + "_rate"));
            double cost = h * rate;
            resultHours.put(cat, h);
            rates.put(cat, rate);
            costs.put(cat, cost);
            totalHours += h;
            totalCost += cost;
        }

        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("hours_total", totalHours);
        totals.put("cost_total", totalCost);

        return new LabourSummary(resultHours, costs, rates, totals);
    }

    public LabourSummary computeLabour(List<BomEngine.BomRow> rows, Map<String, Double> lookup) {
        return costFromHours(aggregateHoursFromBomRows(rows), lookup);
    }

    private double num(Double value) {
        return value == null ? 0.0 : value;
    }
}
