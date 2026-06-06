package com.forge.shared.security;

import java.util.Map;
import java.util.UUID;

public record AuthenticatedUser(
        UUID id,
        String email,
        String role,
        UUID companyId,
        String companyName,
        Map<String, Object> modulePermissions
) {
}
