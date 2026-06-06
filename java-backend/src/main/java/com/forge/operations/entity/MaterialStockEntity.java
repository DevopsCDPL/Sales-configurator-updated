package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "material_stock")
public class MaterialStockEntity {
    @Id
    private UUID id;

    @Column(name = "material_id", nullable = false, unique = true)
    private UUID materialId;

    @Column(name = "current_quantity", nullable = false, precision = 14, scale = 4)
    private BigDecimal currentQuantity;

    @Column(name = "unit", length = 50, nullable = false)
    private String unit;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "last_updated", nullable = false)
    private Instant lastUpdated;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
