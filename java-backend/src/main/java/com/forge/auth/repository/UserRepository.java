package com.forge.auth.repository;

import com.forge.auth.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
    Optional<UserEntity> findByEmailIgnoreCase(String email);

    Optional<UserEntity> findByUserId(String userId);

    /** Native query required: role column is a Postgres enum (enum_users_role), not varchar. */
    @Query(value = "SELECT * FROM users WHERE company_id = :companyId AND role = CAST(:role AS enum_users_role) AND is_active = true ORDER BY created_at ASC LIMIT 1", nativeQuery = true)
    Optional<UserEntity> findFirstActiveOwnerByCompanyId(@Param("companyId") UUID companyId, @Param("role") String role);

    @Query(value = "SELECT * FROM users WHERE company_id = :companyId AND role IN (CAST(:role1 AS enum_users_role), CAST(:role2 AS enum_users_role)) AND is_active = true ORDER BY created_at ASC LIMIT 1", nativeQuery = true)
    Optional<UserEntity> findFirstActiveByCompanyIdAndRoles(@Param("companyId") UUID companyId, @Param("role1") String role1, @Param("role2") String role2);

    @Query(value = "SELECT COUNT(*) FROM users WHERE role = CAST(:role AS enum_users_role)", nativeQuery = true)
    long countByRole(@Param("role") String role);

    @Query(value = "SELECT * FROM users WHERE role = CAST(:role AS enum_users_role)", nativeQuery = true)
    List<UserEntity> findAllByRole(@Param("role") String role);

    long countByCompanyId(UUID companyId);

    long countByCompanyIdAndIsActiveFalse(UUID companyId);

    long countByCompanyIdAndLockedUntilAfter(UUID companyId, Instant now);

    List<UserEntity> findAllByCompanyId(UUID companyId);

    List<UserEntity> findAllByCompanyIdAndIdIn(UUID companyId, List<UUID> ids);
}
