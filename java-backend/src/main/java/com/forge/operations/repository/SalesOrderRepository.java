package com.forge.operations.repository;

import com.forge.operations.entity.SalesOrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SalesOrderRepository extends JpaRepository<SalesOrderEntity, UUID> {
    Optional<SalesOrderEntity> findByProjectId(UUID projectId);
    boolean existsByProjectId(UUID projectId);
    Optional<SalesOrderEntity> findBySalesOrderNumber(String salesOrderNumber);

    @Query("SELECT s.salesOrderNumber FROM SalesOrderEntity s WHERE s.salesOrderNumber LIKE :prefix%")
    List<String> findSalesOrderNumbersByPrefix(@Param("prefix") String prefix);
}
