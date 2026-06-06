package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorSystemSectionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConfiguratorSystemSectionRepository extends JpaRepository<ConfiguratorSystemSectionEntity, UUID> {
    Optional<ConfiguratorSystemSectionEntity> findByConfigurationIdAndSectionNumber(UUID configurationId, Integer sectionNumber);
}
