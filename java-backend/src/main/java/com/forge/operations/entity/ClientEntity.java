package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "clients")
public class ClientEntity {
    @Id
    private UUID id;

    @Column(name = "client_name")
    private String clientName;

    private String address;

    @Column(name = "poc_name")
    private String pocName;

    @Column(name = "poc_email")
    private String pocEmail;

    @Column(name = "poc_phone")
    private String pocPhone;

    @Column(name = "tax_id")
    private String taxId;

    @Column(name = "payment_terms")
    private String paymentTerms;

    private String position;

    private String notes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cc_list", columnDefinition = "jsonb")
    private List<Map<String, Object>> ccList;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
