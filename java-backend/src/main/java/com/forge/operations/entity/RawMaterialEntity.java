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
@Table(name = "raw_materials")
public class RawMaterialEntity {
    @Id
    private UUID id;

    @Column(name = "material_id", length = 20)
    private String materialId;

    @Column(name = "material_category", length = 100, nullable = false)
    private String materialCategory;

    @Column(name = "material_grade", length = 100, nullable = false)
    private String materialGrade;

    @Column(name = "condition", length = 100, nullable = false)
    private String condition;

    @Column(name = "density", nullable = false)
    private Double density;

    @Column(name = "form", length = 50)
    private String form;

    @Column(name = "shape", length = 50)
    private String shape;

    @Column(name = "cost_per_unit")
    private Double costPerUnit;

    @Column(name = "cost_unit", length = 20)
    private String costUnit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dimensions", columnDefinition = "jsonb")
    private Map<String, Object> dimensions;

    @Column(name = "unit_system", length = 20)
    private String unitSystem;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
