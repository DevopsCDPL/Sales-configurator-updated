package com.forge.operations.repository;

import com.forge.operations.entity.StockEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StockRepository extends JpaRepository<StockEntity, UUID>, JpaSpecificationExecutor<StockEntity> {
    Optional<StockEntity> findByRawMaterialId(UUID rawMaterialId);

    List<StockEntity> findByRawMaterialIdAndQuantityGreaterThan(UUID rawMaterialId, Double quantity);

    @Query("SELECT s FROM StockEntity s WHERE s.quantity > 0")
    List<StockEntity> findAllWithPositiveQuantity();

    @Query("SELECT s FROM StockEntity s WHERE s.quantity > 0 AND s.companyId = :companyId")
    List<StockEntity> findAllWithPositiveQuantityByCompanyId(UUID companyId);

    Optional<StockEntity> findFirstByPartDescriptionIgnoreCaseAndMaterialGradeIgnoreCaseAndCompanyId(
            String partDescription, String materialGrade, UUID companyId);

    Optional<StockEntity> findFirstByMaterialGradeIgnoreCaseAndCompanyId(String materialGrade, UUID companyId);
}
