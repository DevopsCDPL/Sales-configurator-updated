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
@Table(name = "materials")
public class MaterialEntity {
    @Id
    private UUID id;

    @Column(name = "material_name", length = 200, nullable = false)
    private String materialName;

    @Column(name = "category", length = 50, nullable = false)
    private String category;

    @Column(name = "grade", length = 100)
    private String grade;

    @Column(name = "form", length = 50)
    private String form;

    @Column(name = "shape", length = 50)
    private String shape;

    @Column(name = "unit", length = 50, nullable = false)
    private String unit;

    @Column(name = "density")
    private Double density;

    @Column(name = "default_cost")
    private Double defaultCost;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
