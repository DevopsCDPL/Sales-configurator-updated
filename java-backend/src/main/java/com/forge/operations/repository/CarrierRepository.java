package com.forge.operations.repository;

import com.forge.operations.entity.CarrierEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CarrierRepository extends JpaRepository<CarrierEntity, UUID> {
}
