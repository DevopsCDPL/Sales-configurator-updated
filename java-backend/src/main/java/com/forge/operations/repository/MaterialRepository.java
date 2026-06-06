package com.forge.operations.repository;

import com.forge.operations.entity.MaterialEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

public interface MaterialRepository extends JpaRepository<MaterialEntity, UUID>, JpaSpecificationExecutor<MaterialEntity> {
    Optional<MaterialEntity> findByIdAndCompanyId(UUID id, UUID companyId);
}
