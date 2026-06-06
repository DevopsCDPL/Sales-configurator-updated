package com.forge.operations.repository;

import com.forge.operations.entity.MaterialStockEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MaterialStockRepository extends JpaRepository<MaterialStockEntity, UUID> {
    List<MaterialStockEntity> findByCompanyIdOrderByLastUpdatedDesc(UUID companyId);

    List<MaterialStockEntity> findAllByOrderByLastUpdatedDesc();

    Optional<MaterialStockEntity> findByMaterialId(UUID materialId);
}
