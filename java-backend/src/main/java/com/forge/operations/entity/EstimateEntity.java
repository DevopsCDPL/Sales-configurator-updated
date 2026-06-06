package com.forge.operations.entity;

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
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "estimates")
public class EstimateEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    private Integer revision;

    @Column(name = "is_locked")
    private Boolean isLocked;

    @Column(name = "raw_material_cost")
    private BigDecimal rawMaterialCost;

    @Column(name = "process_cost")
    private BigDecimal processCost;

    @Column(name = "overhead_cost")
    private BigDecimal overheadCost;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @Column(name = "margin_percent")
    private BigDecimal marginPercent;

    @Column(name = "final_price")
    private BigDecimal finalPrice;

    @Column(name = "is_approved")
    private Boolean isApproved;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quotation", columnDefinition = "jsonb")
    private Map<String, Object> quotation;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "custom_parts", columnDefinition = "jsonb")
    private List<Map<String, Object>> customParts;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
