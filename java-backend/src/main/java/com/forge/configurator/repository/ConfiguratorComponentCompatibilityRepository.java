package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorComponentCompatibilityEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConfiguratorComponentCompatibilityRepository extends JpaRepository<ConfiguratorComponentCompatibilityEntity, UUID> {
    List<ConfiguratorComponentCompatibilityEntity> findByComponentIdAndCompanyId(UUID componentId, UUID companyId);

    Optional<ConfiguratorComponentCompatibilityEntity> findByComponentIdAndCompatibleComponentIdAndCompanyId(
            UUID componentId,
            UUID compatibleComponentId,
            UUID companyId
    );
}
