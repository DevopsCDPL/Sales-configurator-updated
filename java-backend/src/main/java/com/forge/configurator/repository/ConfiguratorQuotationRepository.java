package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

import java.util.List;

public interface ConfiguratorQuotationRepository extends JpaRepository<ConfiguratorQuotationEntity, UUID>,
        JpaSpecificationExecutor<ConfiguratorQuotationEntity> {
    Optional<ConfiguratorQuotationEntity> findByIdAndCompanyId(UUID id, UUID companyId);
    List<ConfiguratorQuotationEntity> findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(UUID projectId);
    boolean existsByProjectIdAndDeletedAtIsNull(UUID projectId);
}
