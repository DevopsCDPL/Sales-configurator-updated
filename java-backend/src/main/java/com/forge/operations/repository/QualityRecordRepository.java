package com.forge.operations.repository;

import com.forge.operations.entity.QualityRecordEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface QualityRecordRepository extends JpaRepository<QualityRecordEntity, UUID> {
    Optional<QualityRecordEntity> findByProjectId(UUID projectId);
    boolean existsByProjectId(UUID projectId);
}
