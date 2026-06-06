package com.forge.configurator.repository;

import com.forge.configurator.entity.DocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<DocumentEntity, UUID>, JpaSpecificationExecutor<DocumentEntity> {
    List<DocumentEntity> findByProjectIdOrderByCreatedAtDesc(UUID projectId);

    List<DocumentEntity> findByProjectIdAndDocumentTypeOrderByVersionDesc(UUID projectId, String documentType);

    Optional<DocumentEntity> findTopByProjectIdAndDocumentTypeOrderByVersionDesc(UUID projectId, String documentType);

    List<DocumentEntity> findByFolderIdOrderByVersionDescCreatedAtDesc(UUID folderId);

    Optional<DocumentEntity> findByIdAndCompanyId(UUID id, UUID companyId);

	Optional<DocumentEntity> findTopByFilePathOrderByCreatedAtDesc(String filePath);

	Optional<DocumentEntity> findTopByR2Url(String r2Url);

    @Query("""
	    select d from DocumentEntity d
	    where (:moduleType is null or d.moduleType = :moduleType)
	      and (:referenceId is null or d.referenceId = :referenceId)
	      and (:projectId is null or d.projectId = :projectId)
	      and (:folderId is null or d.folderId = :folderId)
	      and (:documentType is null or d.documentType = :documentType)
	      and (:partId is null or d.partId = :partId)
	      and (:workflowStage is null or d.workflowStage = :workflowStage)
	      and (:companyId is null or d.companyId = :companyId)
	    order by d.createdAt desc
	    """)
    List<DocumentEntity> findForFileManager(
	    @Param("moduleType") String moduleType,
	    @Param("referenceId") UUID referenceId,
	    @Param("projectId") UUID projectId,
	    @Param("folderId") UUID folderId,
	    @Param("documentType") String documentType,
	    @Param("partId") UUID partId,
	    @Param("workflowStage") String workflowStage,
	    @Param("companyId") UUID companyId
    );
}
