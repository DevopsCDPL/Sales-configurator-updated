package com.forge.operations.repository;

import com.forge.operations.entity.RawMaterialEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RawMaterialRepository extends JpaRepository<RawMaterialEntity, UUID>, JpaSpecificationExecutor<RawMaterialEntity> {
    Optional<RawMaterialEntity> findByIdAndCompanyId(UUID id, UUID companyId);

    @Transactional
    @Modifying
    @Query("DELETE FROM RawMaterialEntity r WHERE r.id IN :ids")
    int deleteByIdIn(List<UUID> ids);
}
