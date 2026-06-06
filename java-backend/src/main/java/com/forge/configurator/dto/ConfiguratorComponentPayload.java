package com.forge.configurator.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ConfiguratorComponentPayload(
        @JsonProperty("part_number") @JsonAlias("partNumber") String partNumber,
        String name,
        String category,
        String subcategory,
        String type,
        @JsonProperty("component_type") @JsonAlias("componentType") String componentType,
        String description,
        BigDecimal price,
        @JsonProperty("material_cost") @JsonAlias("materialCost") BigDecimal materialCost,
        @JsonProperty("labor_cost") @JsonAlias("laborCost") BigDecimal laborCost,
        @JsonProperty("mat_cost") @JsonAlias("matCost") BigDecimal matCost,
        @JsonProperty("lbr_cu") @JsonAlias("lbrCu") BigDecimal lbrCu,
        @JsonProperty("lbr_asm") @JsonAlias("lbrAsm") BigDecimal lbrAsm,
        @JsonProperty("lbr_cnt") @JsonAlias("lbrCnt") BigDecimal lbrCnt,
        @JsonProperty("lbr_qc") @JsonAlias("lbrQc") BigDecimal lbrQc,
        @JsonProperty("lbr_tst") @JsonAlias("lbrTst") BigDecimal lbrTst,
        @JsonProperty("lbr_eng") @JsonAlias("lbrEng") BigDecimal lbrEng,
        @JsonProperty("lbr_cad") @JsonAlias("lbrCad") BigDecimal lbrCad,
        Map<String, Object> specifications,
        @JsonProperty("image_url") @JsonAlias("imageUrl") String imageUrl,
        @JsonProperty("excel_date") @JsonAlias("excelDate") String excelDate,
        String comments,
        @JsonProperty("is_active") @JsonAlias("isActive") Boolean isActive
) {
}
