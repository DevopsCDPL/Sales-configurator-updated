package com.forge.auth.api;

import com.forge.auth.dto.*;
import com.forge.auth.service.AuthService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final long refreshTokenDays;
    private final boolean productionCookies;

    public AuthController(AuthService authService,
                          @Value("${app.security.refresh-token-days:30}") long refreshTokenDays,
                          @Value("${NODE_ENV:}") String nodeEnv) {
        this.authService = authService;
        this.refreshTokenDays = refreshTokenDays;
        this.productionCookies = "production".equalsIgnoreCase(nodeEnv == null ? "" : nodeEnv.trim());
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        AuthResult result = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiEnvelope.success(toLoginBody(result)));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        AuthResult result = authService.login(request.email(), request.password(), toMeta(servletRequest));
        if (result.requires2FA()) {
            return ResponseEntity.ok(ApiEnvelope.success(Map.of(
                    "requires2FA", true,
                    "userId", result.userId()
            )));
        }

        ResponseCookie refreshCookie = refreshCookie(result.refreshToken());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiEnvelope.success(toLoginBody(result)));
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verifyTwoFactor(@Valid @RequestBody VerifyOtpRequest request,
                                             HttpServletRequest servletRequest) {
        AuthResult result = authService.verifyOtp(request.userId(), request.otp(), toMeta(servletRequest));
        ResponseCookie refreshCookie = refreshCookie(result.refreshToken());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiEnvelope.success(toLoginBody(result)));
    }

    @GetMapping({"/profile", "/me"})
    public ResponseEntity<?> profile(Authentication authentication) {
        AuthenticatedUser principal = requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(authService.getProfile(principal.id())));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                            Authentication authentication) {
        AuthenticatedUser principal = requirePrincipal(authentication);
        authService.changePassword(principal.id(), request.currentPassword(), request.newPassword());
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("message", "Password changed successfully")));
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@CookieValue(value = "refreshToken", required = false) String refreshToken) {
        try {
            TokenRefreshResult refreshed = authService.verifyRefreshToken(refreshToken);
            return ResponseEntity.ok(ApiEnvelope.success(refreshed));
        } catch (ApiException ex) {
            if (ex.getStatus() == HttpStatus.UNAUTHORIZED) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                        .body(ApiEnvelope.error(ex.getMessage()));
            }
            throw ex;
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(Authentication authentication,
                                    @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authHeader) {
        UUID revokedBy = null;
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            revokedBy = user.id();
        }

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            authService.revokeByAccessToken(authHeader.substring(7), revokedBy);
        }

        ResponseCookie clearCookie = clearRefreshCookie();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearCookie.toString())
                .body(ApiEnvelope.success(Map.of("message", "Logged out successfully.")));
    }

    @PostMapping("/contact-admin")
    public ResponseEntity<?> contactAdmin(@Valid @RequestBody ContactAdminRequest request) {
        String email = authService.resolveContactAdmin(request.email());
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("contactEmail", email)));
    }

    @PostMapping("/unlock-admin")
    public ResponseEntity<?> unlockAdmin(@RequestBody Map<String, String> body) {
        String email = authService.unlockAdmin(body.get("secret"));
        return ResponseEntity.ok(ApiEnvelope.success(Map.of(
                "email", email,
                "message", "Admin account unlocked successfully"
        )));
    }

    private AuthService.RequestMeta toMeta(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        String device = userAgent != null && userAgent.toLowerCase().contains("mobile") ? "mobile" : "desktop";
        String ip = request.getRemoteAddr();
        return new AuthService.RequestMeta(ip, userAgent, device, null);
    }

    private Map<String, Object> toLoginBody(AuthResult result) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", result.user());
        body.put("token", result.token());
        return body;
    }

    private AuthenticatedUser requirePrincipal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return principal;
    }

    private ResponseCookie refreshCookie(String value) {
        return ResponseCookie.from("refreshToken", value)
                .httpOnly(true)
                .secure(productionCookies)
                .sameSite(productionCookies ? "None" : "Lax")
                .maxAge(refreshTokenDays * 24 * 60 * 60)
                .path("/")
                .build();
    }

    private ResponseCookie clearRefreshCookie() {
        return ResponseCookie.from("refreshToken", "")
                .httpOnly(true)
                .secure(productionCookies)
                .sameSite(productionCookies ? "None" : "Lax")
                .maxAge(0)
                .path("/")
                .build();
    }
}
