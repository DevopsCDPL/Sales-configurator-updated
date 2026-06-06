package com.forge.auth.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AuthUserDto(
        UUID id,
        String name,
        String email,
        String role,
        Boolean isActive,
        Boolean isCoAdmin,
        Boolean isOwner,
        String phone,
        String position,
        Map<String, Object> modulePermissions,
        String companyName,
        UUID companyId,
        UUID createdBy,
        Boolean twoFactorEnabled,
        Boolean forcePasswordReset,
        String subscriptionStatus,
        String userId,
        Instant lastLogin,
        String avatar,
        String gender
) {
}
