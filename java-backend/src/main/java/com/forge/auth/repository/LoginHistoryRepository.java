package com.forge.auth.repository;

import com.forge.auth.entity.LoginHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface LoginHistoryRepository extends JpaRepository<LoginHistoryEntity, UUID> {

    long countByCompanyIdAndStatusAndCreatedAtAfter(UUID companyId, String status, Instant after);

    List<LoginHistoryEntity> findTop50ByUserIdOrderByCreatedAtDesc(UUID userId);
}
