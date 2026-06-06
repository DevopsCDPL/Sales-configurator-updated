package com.forge.configurator.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "configurator_components")
public class ConfiguratorComponentEntity {
    @Id
    private UUID id;

    @Column(name = "part_number")
    private String partNumber;

    private String name;
    private String category;
    private String subcategory;
    private String type;

    @Column(name = "component_type")
    private String componentType;

    private String description;

    private BigDecimal price;

    @Column(name = "material_cost")
    private BigDecimal materialCost;

    @Column(name = "labor_cost")
    private BigDecimal laborCost;

    @Column(name = "mat_cost")
    private BigDecimal matCost;

    @Column(name = "lbr_cu")
    private BigDecimal lbrCu;

    @Column(name = "lbr_asm")
    private BigDecimal lbrAsm;

    @Column(name = "lbr_cnt")
    private BigDecimal lbrCnt;

    @Column(name = "lbr_qc")
    private BigDecimal lbrQc;

    @Column(name = "lbr_tst")
    private BigDecimal lbrTst;

    @Column(name = "lbr_eng")
    private BigDecimal lbrEng;

    @Column(name = "lbr_cad")
    private BigDecimal lbrCad;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> specifications;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "excel_date")
    private String excelDate;

    private String comments;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
