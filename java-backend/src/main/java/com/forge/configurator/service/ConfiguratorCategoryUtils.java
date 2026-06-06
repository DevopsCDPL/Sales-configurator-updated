package com.forge.configurator.service;

import java.util.*;

public final class ConfiguratorCategoryUtils {
    private static final Map<String, List<String>> EXPANSIONS = Map.ofEntries(
            Map.entry("CU", List.of("COPPER BUSSING", "COPPER BUSBAR", "COPPER")),
            Map.entry("SPD", List.of("SURGE PROTECTION DEVICE", "SURGE PROTECTION")),
            Map.entry("ATS", List.of("AUTOMATIC TRANSFER SWITCH")),
            Map.entry("WIRE CABLE", List.of("WIRE & CABLE", "WIRE AND CABLE", "WIRE")),
            Map.entry("CIRCUIT BREAKER", List.of("CIRCUIT BREAKERS", "BREAKER", "BREAKERS")),
            Map.entry("CONTROLS", List.of("CONTROL")),
            Map.entry("CONDUIT", List.of("CONDUIT & FITTINGS", "CONDUIT AND FITTINGS")),
            Map.entry("ENCLOSURE", List.of("ENCLOSURES")),
            Map.entry("CAMLOCK", List.of("CAM LOCK")),
            Map.entry("STANDARD BOM", List.of("STANDARD PRODUCT", "STANDARD BOM ITEM", "STANDARD BOM ITEMS"))
    );

    private ConfiguratorCategoryUtils() {
    }

    public static String normalizeCategory(String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        return name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    }

    public static String canonicalDisplay(String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        return name.toUpperCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
    }

    public static List<String> expandCategory(String rawCategory) {
        String canonical = canonicalDisplay(rawCategory);
        String normalized = normalizeCategory(rawCategory);
        Set<String> variants = new LinkedHashSet<>();

        if (!canonical.isBlank()) {
            variants.add(canonical);
        }
        if (!normalized.isBlank()) {
            variants.add(normalized);
        }

        List<String> direct = EXPANSIONS.get(canonical);
        if (direct != null) {
            for (String item : direct) {
                variants.add(canonicalDisplay(item));
                variants.add(normalizeCategory(item));
            }
        }

        for (Map.Entry<String, List<String>> entry : EXPANSIONS.entrySet()) {
            boolean synonymMatches = entry.getValue().stream()
                    .anyMatch(v -> normalizeCategory(v).equals(normalized));
            if (!synonymMatches) {
                continue;
            }
            variants.add(entry.getKey());
            variants.add(normalizeCategory(entry.getKey()));
            for (String synonym : entry.getValue()) {
                variants.add(canonicalDisplay(synonym));
                variants.add(normalizeCategory(synonym));
            }
        }

        return variants.stream().filter(s -> s != null && !s.isBlank()).toList();
    }
}
