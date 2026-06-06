package com.forge.auth.repository;

import com.forge.auth.entity.SettingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SettingRepository extends JpaRepository<SettingEntity, UUID> {
    Optional<SettingEntity> findByKey(String key);

    Optional<SettingEntity> findByKeyAndCompanyId(String key, UUID companyId);

    Optional<SettingEntity> findByKeyAndCompanyIdIsNull(String key);
}
