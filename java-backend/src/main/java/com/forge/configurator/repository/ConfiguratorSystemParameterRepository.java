package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorSystemParameterEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ConfiguratorSystemParameterRepository extends JpaRepository<ConfiguratorSystemParameterEntity, UUID> {
    Optional<ConfiguratorSystemParameterEntity> findByUserIdAndCompanyId(UUID userId, UUID companyId);
}
