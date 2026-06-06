package com.forge.operations.repository;

import com.forge.operations.entity.MaterialVendorMappingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface MaterialVendorMappingRepository extends JpaRepository<MaterialVendorMappingEntity, UUID> {
    List<MaterialVendorMappingEntity> findByMaterialIdOrderByIsDefaultDescCreatedAtAsc(UUID materialId);

    @Transactional
    @Modifying
    @Query("DELETE FROM MaterialVendorMappingEntity m WHERE m.materialId = :materialId")
    void deleteByMaterialId(UUID materialId);
}
