package com.forge.auth.service;

import com.forge.auth.dto.AuthResult;
import com.forge.auth.dto.AuthUserDto;
import com.forge.auth.dto.RegisterRequest;
import com.forge.auth.dto.TokenRefreshResult;
import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.entity.SessionEntity;
import com.forge.auth.entity.SettingEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.SettingRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class AuthService {
    private static final Set<String> REAL_ROLES = Set.of("platform_admin", "main_admin", "admin", "user", "sales_engineer");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final SettingRepository settingRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final long refreshTokenDays;
    private final String configuredAdminEmail;
    private final String configuredAdminPassword;
    private final String configuredAdminName;

    public AuthService(UserRepository userRepository,
                       SessionRepository sessionRepository,
                       SettingRepository settingRepository,
                       CompanyRepository companyRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       @Value("${app.security.refresh-token-days:30}") long refreshTokenDays,
                       @Value("${ADMIN_EMAIL:admin@forgedas.com}") String configuredAdminEmail,
                       @Value("${ADMIN_PASSWORD:admin1234}") String configuredAdminPassword,
                       @Value("${ADMIN_NAME:Admin}") String configuredAdminName) {
        this.userRepository = userRepository;
        this.sessionRepository = sessionRepository;
        this.settingRepository = settingRepository;
        this.companyRepository = companyRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokenDays = refreshTokenDays;
        this.configuredAdminEmail = configuredAdminEmail == null
                ? "admin@forgedas.com"
                : configuredAdminEmail.trim().toLowerCase(Locale.ROOT);
        this.configuredAdminPassword = configuredAdminPassword == null ? "" : configuredAdminPassword;
        this.configuredAdminName = configuredAdminName == null || configuredAdminName.isBlank()
                ? "Admin"
                : configuredAdminName.trim();
    }

    @Transactional
    public AuthResult register(RegisterRequest request) {
        userRepository.findByEmailIgnoreCase(request.email())
                .ifPresent(existing -> {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "User with this email already exists");
                });

        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID());
        user.setName(request.name());
        user.setEmail(request.email().toLowerCase(Locale.ROOT));
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(sanitizeRole(request.role()));
        user.setIsActive(true);
        user.setFailedLoginAttempts(0);
        user.setTwoFactorEnabled(false);
        user.setOtpAttempts(0);
        user.setForcePasswordReset(false);
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        user.setModulePermissions(Map.of());
        userRepository.save(user);

        String token = jwtService.generateAccessToken(user.getId());
        return AuthResult.authenticated(toUserDto(user, false, false, null, null), token, null);
    }

    @Transactional
    public AuthResult login(String loginInput, String password, RequestMeta meta) {
        String trimmedInput = loginInput == null ? "" : loginInput.trim();
        String normalizedInput = trimmedInput.toLowerCase(Locale.ROOT);
        boolean canForceAdminRecovery = isConfiguredAdminCredentialLogin(normalizedInput, password);

        UserEntity user = findUserByLoginInput(trimmedInput).orElse(null);
        if (user == null && canForceAdminRecovery) {
            user = upsertConfiguredAdminAccount();
        }
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            if (canForceAdminRecovery) {
                resetForConfiguredAdminRecovery(user, false);
            } else {
                long mins = Math.max(1, ChronoUnit.MINUTES.between(Instant.now(), user.getLockedUntil()));
                throw new ApiException(HttpStatus.UNAUTHORIZED,
                        "Account is locked. Try again in " + mins + " minute" + (mins == 1 ? "" : "s") + " or contact administrator.");
            }
        }

        if (user.getDeletedAt() != null) {
            if (canForceAdminRecovery) {
                resetForConfiguredAdminRecovery(user, true);
            } else {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Account has been deleted. Please contact administrator.");
            }
        }

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            if (canForceAdminRecovery) {
                resetForConfiguredAdminRecovery(user, false);
            } else {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Account is deactivated. Please contact administrator.");
            }
        }

        boolean passwordMatches = passwordEncoder.matches(password, user.getPasswordHash());
        if (!passwordMatches && canForceAdminRecovery) {
            resetPasswordForConfiguredAdmin(user);
            passwordMatches = true;
        }

        if (!passwordMatches) {
            int attempts = (user.getFailedLoginAttempts() == null ? 0 : user.getFailedLoginAttempts()) + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= 5) {
                user.setLockedUntil(Instant.now().plus(15, ChronoUnit.MINUTES));
            }
            user.setUpdatedAt(Instant.now());
            userRepository.save(user);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }

        if (Boolean.TRUE.equals(user.getTwoFactorEnabled())) {
            String otp = randomDigits(6);
            user.setOtpCode(sha256(otp));
            user.setOtpExpiresAt(Instant.now().plus(10, ChronoUnit.MINUTES));
            user.setOtpAttempts(0);
            user.setUpdatedAt(Instant.now());
            userRepository.save(user);
            return AuthResult.requires2fa(user.getId());
        }

        return finishLogin(user, meta);
    }

    @Transactional
    public AuthResult verifyOtp(UUID userId, String otp, RequestMeta meta) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired OTP. Please login again."));

        if (!Boolean.TRUE.equals(user.getTwoFactorEnabled()) || user.getOtpCode() == null || user.getOtpExpiresAt() == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired OTP. Please login again.");
        }

        if (user.getOtpExpiresAt().isBefore(Instant.now())) {
            user.setOtpCode(null);
            user.setOtpExpiresAt(null);
            user.setOtpAttempts(0);
            userRepository.save(user);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "OTP has expired. Please login again.");
        }

        String otpHash = sha256(otp);
        if (!otpHash.equals(user.getOtpCode())) {
            int attempts = (user.getOtpAttempts() == null ? 0 : user.getOtpAttempts()) + 1;
            if (attempts >= 3) {
                user.setOtpCode(null);
                user.setOtpExpiresAt(null);
                user.setOtpAttempts(0);
                userRepository.save(user);
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Too many incorrect OTP attempts. Please login again.");
            }
            user.setOtpAttempts(attempts);
            userRepository.save(user);
            int remaining = 3 - attempts;
            throw new ApiException(HttpStatus.UNAUTHORIZED,
                    "Invalid OTP. " + remaining + " attempt" + (remaining == 1 ? "" : "s") + " remaining.");
        }

        user.setOtpCode(null);
        user.setOtpExpiresAt(null);
        user.setOtpAttempts(0);
        userRepository.save(user);
        return finishLogin(user, meta);
    }

    @Transactional(readOnly = true)
    public AuthUserDto getProfile(UUID userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        boolean isOwner = checkIsOwner(user);
        boolean isCoAdmin = checkIsCoAdmin(user);
        CompanyEntity company = resolveCompany(user.getCompanyId());
        String subscriptionStatus = resolveSubscriptionStatus(user, company);

        return toUserDto(user, isCoAdmin, isOwner, subscriptionStatus, user.getLastLogin());
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    @Transactional
    public TokenRefreshResult verifyRefreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh token required");
        }

        try {
            jwtService.parseRefreshToken(refreshToken);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
        }

        String hash = sha256(refreshToken);
        SessionEntity session = sessionRepository.findByRefreshTokenHashAndIsActiveTrue(hash)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (session.getExpiresAt().isBefore(Instant.now())) {
            session.setIsActive(false);
            session.setUpdatedAt(Instant.now());
            sessionRepository.save(session);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh token expired. Please login again.");
        }

        UserEntity user = userRepository.findById(session.getUserId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "User not found or inactive"));
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "User not found or inactive");
        }

        String newToken = jwtService.generateAccessToken(user.getId());
        session.setTokenHash(sha256(newToken));
        session.setLastActivityAt(Instant.now());
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);

        return new TokenRefreshResult(newToken);
    }

    @Transactional
    public void revokeByAccessToken(String accessToken, UUID revokedBy) {
        if (accessToken == null || accessToken.isBlank()) {
            return;
        }

        String tokenHash = sha256(accessToken);
        sessionRepository.findByTokenHashAndIsActiveTrue(tokenHash).ifPresent(session -> {
            session.setIsActive(false);
            session.setRevokedAt(Instant.now());
            session.setRevokedBy(revokedBy);
            session.setUpdatedAt(Instant.now());
            sessionRepository.save(session);
        });
    }

    @Transactional(readOnly = true)
    public String resolveContactAdmin(String email) {
        if (email == null || email.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Email is required");
        }

        Optional<UserEntity> userOpt = userRepository.findByEmailIgnoreCase(email);
        if (userOpt.isEmpty()) {
            return findMainAdminEmail();
        }

        UserEntity user = userOpt.get();
        if ("main_admin".equals(user.getRole()) || "admin".equals(user.getRole())) {
            CompanyEntity company = resolveCompany(user.getCompanyId());
            if (company != null && company.getEmail() != null && !company.getEmail().isBlank()) {
                return company.getEmail();
            }
            return findMainAdminEmail();
        }

        if (user.getCreatedBy() != null) {
            Optional<UserEntity> creator = userRepository.findById(user.getCreatedBy());
            if (creator.isPresent() && Boolean.TRUE.equals(creator.get().getIsActive()) && creator.get().getEmail() != null) {
                return creator.get().getEmail();
            }
        }

        if (user.getCompanyId() != null) {
            Optional<UserEntity> companyAdmin = userRepository
                    .findFirstActiveByCompanyIdAndRoles(
                            user.getCompanyId(),
                            "main_admin", "admin"
                    );
            if (companyAdmin.isPresent() && companyAdmin.get().getEmail() != null && !companyAdmin.get().getEmail().isBlank()) {
                return companyAdmin.get().getEmail();
            }
        }

        CompanyEntity company = resolveCompany(user.getCompanyId());
        if (company != null && company.getEmail() != null && !company.getEmail().isBlank()) {
            return company.getEmail();
        }

        return findMainAdminEmail();
    }

    @Transactional
    public String unlockAdmin(String secret) {
        String expectedSecret = System.getenv("ADMIN_UNLOCK_SECRET");
        if (expectedSecret == null || expectedSecret.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Admin unlock is not configured on this server");
        }
        if (secret == null || !expectedSecret.equals(secret)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Invalid unlock secret");
        }

        UserEntity admin = userRepository.findByEmailIgnoreCase(configuredAdminEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Admin account not found"));

        admin.setFailedLoginAttempts(0);
        admin.setLockedUntil(null);
        admin.setIsActive(true);
        admin.setUpdatedAt(Instant.now());
        userRepository.save(admin);

        return admin.getEmail();
    }

    private boolean isConfiguredAdminCredentialLogin(String normalizedLogin, String password) {
        if (normalizedLogin == null || normalizedLogin.isBlank()) {
            return false;
        }
        if (configuredAdminPassword == null || configuredAdminPassword.isBlank()) {
            return false;
        }
        return configuredAdminEmail.equals(normalizedLogin)
                && configuredAdminPassword.equals(password);
    }

    private UserEntity upsertConfiguredAdminAccount() {
        Instant now = Instant.now();
        UserEntity admin = userRepository.findByEmailIgnoreCase(configuredAdminEmail).orElseGet(() -> {
            UserEntity created = new UserEntity();
            created.setId(UUID.randomUUID());
            created.setCreatedAt(now);
            created.setEmail(configuredAdminEmail);
            created.setName(configuredAdminName);
            created.setRole("main_admin");
            created.setModulePermissions(Map.of());
            return created;
        });

        if (admin.getName() == null || admin.getName().isBlank()) {
            admin.setName(configuredAdminName);
        }
        admin.setPasswordHash(passwordEncoder.encode(configuredAdminPassword));
        admin.setRole("main_admin");
        admin.setIsActive(true);
        admin.setFailedLoginAttempts(0);
        admin.setLockedUntil(null);
        admin.setDeletedAt(null);
        admin.setUpdatedAt(now);
        if (admin.getTwoFactorEnabled() == null) {
            admin.setTwoFactorEnabled(false);
        }
        if (admin.getOtpAttempts() == null) {
            admin.setOtpAttempts(0);
        }
        if (admin.getForcePasswordReset() == null) {
            admin.setForcePasswordReset(false);
        }

        return userRepository.save(admin);
    }

    private void resetForConfiguredAdminRecovery(UserEntity user, boolean clearDeletedAt) {
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setIsActive(true);
        if (clearDeletedAt) {
            user.setDeletedAt(null);
        }
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    private void resetPasswordForConfiguredAdmin(UserEntity user) {
        user.setPasswordHash(passwordEncoder.encode(configuredAdminPassword));
        user.setIsActive(true);
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setDeletedAt(null);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    private Optional<UserEntity> findUserByLoginInput(String input) {
        if (input == null) {
            return Optional.empty();
        }
        String trimmed = input.trim();
        if (trimmed.matches("^\\d+$")) {
            Optional<UserEntity> byUserId = userRepository.findByUserId(trimmed);
            if (byUserId.isPresent()) {
                return byUserId;
            }
        }
        return userRepository.findByEmailIgnoreCase(trimmed);
    }

    private AuthResult finishLogin(UserEntity user, RequestMeta meta) {
        Instant now = Instant.now();
        Instant previousLastLogin = user.getLastLogin();

        if (user.getUserId() == null || user.getUserId().isBlank()) {
            user.setUserId(generateUniqueNumericUserId());
        }

        user.setLastLogin(now);
        user.setLastLoginIp(meta.ip());
        user.setLastLoginDevice(meta.userAgent());
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setUpdatedAt(now);
        userRepository.save(user);

        CompanyEntity company = resolveCompany(user.getCompanyId());
        if (company != null) {
            if (Boolean.FALSE.equals(company.getIsActive())) {
                throw new ApiException(HttpStatus.FORBIDDEN,
                        "Your company account has been deactivated. Please contact the platform administrator.");
            }
            company.setLastActivityAt(now);
            companyRepository.save(company);
        }

        String token = jwtService.generateAccessToken(user.getId());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        SessionEntity session = new SessionEntity();
        session.setId(UUID.randomUUID());
        session.setUserId(user.getId());
        session.setTokenHash(sha256(token));
        session.setRefreshTokenHash(sha256(refreshToken));
        session.setIpAddress(meta.ip());
        session.setUserAgent(meta.userAgent());
        session.setDevice(meta.device());
        session.setLocation(meta.location());
        session.setIsActive(true);
        session.setLastActivityAt(now);
        session.setExpiresAt(now.plus(refreshTokenDays, ChronoUnit.DAYS));
        session.setCompanyId(user.getCompanyId());
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        sessionRepository.save(session);

        boolean isOwner = checkIsOwner(user);
        boolean isCoAdmin = checkIsCoAdmin(user);
        String subscriptionStatus = resolveSubscriptionStatus(user, company);

        AuthUserDto userDto = toUserDto(user, isCoAdmin, isOwner, subscriptionStatus, previousLastLogin);
        return AuthResult.authenticated(userDto, token, refreshToken);
    }

    private AuthUserDto toUserDto(UserEntity user,
                                  boolean isCoAdmin,
                                  boolean isOwner,
                                  String subscriptionStatus,
                                  Instant previousLastLogin) {
        return new AuthUserDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.getIsActive(),
                isCoAdmin,
                isOwner,
                user.getPhone(),
                user.getPosition(),
                user.getModulePermissions() == null ? Map.of() : user.getModulePermissions(),
                user.getCompanyName(),
                user.getCompanyId(),
                user.getCreatedBy(),
                user.getTwoFactorEnabled(),
                user.getForcePasswordReset(),
                subscriptionStatus,
                user.getUserId(),
                previousLastLogin,
                user.getAvatar(),
                user.getGender()
        );
    }

    private boolean checkIsOwner(UserEntity user) {
        if (user == null || !"main_admin".equals(user.getRole())) {
            return false;
        }

        Optional<SettingEntity> scoped = user.getCompanyId() == null
                ? Optional.empty()
                : settingRepository.findByKeyAndCompanyId("co_admin_assignments:" + user.getCompanyId(), user.getCompanyId());
        Optional<SettingEntity> global = settingRepository.findByKey("co_admin_assignments");
        Map<String, Object> assignments = scoped.or(() -> global).map(SettingEntity::getValue).orElse(null);

        if (assignments == null || !(assignments.get("owner") instanceof Map<?, ?> ownerMap)) {
            return true;
        }

        Object ownerEmail = ownerMap.get("email");
        return ownerEmail != null && ownerEmail.toString().equalsIgnoreCase(user.getEmail());
    }

    private boolean checkIsCoAdmin(UserEntity user) {
        if (user == null || !"main_admin".equals(user.getRole())) {
            return false;
        }

        Optional<SettingEntity> scoped = user.getCompanyId() == null
                ? Optional.empty()
                : settingRepository.findByKeyAndCompanyId("co_admin_assignments:" + user.getCompanyId(), user.getCompanyId());
        Optional<SettingEntity> global = settingRepository.findByKey("co_admin_assignments");
        Map<String, Object> assignments = scoped.or(() -> global).map(SettingEntity::getValue).orElse(null);
        if (assignments == null || assignments.get("owner") == null) {
            return true;
        }

        String email = user.getEmail() == null ? "" : user.getEmail().toLowerCase(Locale.ROOT);
        return containsSlotEmail(assignments, "owner", email)
                || containsSlotEmail(assignments, "co_owner", email)
                || containsSlotEmail(assignments, "backup", email);
    }

    @SuppressWarnings("unchecked")
    private boolean containsSlotEmail(Map<String, Object> assignments, String slot, String email) {
        Object raw = assignments.get(slot);
        if (!(raw instanceof Map<?, ?> map)) {
            return false;
        }
        Object value = ((Map<String, Object>) map).get("email");
        return value != null && value.toString().toLowerCase(Locale.ROOT).equals(email);
    }

    private CompanyEntity resolveCompany(UUID companyId) {
        if (companyId == null) {
            return null;
        }
        return companyRepository.findById(companyId).orElse(null);
    }

    private String resolveSubscriptionStatus(UserEntity user, CompanyEntity company) {
        if (user == null || "platform_admin".equals(user.getRole()) || company == null) {
            return null;
        }

        if (company.getSubscriptionEndDate() != null && company.getSubscriptionEndDate().isBefore(Instant.now().atOffset(java.time.ZoneOffset.UTC).toLocalDate())) {
            return "expired";
        }
        return company.getSubscriptionStatus();
    }

    private String sanitizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "user";
        }
        String lowered = role.trim().toLowerCase(Locale.ROOT);
        if (!REAL_ROLES.contains(lowered) || "platform_admin".equals(lowered) || "main_admin".equals(lowered)) {
            return "user";
        }
        return lowered;
    }

    private String findMainAdminEmail() {
        return userRepository.findAll().stream()
                .filter(u -> "main_admin".equals(u.getRole()) && Boolean.TRUE.equals(u.getIsActive()))
                .sorted((a, b) -> {
                    Instant ai = a.getCreatedAt() == null ? Instant.EPOCH : a.getCreatedAt();
                    Instant bi = b.getCreatedAt() == null ? Instant.EPOCH : b.getCreatedAt();
                    return ai.compareTo(bi);
                })
                .map(UserEntity::getEmail)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(configuredAdminEmail);
    }

    private String generateUniqueNumericUserId() {
        for (int i = 0; i < 10; i++) {
            String candidate = String.valueOf(1_000_000_000L + Math.abs(RANDOM.nextLong() % 9_000_000_000L));
            if (userRepository.findByUserId(candidate).isEmpty()) {
                return candidate;
            }
        }
        return String.valueOf(System.currentTimeMillis()).substring(3, 13);
    }

    private String randomDigits(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(RANDOM.nextInt(10));
        }
        return sb.toString();
    }

    private String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to hash value", e);
        }
    }

    public record RequestMeta(String ip, String userAgent, String device, String location) {
    }
}
