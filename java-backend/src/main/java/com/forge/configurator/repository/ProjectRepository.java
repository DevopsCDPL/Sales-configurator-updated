package com.forge.configurator.repository;

import com.forge.configurator.entity.ProjectEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<ProjectEntity, UUID>, JpaSpecificationExecutor<ProjectEntity> {
	Optional<ProjectEntity> findByIdAndDeletedAtIsNull(UUID id);

	Optional<ProjectEntity> findByIdAndCompanyIdAndDeletedAtIsNull(UUID id, UUID companyId);

	Optional<ProjectEntity> findByProjectNameAndCompanyIdAndDeletedAtIsNull(String projectName, UUID companyId);

	Optional<ProjectEntity> findByProjectNameAndDeletedAtIsNull(String projectName);

	List<ProjectEntity> findByProjectNameStartingWithAndCompanyIdAndDeletedAtIsNull(String projectNamePrefix, UUID companyId);

	List<ProjectEntity> findByProjectNameStartingWithAndDeletedAtIsNull(String projectNamePrefix);

	Optional<ProjectEntity> findTopByCompanyIdAndQuotationNumberStartingWithOrderByQuotationNumberDesc(UUID companyId, String prefix);

	Optional<ProjectEntity> findTopByQuotationNumberStartingWithOrderByQuotationNumberDesc(String prefix);

	Optional<ProjectEntity> findTopByCompanyIdAndProjectNumberStartingWithOrderByProjectNumberDesc(UUID companyId, String prefix);

	Optional<ProjectEntity> findTopByProjectNumberStartingWithOrderByProjectNumberDesc(String prefix);

	@Query("select coalesce(max(p.revision), 0) from ProjectEntity p")
	Integer findMaxRevision();

	@Query("SELECT p FROM ProjectEntity p WHERE p.deletedAt IS NULL " +
			"AND (:companyId IS NULL OR p.companyId = :companyId) " +
			"AND (:from IS NULL OR p.createdAt >= :from) " +
			"AND (:to IS NULL OR p.createdAt <= :to) " +
			"ORDER BY p.updatedAt DESC")
	List<ProjectEntity> findForAnalytics(@Param("companyId") UUID companyId,
										 @Param("from") Instant from,
										 @Param("to") Instant to);

	@Query("SELECT p FROM ProjectEntity p WHERE p.deletedAt IS NULL " +
			"AND (:companyId IS NULL OR p.companyId = :companyId) " +
			"AND (:from IS NULL OR p.createdAt >= :from) " +
			"AND (:to IS NULL OR p.createdAt <= :to) " +
			"ORDER BY p.updatedAt DESC")
	List<ProjectEntity> findForAnalyticsLimited(@Param("companyId") UUID companyId,
												@Param("from") Instant from,
												@Param("to") Instant to,
												org.springframework.data.domain.Pageable pageable);

	@Query("SELECT p.status, COUNT(p) FROM ProjectEntity p WHERE p.deletedAt IS NULL " +
			"AND (:companyId IS NULL OR p.companyId = :companyId) " +
			"AND (:from IS NULL OR p.createdAt >= :from) " +
			"AND (:to IS NULL OR p.createdAt <= :to) " +
			"GROUP BY p.status")
	List<Object[]> countByStatusForAnalytics(@Param("companyId") UUID companyId,
											 @Param("from") Instant from,
											 @Param("to") Instant to);
}
