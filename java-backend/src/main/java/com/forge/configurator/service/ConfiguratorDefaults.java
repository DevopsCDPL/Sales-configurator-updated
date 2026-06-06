package com.forge.configurator.service;

import java.util.Map;

public final class ConfiguratorDefaults {
    private ConfiguratorDefaults() {
    }

    public static final Map<String, Double> LOOKUP = Map.of(
            "LBR_CU_rate", 85.0,
            "LBR_ASM_rate", 75.0,
            "LBR_CNT_rate", 95.0,
            "LBR_QC_rate", 80.0,
            "LBR_TST_rate", 90.0,
            "LBR_ENG_rate", 130.0,
            "LBR_CAD_rate", 110.0,
            "OVERHEAD_PCT", 0.10,
            "COPPER_RATE_PER_LB", 4.5
    );

    public static final Map<String, Object> PRICING = Map.of(
            "strategy", "DESIRED GM%",
            "desired_gm_pct", 0.30,
            "roundup_factor", -1
    );

    public static final Map<String, Object> SCHEDULE = Map.of(
            "long_lead_sub_weeks", 2,
            "long_lead_approve_weeks", 2,
            "eng_sub_weeks", 4,
            "sub_approve_weeks", 2,
            "lead_time_weeks", 6,
            "mfg_time_weeks", 4
    );
}
