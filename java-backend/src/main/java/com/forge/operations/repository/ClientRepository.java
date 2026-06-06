package com.forge.operations.repository;

import com.forge.operations.entity.ClientEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;
import java.util.UUID;

public interface ClientRepository extends JpaRepository<ClientEntity, UUID>, JpaSpecificationExecutor<ClientEntity> {
    Optional<ClientEntity> findByIdAndDeletedAtIsNull(UUID id);

    Optional<ClientEntity> findByIdAndCompanyIdAndDeletedAtIsNull(UUID id, UUID companyId);
}
