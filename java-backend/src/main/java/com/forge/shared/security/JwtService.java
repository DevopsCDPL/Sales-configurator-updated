package com.forge.shared.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

@Service
public class JwtService {
    private final SecretKey key;
    private final SecretKey refreshKey;
    private final Duration accessTokenDuration;
    private final Duration refreshTokenDuration;
    private final SecureRandom secureRandom = new SecureRandom();

    public JwtService(@Value("${app.security.jwt-secret}") String jwtSecret,
                      @Value("${app.security.jwt-refresh-secret:${app.security.jwt-secret}}") String refershJwtSecret,
                      @Value("${app.security.access-token-expiry:1h}") String accessTokenExpiry,
                      @Value("${app.security.refresh-token-expiry:30d}") String refreshTokenExpiry
                    ) {
        byte[] secretBytes = jwtSecret.getBytes(StandardCharsets.UTF_8);
        if (secretBytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(secretBytes, 0, padded, 0, Math.min(secretBytes.length, 32));
            secretBytes = padded;
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
        this.accessTokenDuration = parseDuration(accessTokenExpiry);

        byte[] refreshSecretBytes = refershJwtSecret.getBytes(StandardCharsets.UTF_8);
        if (refreshSecretBytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(refreshSecretBytes, 0, padded, 0, Math.min(refreshSecretBytes.length, 32));
            refreshSecretBytes = padded;
        }
        this.refreshKey = Keys.hmacShaKeyFor(refreshSecretBytes);
        this.refreshTokenDuration = parseDuration(refreshTokenExpiry);
    }

    public String generateAccessToken(UUID userId) {
        Instant now = Instant.now();
        Instant exp = now.plus(accessTokenDuration);
        return Jwts.builder()
                .claims(Map.of("userId", userId.toString()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String generateRefreshToken(UUID userId) {
        Instant now = Instant.now();
        Instant exp = now.plus(refreshTokenDuration);
        return Jwts.builder()
                .claims(Map.of("userId", userId.toString()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(refreshKey)
                .compact();
    }

    public Claims parseRefreshToken(String token) {
        return Jwts.parser()
                .verifyWith(refreshKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private Duration parseDuration(String raw) {
        if (raw == null || raw.isBlank()) {
            return Duration.ofHours(1);
        }
        String value = raw.trim().toLowerCase();
        if (value.matches("^\\d+$")) {
            return Duration.ofHours(Long.parseLong(value));
        }
        if (value.endsWith("ms")) {
            return Duration.ofMillis(Long.parseLong(value.substring(0, value.length() - 2)));
        }
        if (value.endsWith("s")) {
            return Duration.ofSeconds(Long.parseLong(value.substring(0, value.length() - 1)));
        }
        if (value.endsWith("m")) {
            return Duration.ofMinutes(Long.parseLong(value.substring(0, value.length() - 1)));
        }
        if (value.endsWith("h")) {
            return Duration.ofHours(Long.parseLong(value.substring(0, value.length() - 1)));
        }
        if (value.endsWith("d")) {
            return Duration.ofDays(Long.parseLong(value.substring(0, value.length() - 1)));
        }
        return Duration.ofHours(1);
    }
}
