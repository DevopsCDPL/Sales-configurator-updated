package com.forge.auth.api;

import com.forge.auth.dto.AuthUserDto;
import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.auth.service.AuthService;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.JwtAuthenticationFilter;
import com.forge.shared.security.JwtService;
import com.forge.shared.security.SecurityConfig;
import com.forge.shared.tenant.TenantContextFilter;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        TenantContextFilter.class,
        JwtService.class,
})
@TestPropertySource(properties = {
        "app.security.jwt-secret=test-jwt-secret-for-auth-security-tests-123456",
        "app.security.access-token-expiry=1h",
        "app.security.refresh-token-days=30",
        "NODE_ENV=development",
})
class AuthSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private AuthService authService;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private SessionRepository sessionRepository;

    @Test
    void profileWithoutTokenReturnsNodeParity401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Authentication required. Please provide a valid token."));
    }

    @Test
    void profileWithInvalidTokenReturnsNodeParity401() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer not-a-valid-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Invalid token."));
    }

    @Test
    void profileWithExpiredTokenReturnsNodeParity401() throws Exception {
        String expiredToken = expiredToken(UUID.randomUUID());

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + expiredToken))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Token has expired. Please login again."));
    }

    @Test
    void profileWithRevokedSessionReturnsNodeParity401() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        UserEntity user = activeUser(userId, "user", UUID.randomUUID(), true);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token))).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Session expired or revoked. Please login again."));
    }

    @Test
    void profileWithInactiveUserReturnsNodeParity401() throws Exception {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);
        UserEntity user = activeUser(userId, "user", UUID.randomUUID(), false);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("User not found or inactive."));
    }

    @Test
    void profileWithValidTokenAndSessionReturnsSuccess() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        UserEntity user = activeUser(userId, "user", companyId, true);
        SessionEntity session = activeSession(userId, sha256(token));
        AuthUserDto profile = new AuthUserDto(
                userId,
                "User",
                "user@forge.test",
                "user",
                true,
                false,
                false,
                null,
                null,
                Map.of(),
                "Forge Co",
                companyId,
                null,
                false,
                false,
                null,
                "1234567890",
                null,
                null,
                null
        );

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token))).thenReturn(Optional.of(session));
        when(sessionRepository.save(any(SessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authService.getProfile(eq(userId))).thenReturn(profile);

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(userId.toString()));
    }

        @Test
        void profileAliasStillWorksForLegacyFrontendPaths() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        String token = jwtService.generateAccessToken(userId);

        UserEntity user = activeUser(userId, "user", companyId, true);
        SessionEntity session = activeSession(userId, sha256(token));
        AuthUserDto profile = new AuthUserDto(
            userId,
            "User",
            "user@forge.test",
            "user",
            true,
            false,
            false,
            null,
            null,
            Map.of(),
            "Forge Co",
            companyId,
            null,
            false,
            false,
            null,
            "1234567890",
            null,
            null,
            null
        );

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(sessionRepository.findByTokenHashAndIsActiveTrue(sha256(token))).thenReturn(Optional.of(session));
        when(sessionRepository.save(any(SessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authService.getProfile(eq(userId))).thenReturn(profile);

        mockMvc.perform(get("/api/auth/profile")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.id").value(userId.toString()));
        }

    @Test
    void refreshInvalidTokenClearsCookieLikeNodeController() throws Exception {
        when(authService.verifyRefreshToken(any())).thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", "stale-token"))
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Invalid refresh token"))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("refreshToken=")))
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
    }

    private UserEntity activeUser(UUID id, String role, UUID companyId, boolean active) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setName("User");
        user.setEmail("user@forge.test");
        user.setRole(role);
        user.setCompanyId(companyId);
        user.setCompanyName("Forge Co");
        user.setIsActive(active);
        user.setModulePermissions(Map.of());
        return user;
    }

    private SessionEntity activeSession(UUID userId, String tokenHash) {
        SessionEntity session = new SessionEntity();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setTokenHash(tokenHash);
        session.setIsActive(true);
        session.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        session.setCreatedAt(Instant.now());
        session.setUpdatedAt(Instant.now());
        return session;
    }

    private String expiredToken(UUID userId) {
        byte[] bytes = "test-jwt-secret-for-auth-security-tests-123456".getBytes(StandardCharsets.UTF_8);
        SecretKey key = Keys.hmacShaKeyFor(bytes);
        Instant now = Instant.now();
        return Jwts.builder()
                .claims(Map.of("userId", userId.toString()))
                .issuedAt(Date.from(now.minus(2, ChronoUnit.HOURS)))
                .expiration(Date.from(now.minus(1, ChronoUnit.HOURS)))
                .signWith(key)
                .compact();
    }

    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
