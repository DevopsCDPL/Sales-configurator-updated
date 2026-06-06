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
@Table(name = "file_manager_folders")
public class FileManagerFolderEntity {
    @Id
    private UUID id;

    private String name;

    private String slug;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(name = "folder_type")
    private String folderType;

    @Column(name = "module_type")
    private String moduleType;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "part_id")
    private UUID partId;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "company_id")
    private UUID companyId;

    private String path;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
