package com.forge.auth.repository;

import com.forge.auth.entity.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, UUID> {

    long countByCompanyIdAndActionContainingIgnoreCaseAndCreatedAtAfter(
            UUID companyId, String action, Instant after);

    List<AuditLogEntity> findTop50ByPerformedByOrderByCreatedAtDesc(UUID performedBy);
}
