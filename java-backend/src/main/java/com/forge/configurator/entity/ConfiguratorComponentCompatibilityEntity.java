package com.forge.configurator.entity;

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
@Table(name = "configurator_component_compatibility")
public class ConfiguratorComponentCompatibilityEntity {
    @Id
    private UUID id;

    @Column(name = "component_id")
    private UUID componentId;

    @Column(name = "compatible_component_id")
    private UUID compatibleComponentId;

    private Boolean bidirectional;
    private String notes;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
