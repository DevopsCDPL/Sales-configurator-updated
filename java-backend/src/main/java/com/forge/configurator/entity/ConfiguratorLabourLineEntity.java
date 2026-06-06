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
@Table(name = "configurator_labour_lines")
public class ConfiguratorLabourLineEntity {
    @Id
    private UUID id;

    @Column(name = "configuration_id")
    private UUID configurationId;

    private String category;
    private BigDecimal hours;
    private BigDecimal rate;

    @Column(name = "total_cost")
    private BigDecimal totalCost;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> meta;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
