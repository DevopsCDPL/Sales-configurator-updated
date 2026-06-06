package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorLabourLineEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ConfiguratorLabourLineRepository extends JpaRepository<ConfiguratorLabourLineEntity, UUID> {
    void deleteByConfigurationId(UUID configurationId);
}
