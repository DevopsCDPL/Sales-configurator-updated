package com.forge.operations.repository;

import com.forge.operations.entity.MgmtProcurementRfqEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MgmtProcurementRfqRepository
        extends JpaRepository<MgmtProcurementRfqEntity, UUID>,
                JpaSpecificationExecutor<MgmtProcurementRfqEntity> {

    @Query("SELECT r FROM MgmtProcurementRfqEntity r WHERE r.id = :id AND r.deletedAt IS NULL")
    Optional<MgmtProcurementRfqEntity> findActiveById(UUID id);

    @Query("SELECT r FROM MgmtProcurementRfqEntity r WHERE r.deletedAt IS NULL AND r.companyId = :companyId ORDER BY r.createdAt DESC")
    List<MgmtProcurementRfqEntity> findAllActiveByCompany(UUID companyId);

    @Query("SELECT r FROM MgmtProcurementRfqEntity r WHERE r.deletedAt IS NULL ORDER BY r.createdAt DESC")
    List<MgmtProcurementRfqEntity> findAllActive();

    @Query("SELECT r FROM MgmtProcurementRfqEntity r WHERE r.deletedAt IS NULL AND r.companyId = :companyId AND r.status = 'Sent' ORDER BY r.createdAt DESC")
    List<MgmtProcurementRfqEntity> findSentByCompany(UUID companyId);

    @Query("SELECT r FROM MgmtProcurementRfqEntity r WHERE r.deletedAt IS NULL AND r.status = 'Sent' ORDER BY r.createdAt DESC")
    List<MgmtProcurementRfqEntity> findAllSent();

    @Transactional
    @Modifying
    @Query("UPDATE MgmtProcurementRfqEntity r SET r.deletedAt = CURRENT_TIMESTAMP, r.deletedBy = :deletedBy WHERE r.id IN :ids AND r.deletedAt IS NULL")
    int softDeleteByIdIn(List<UUID> ids, UUID deletedBy);
}
