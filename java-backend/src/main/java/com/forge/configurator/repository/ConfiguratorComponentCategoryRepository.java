package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorComponentCategoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConfiguratorComponentCategoryRepository extends JpaRepository<ConfiguratorComponentCategoryEntity, UUID> {
    Optional<ConfiguratorComponentCategoryEntity> findByNormalizedNameAndCompanyId(String normalizedName, UUID companyId);

    List<ConfiguratorComponentCategoryEntity> findByCompanyIdOrderByNameAsc(UUID companyId);
}
