package com.forge.auth.dto;

import java.util.UUID;

public record AuthResult(
        boolean requires2FA,
        UUID userId,
        AuthUserDto user,
        String token,
        String refreshToken
) {
    public static AuthResult requires2fa(UUID userId) {
        return new AuthResult(true, userId, null, null, null);
    }

    public static AuthResult authenticated(AuthUserDto user, String token, String refreshToken) {
        return new AuthResult(false, null, user, token, refreshToken);
    }
}
