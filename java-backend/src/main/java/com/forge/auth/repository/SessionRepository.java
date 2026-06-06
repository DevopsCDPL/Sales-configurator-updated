package com.forge.auth.repository;

import com.forge.auth.entity.SessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<SessionEntity, UUID> {
    Optional<SessionEntity> findByTokenHashAndIsActiveTrue(String tokenHash);

    Optional<SessionEntity> findByRefreshTokenHashAndIsActiveTrue(String refreshTokenHash);

    long countByUserIdAndIsActiveTrueAndExpiresAtAfter(UUID userId, Instant expiresAfter);
}
