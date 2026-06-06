package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorConfigurationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

import java.util.List;

public interface ConfiguratorConfigurationRepository extends JpaRepository<ConfiguratorConfigurationEntity, UUID>,
        JpaSpecificationExecutor<ConfiguratorConfigurationEntity> {
    Optional<ConfiguratorConfigurationEntity> findByIdAndCompanyId(UUID id, UUID companyId);
    List<ConfiguratorConfigurationEntity> findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(UUID projectId);
    boolean existsByProjectIdAndDeletedAtIsNull(UUID projectId);
}
