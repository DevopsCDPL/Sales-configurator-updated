package com.forge.operations.repository;

import com.forge.operations.entity.WorkOrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkOrderRepository extends JpaRepository<WorkOrderEntity, UUID> {
    Optional<WorkOrderEntity> findByProjectId(UUID projectId);
    boolean existsByProjectId(UUID projectId);
    List<WorkOrderEntity> findAllByProjectIdOrderByCreatedAtAsc(UUID projectId);
    List<WorkOrderEntity> findByProjectIdIn(List<UUID> projectIds);
}
