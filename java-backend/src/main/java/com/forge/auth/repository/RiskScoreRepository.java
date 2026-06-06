package com.forge.auth.repository;

import com.forge.auth.entity.RiskScoreEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RiskScoreRepository extends JpaRepository<RiskScoreEntity, UUID> {

    Optional<RiskScoreEntity> findByEntityTypeAndEntityId(String entityType, UUID entityId);

    List<RiskScoreEntity> findAllByOrderByScoreDesc();

    List<RiskScoreEntity> findAllByCompanyIdOrderByScoreDesc(UUID companyId);

    List<RiskScoreEntity> findAllByLevelInOrderByScoreDesc(List<String> levels);

    List<RiskScoreEntity> findAllByCompanyIdAndLevelInOrderByScoreDesc(UUID companyId, List<String> levels);
}
