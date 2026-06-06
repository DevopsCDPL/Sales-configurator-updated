package com.forge.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "companies")
public class CompanyEntity {
    @Id
    private UUID id;

    private String name;

    private String email;

    @Column(name = "subscription_status")
    private String subscriptionStatus;

    /** Maps to the 'plan' column (free/starter/premium/professional/enterprise) */
    @Column(name = "plan")
    private String subscriptionPlan;

    @Column(name = "company_code")
    private String companyCode;

    @Column(name = "subscription_start_date")
    private LocalDate subscriptionStartDate;

    @Column(name = "subscription_end_date")
    private LocalDate subscriptionEndDate;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "last_activity_at")
    private Instant lastActivityAt;

    @Column(name = "suspended_at")
    private Instant suspendedAt;

    @Column(name = "suspension_reason", columnDefinition = "TEXT")
    private String suspensionReason;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    private String address;
    private String phone;
    private String website;

    @Column(name = "tax_id")
    private String taxId;

    @Column(name = "logo_url", columnDefinition = "TEXT")
    private String logoUrl;

    @Column(name = "logo_data", columnDefinition = "TEXT")
    private String logoData;

    @Column(name = "user_limit")
    private Integer userLimit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "risk_flags", columnDefinition = "jsonb")
    private List<Object> riskFlags;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "settings", columnDefinition = "jsonb")
    private Map<String, Object> settings;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ip_whitelist", columnDefinition = "jsonb")
    private List<Object> ipWhitelist;

    @Column(name = "storage_used_mb")
    private Double storageUsedMb;
}
