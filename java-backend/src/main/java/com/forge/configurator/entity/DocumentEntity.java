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
@Table(name = "documents")
public class DocumentEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "folder_id")
    private UUID folderId;

    @Column(name = "module_type")
    private String moduleType;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "document_type")
    private String documentType;

    private String description;
    private Integer size;
    private Integer version;

    @Column(name = "file_path")
    private String filePath;

    @Column(name = "file_name")
    private String fileName;

    private String status;

    @Column(name = "file_type")
    private String fileType;

    @Column(name = "uploaded_by")
    private UUID uploadedBy;

    @Column(name = "generated_by")
    private UUID generatedBy;

    @Column(name = "generated_at")
    private Instant generatedAt;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "r2_url")
    private String r2Url;

    @Column(name = "part_id")
    private UUID partId;

    @Column(name = "workflow_stage")
    private String workflowStage;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
