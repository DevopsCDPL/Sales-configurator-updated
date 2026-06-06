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
@Table(name = "vendor_materials")
public class VendorMaterialEntity {
    @Id
    private UUID id;

    @Column(name = "vendor_id")
    private UUID vendorId;

    @Column(name = "part_description")
    private String partDescription;

    @Column(name = "material_grade")
    private String materialGrade;

    private String dimension;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
