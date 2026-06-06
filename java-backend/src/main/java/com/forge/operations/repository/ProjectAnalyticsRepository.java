package com.forge.operations.repository;

import com.forge.operations.entity.ProjectAnalyticsEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ProjectAnalyticsRepository extends JpaRepository<ProjectAnalyticsEntity, UUID> {
    List<ProjectAnalyticsEntity> findByProjectIdOrderByCreatedAtAsc(UUID projectId);
    List<ProjectAnalyticsEntity> findByProjectIdIn(List<UUID> projectIds);
    void deleteByProjectId(UUID projectId);
}
