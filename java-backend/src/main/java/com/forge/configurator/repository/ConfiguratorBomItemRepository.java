package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorBomItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ConfiguratorBomItemRepository extends JpaRepository<ConfiguratorBomItemEntity, UUID> {
    void deleteByConfigurationId(UUID configurationId);
}
