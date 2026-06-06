package com.forge.operations.repository;

import com.forge.operations.entity.EstimateItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EstimateItemRepository extends JpaRepository<EstimateItemEntity, UUID> {
    List<EstimateItemEntity> findByEstimateIdOrderBySequenceOrderAsc(UUID estimateId);
    void deleteByEstimateId(UUID estimateId);
}
