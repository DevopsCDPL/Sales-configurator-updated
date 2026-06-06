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
@Table(name = "configurator_quotation_items")
public class ConfiguratorQuotationItemEntity {
    @Id
    private UUID id;

    @Column(name = "quotation_id")
    private UUID quotationId;

    @Column(name = "component_id")
    private UUID componentId;

    @Column(name = "line_no")
    private Integer lineNo;

    @Column(name = "step_key")
    private String stepKey;

    private String category;

    @Column(name = "part_number")
    private String partNumber;

    private String description;
    private BigDecimal quantity;
    private String unit;

    @Column(name = "unit_price")
    private BigDecimal unitPrice;

    @Column(name = "line_total")
    private BigDecimal lineTotal;

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
