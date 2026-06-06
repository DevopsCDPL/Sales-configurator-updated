package com.forge.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "role", columnDefinition = "enum_users_role", nullable = false, length = 30)
    @ColumnTransformer(write = "?::enum_users_role")
    private String role;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    private String phone;

    private String position;

    @Column(name = "is_active")
    private Boolean isActive;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "json")
    private List<String> modules;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "module_permissions", columnDefinition = "jsonb")
    private Map<String, Object> modulePermissions;

    @Column(name = "last_login")
    private Instant lastLogin;

    private String department;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<Object> tags;

    @Column(name = "last_login_ip")
    private String lastLoginIp;

    @Column(name = "last_login_device")
    private String lastLoginDevice;

    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "two_factor_enabled")
    private Boolean twoFactorEnabled;

    @Column(name = "otp_code")
    private String otpCode;

    @Column(name = "otp_expires_at")
    private Instant otpExpiresAt;

    @Column(name = "otp_attempts")
    private Integer otpAttempts;

    @Column(name = "force_password_reset")
    private Boolean forcePasswordReset;

    @Column(name = "user_id")
    private String userId;

    private String avatar;

    private String gender;

    @Column(name = "reset_token")
    private String resetToken;

    @Column(name = "reset_token_expiry")
    private Instant resetTokenExpiry;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "invited_at")
    private Instant invitedAt;

    /** Maps to enum_users_invite_status: pending / accepted / expired */
    @Column(name = "invite_status")
    private String inviteStatus;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "custom_role_id")
    private UUID customRoleId;
}
