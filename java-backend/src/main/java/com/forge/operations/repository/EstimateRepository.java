package com.forge.operations.repository;

import com.forge.operations.entity.EstimateEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EstimateRepository extends JpaRepository<EstimateEntity, UUID> {
    List<EstimateEntity> findByProjectIdOrderByRevisionAsc(UUID projectId);
    boolean existsByProjectId(UUID projectId);
    List<EstimateEntity> findAllByProjectIdOrderByRevisionAsc(UUID projectId);
    List<EstimateEntity> findByProjectIdIn(List<UUID> projectIds);
}
