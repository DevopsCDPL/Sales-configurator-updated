package com.forge.configurator.entity;

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
@Table(name = "configurator_sld_documents")
public class ConfiguratorSldDocumentEntity {
    @Id
    private UUID id;

    @Column(name = "configuration_id")
    private UUID configurationId;

    @Column(name = "project_id")
    private UUID projectId;

    private Integer version;
    private String title;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> diagram;

    @Column(name = "rendered_document_id")
    private UUID renderedDocumentId;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
