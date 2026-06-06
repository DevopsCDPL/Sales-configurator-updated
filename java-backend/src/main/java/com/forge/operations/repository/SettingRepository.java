// package com.forge.operations.repository;

// import java.util.Optional;
// import java.util.UUID;

// import org.springframework.data.jpa.repository.JpaRepository;

// import com.forge.operations.entity.SettingsEntity;

// public interface SettingRepository extends JpaRepository<SettingsEntity, UUID> {
//     Optional<SettingsEntity> findByKeyAndCompanyId(String key, UUID companyId);

//     Optional<SettingsEntity> findByKeyAndCompanyIdIsNull(String key);
// }
