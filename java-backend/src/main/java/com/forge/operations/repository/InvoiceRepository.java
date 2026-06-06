package com.forge.operations.repository;

import com.forge.operations.entity.InvoiceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<InvoiceEntity, UUID> {

    List<InvoiceEntity> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId);

    List<InvoiceEntity> findAllByCompanyIdOrderByCreatedAtDesc(UUID companyId);

    boolean existsByInvoiceNumberAndCompanyId(String invoiceNumber, UUID companyId);

    boolean existsByInvoiceNumber(String invoiceNumber);
}
