package com.forge.configurator.repository;

import com.forge.configurator.entity.ConfiguratorQuotationItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ConfiguratorQuotationItemRepository extends JpaRepository<ConfiguratorQuotationItemEntity, UUID> {
    List<ConfiguratorQuotationItemEntity> findByQuotationIdOrderByLineNoAsc(UUID quotationId);

    void deleteByQuotationId(UUID quotationId);
}
