package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "project_analytics")
public class ProjectAnalyticsEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "part_description")
    private String partDescription;

    private Integer quantity;

    private Double total;

    @Column(name = "mfg_cost")
    private Double mfgCost;

    private Double profit;

    @Column(name = "materials_unused")
    private Double materialsUnused;

    @Column(name = "raw_material_used")
    private String rawMaterialUsed;

    @Column(name = "purchased_dimension")
    private String purchasedDimension;

    @Column(name = "dimension_after_usage")
    private String dimensionAfterUsage;

    @Column(name = "qty_available")
    private Double qtyAvailable;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "audit_info", columnDefinition = "jsonb")
    private Map<String, Object> auditInfo;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
