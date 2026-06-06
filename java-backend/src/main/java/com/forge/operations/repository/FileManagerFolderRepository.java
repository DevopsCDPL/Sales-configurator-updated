package com.forge.operations.repository;

import com.forge.operations.entity.FileManagerFolderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FileManagerFolderRepository extends JpaRepository<FileManagerFolderEntity, UUID> {
    Optional<FileManagerFolderEntity> findByPathAndCompanyId(String path, UUID companyId);

    Optional<FileManagerFolderEntity> findByPathAndCompanyIdIsNull(String path);

    List<FileManagerFolderEntity> findByParentIdOrderByNameAsc(UUID parentId);

    List<FileManagerFolderEntity> findByCompanyIdOrderByPathAsc(UUID companyId);

    List<FileManagerFolderEntity> findByCompanyIdIsNullOrderByPathAsc();

    List<FileManagerFolderEntity> findByModuleTypeAndCompanyIdOrderByPathAsc(String moduleType, UUID companyId);

    List<FileManagerFolderEntity> findByModuleTypeAndCompanyIdIsNullOrderByPathAsc(String moduleType);

    Optional<FileManagerFolderEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    List<FileManagerFolderEntity> findByProjectIdAndFolderTypeAndCompanyId(UUID projectId, String folderType, UUID companyId);

    List<FileManagerFolderEntity> findByProjectIdAndFolderType(UUID projectId, String folderType);
}
