package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "carriers")
public class CarrierEntity {

    @Id
    private UUID id;

    @Column(name = "carrier", nullable = false, unique = true)
    private String carrier;
}
