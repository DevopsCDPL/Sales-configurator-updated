package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "material_vendor_mappings")
public class MaterialVendorMappingEntity {
    @Id
    private UUID id;

    @Column(name = "material_id", nullable = false)
    private UUID materialId;

    @Column(name = "vendor_id", nullable = false)
    private UUID vendorId;

    @Column(name = "price_per_unit")
    private Double pricePerUnit;

    @Column(name = "lead_time")
    private Integer leadTime;

    @Column(name = "is_default", nullable = false)
    private Boolean isDefault;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
