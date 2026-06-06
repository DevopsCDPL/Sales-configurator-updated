package com.forge.operations.repository;

import com.forge.operations.entity.VendorMaterialEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface VendorMaterialRepository extends JpaRepository<VendorMaterialEntity, UUID> {
    List<VendorMaterialEntity> findByVendorIdOrderByPartDescriptionAsc(UUID vendorId);

    List<VendorMaterialEntity> findByVendorIdIn(Collection<UUID> vendorIds);

    void deleteByVendorId(UUID vendorId);
}
