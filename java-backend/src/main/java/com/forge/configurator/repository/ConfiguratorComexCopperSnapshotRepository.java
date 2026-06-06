package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorComexCopperSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface ConfiguratorComexCopperSnapshotRepository extends JpaRepository<ConfiguratorComexCopperSnapshotEntity, UUID> {
    Optional<ConfiguratorComexCopperSnapshotEntity> findByCompanyIdAndCapturedOn(UUID companyId, LocalDate capturedOn);
}
