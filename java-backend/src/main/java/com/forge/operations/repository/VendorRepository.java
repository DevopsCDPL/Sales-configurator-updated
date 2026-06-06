package com.forge.operations.repository;

import com.forge.operations.entity.VendorEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

public interface VendorRepository extends JpaRepository<VendorEntity, UUID>, JpaSpecificationExecutor<VendorEntity> {
    Optional<VendorEntity> findByIdAndDeletedAtIsNull(UUID id);

    Optional<VendorEntity> findByIdAndCompanyIdAndDeletedAtIsNull(UUID id, UUID companyId);
}
