package com.forge.operations.repository;

import com.forge.operations.entity.MgmtProcurementPoEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MgmtProcurementPoRepository
        extends JpaRepository<MgmtProcurementPoEntity, UUID>,
                JpaSpecificationExecutor<MgmtProcurementPoEntity> {

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.id = :id AND p.deletedAt IS NULL")
    Optional<MgmtProcurementPoEntity> findActiveById(UUID id);

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.deletedAt IS NULL AND p.companyId = :companyId ORDER BY p.createdAt DESC")
    List<MgmtProcurementPoEntity> findAllActiveByCompany(UUID companyId);

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.deletedAt IS NULL ORDER BY p.createdAt DESC")
    List<MgmtProcurementPoEntity> findAllActive();

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.rfqId = :rfqId AND p.deletedAt IS NULL")
    Optional<MgmtProcurementPoEntity> findActiveByRfqId(UUID rfqId);

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.rfqId IN :rfqIds AND p.deletedAt IS NULL")
    List<MgmtProcurementPoEntity> findActiveByRfqIdIn(List<UUID> rfqIds);

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.deletedAt IS NULL AND p.companyId = :companyId AND p.status IN ('Sent','Ordered','Received') ORDER BY p.createdAt DESC")
    List<MgmtProcurementPoEntity> findPurchasedByCompany(UUID companyId);

    @Query("SELECT p FROM MgmtProcurementPoEntity p WHERE p.deletedAt IS NULL AND p.status IN ('Sent','Ordered','Received') ORDER BY p.createdAt DESC")
    List<MgmtProcurementPoEntity> findAllPurchased();
}
