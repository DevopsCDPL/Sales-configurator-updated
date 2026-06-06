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
@Table(name = "stocks")
public class StockEntity {
    @Id
    private UUID id;

    @Column(name = "stock_id", length = 50)
    private String stockId;

    @Column(name = "part_description", length = 300, nullable = false)
    private String partDescription;

    @Column(name = "material_grade", length = 200, nullable = false)
    private String materialGrade;

    @Column(name = "condition", length = 100)
    private String condition;

    @Column(name = "shape", length = 100)
    private String shape;

    @Column(name = "dimension", length = 200)
    private String dimension;

    @Column(name = "quantity", nullable = false)
    private Double quantity;

    @Column(name = "heat_number", length = 100)
    private String heatNumber;

    @Column(name = "raw_material_id")
    private UUID rawMaterialId;

    @Column(name = "certificate_url", length = 500)
    private String certificateUrl;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
