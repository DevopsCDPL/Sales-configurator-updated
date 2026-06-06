package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorComponentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ConfiguratorComponentRepository extends JpaRepository<ConfiguratorComponentEntity, UUID>,
        JpaSpecificationExecutor<ConfiguratorComponentEntity> {
    List<ConfiguratorComponentEntity> findByIdIn(Collection<UUID> ids);

    List<ConfiguratorComponentEntity> findByPartNumberIn(Collection<String> partNumbers);
}
