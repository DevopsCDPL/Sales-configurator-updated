package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "sales_orders")
public class SalesOrderEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "sales_order_number")
    private String salesOrderNumber;

    @Column(name = "customer_po_number")
    private String customerPoNumber;

    @Column(name = "customer_po_file")
    private String customerPoFile;

    @Column(name = "accepted_date")
    private Instant acceptedDate;

    @Column(name = "delivery_date")
    private Instant deliveryDate;

    private String notes;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
