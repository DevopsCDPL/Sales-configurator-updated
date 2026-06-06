package com.forge.shared.security;

import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final Set<String> PUBLIC_AUTH_POST_PATHS = Set.of(
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/verify-2fa",
            "/api/auth/refresh",
            "/api/auth/contact-admin",
            "/api/auth/unlock-admin",
            "/api/auth/forgot-password",
            "/api/auth/reset-password"
    );

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   UserRepository userRepository,
                                   SessionRepository sessionRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if ("/actuator/health".equals(path) || path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui/")) {
            return true;
        }
        if (HttpMethod.GET.matches(request.getMethod()) && "/api/quotation/health".equals(path)) {
            return true;
        }
        return HttpMethod.POST.matches(request.getMethod()) && PUBLIC_AUTH_POST_PATHS.contains(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7).trim();
        if (!StringUtils.hasText(token)) {
            unauthorized(response, "Invalid token.");
            return;
        }

        try {
            Claims claims = jwtService.parseToken(token);
            String userIdRaw = (String) claims.get("userId");
            if (!StringUtils.hasText(userIdRaw)) {
                unauthorized(response, "Invalid token.");
                return;
            }

            UUID userId = UUID.fromString(userIdRaw);
            Optional<UserEntity> userOpt = userRepository.findById(userId);
            if (userOpt.isEmpty() || !Boolean.TRUE.equals(userOpt.get().getIsActive())) {
                unauthorized(response, "User not found or inactive.");
                return;
            }

            String tokenHash = sha256(token);
            Optional<SessionEntity> sessionOpt = sessionRepository.findByTokenHashAndIsActiveTrue(tokenHash);
            if (sessionOpt.isEmpty()) {
                unauthorized(response, "Session expired or revoked. Please login again.");
                return;
            }

            SessionEntity session = sessionOpt.get();
            try {
                session.setLastActivityAt(java.time.Instant.now());
                sessionRepository.save(session);
            } catch (Exception ignored) {
                // Non-blocking parity with Node middleware: request auth should not fail
                // when only session last_activity update fails.
            }

            UserEntity user = userOpt.get();
            AuthenticatedUser principal = new AuthenticatedUser(
                    user.getId(),
                    user.getEmail(),
                    user.getRole(),
                    user.getCompanyId(),
                    user.getCompanyName(),
                    user.getModulePermissions() == null ? Map.of() : user.getModulePermissions()
            );

            UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                    principal,
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().toUpperCase()))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (ExpiredJwtException ex) {
            SecurityContextHolder.clearContext();
            unauthorized(response, "Token has expired. Please login again.");
            return;
        } catch (JwtException | IllegalArgumentException ex) {
            SecurityContextHolder.clearContext();
            unauthorized(response, "Invalid token.");
            return;
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            internalError(response, "Authentication error.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void unauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"success\":false,\"message\":\"" + escapeJson(message) + "\"}");
    }

    private void internalError(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"success\":false,\"message\":\"" + escapeJson(message) + "\"}");
    }

    private String escapeJson(String text) {
        return text == null ? "" : text.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to hash token", e);
        }
    }
}
