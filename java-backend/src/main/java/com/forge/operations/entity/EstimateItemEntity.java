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
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "estimate_items")
public class EstimateItemEntity {
    @Id
    private UUID id;

    @Column(name = "estimate_id")
    private UUID estimateId;

    @Column(name = "module_type")
    private String moduleType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "input_json", columnDefinition = "jsonb")
    private Map<String, Object> inputJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "calculated_json", columnDefinition = "jsonb")
    private Map<String, Object> calculatedJson;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @Column(name = "sequence_order")
    private Integer sequenceOrder;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
