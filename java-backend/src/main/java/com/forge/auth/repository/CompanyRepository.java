package com.forge.auth.repository;

import com.forge.auth.entity.CompanyEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyRepository extends JpaRepository<CompanyEntity, UUID> {

    List<CompanyEntity> findByIsActiveTrue();

    long countByIsActiveTrue();

    Optional<CompanyEntity> findByEmailIgnoreCase(String email);

    @Transactional
    @Modifying
    @Query("UPDATE CompanyEntity c SET c.subscriptionStatus = 'expired', c.updatedAt = :now " +
           "WHERE c.subscriptionEndDate < :today AND c.subscriptionStatus = 'active' AND c.deletedAt IS NULL")
    int markExpiredSubscriptions(@Param("today") LocalDate today, @Param("now") Instant now);

    @Query("SELECT c FROM CompanyEntity c WHERE c.deletedAt IS NULL AND c.isActive = true " +
           "AND c.subscriptionStatus = 'active' AND c.subscriptionEndDate BETWEEN :from AND :to")
    List<CompanyEntity> findExpiringSoon(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query(value = "SELECT company_code FROM companies " +
                   "WHERE company_code ~ '^CMP-[0-9]+$' " +
                   "ORDER BY LENGTH(company_code) DESC, company_code DESC " +
                   "LIMIT 1",
           nativeQuery = true)
    Optional<String> findLastCompanyCode();
}
