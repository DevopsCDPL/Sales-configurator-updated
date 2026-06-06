package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "vendors")
public class VendorEntity {
    @Id
    private UUID id;

    @Column(name = "vendor_name")
    private String vendorName;

    private String address;

    @Column(name = "contact_person")
    private String contactPerson;

    @Column(name = "contact_position")
    private String contactPosition;

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(name = "contact_phone")
    private String contactPhone;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "service_categories", columnDefinition = "text[]")
    private String[] serviceCategories;

    @Column(precision = 10, scale = 2)
    private BigDecimal rating;

    @Column(name = "tax_id")
    private String taxId;

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
