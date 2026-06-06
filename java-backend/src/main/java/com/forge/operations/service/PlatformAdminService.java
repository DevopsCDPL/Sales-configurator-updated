package com.forge.operations.service;

import com.forge.auth.dto.AuthUserDto;
import com.forge.auth.entity.AuditLogEntity;
import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.entity.LoginHistoryEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.AuditLogRepository;
import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.LoginHistoryRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import com.forge.shared.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import com.forge.operations.storage.R2StorageService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.Base64;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
public class PlatformAdminService {

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogRepository auditLogRepository;
    private final LoginHistoryRepository loginHistoryRepository;
    private final JwtService jwtService;
    private final R2StorageService r2StorageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PlatformAdminService(UserRepository userRepository,
                                CompanyRepository companyRepository,
                                PasswordEncoder passwordEncoder,
                                AuditLogRepository auditLogRepository,
                                LoginHistoryRepository loginHistoryRepository,
                                JwtService jwtService,
                                R2StorageService r2StorageService) {
        this.userRepository = userRepository;
        this.companyRepository = companyRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogRepository = auditLogRepository;
        this.loginHistoryRepository = loginHistoryRepository;
        this.jwtService = jwtService;
        this.r2StorageService = r2StorageService;
    }

    /* ── Guard ──────────────────────────────────────────────────────────── */
    private void requirePlatformAdmin(AuthenticatedUser caller) {
        if (caller == null || !"platform_admin".equals(caller.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Platform admin access required");
        }
    }

    /* ── Dashboard stats ────────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> getDashboardStats(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);

        long totalCompanies  = companyRepository.count();
        long activeCompanies = companyRepository.countByIsActiveTrue();
        long totalUsers      = userRepository.count();
        long totalOwners     = userRepository.countByRole("main_admin");

        // active subscriptions = companies whose subscription_end_date is in the future
        long activeSubscriptions = companyRepository.findAll().stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsActive()))
                .filter(c -> {
                    if (c.getSubscriptionEndDate() == null) return true;
                    return !c.getSubscriptionEndDate().isBefore(LocalDate.now(ZoneOffset.UTC));
                })
                .count();

        return Map.of(
                "totalCompanies",       totalCompanies,
                "activeCompanies",      activeCompanies,
                "totalUsers",           totalUsers,
                "totalOwners",          totalOwners,
                "activeSubscriptions",  activeSubscriptions
        );
    }

    /* ── List companies ─────────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listCompanies(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        return companyRepository.findAll().stream()
                .map(this::companyToMap)
                .toList();
    }

    /* ── Get single company ─────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> getCompany(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        return companyToMap(company);
    }

    private Map<String, Object> companyToMap(CompanyEntity c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",                    c.getId());
        m.put("name",                  c.getName() == null ? "" : c.getName());
        m.put("email",                 c.getEmail() == null ? "" : c.getEmail());
        m.put("phone",                 c.getPhone() == null ? "" : c.getPhone());
        m.put("address",               c.getAddress() == null ? "" : c.getAddress());
        m.put("is_active",             Boolean.TRUE.equals(c.getIsActive()));
        m.put("subscription_status",   c.getSubscriptionStatus() == null ? "trial" : c.getSubscriptionStatus());
        m.put("subscription_plan",     c.getSubscriptionPlan() == null ? "starter" : c.getSubscriptionPlan());
        m.put("subscription_end_date", c.getSubscriptionEndDate());
        m.put("created_at",            c.getCreatedAt());
        m.put("company_code",          c.getCompanyCode() == null ? "" : c.getCompanyCode());
        m.put("logo_url",              c.getLogoUrl() == null ? "" : c.getLogoUrl());
        m.put("logo_data",             c.getLogoData() == null ? "" : c.getLogoData());
        return m;
    }

    private String generateCompanyCode() {
        Optional<String> last = companyRepository.findLastCompanyCode();
        int next = 1;
        if (last.isPresent()) {
            try {
                String code = last.get(); // e.g. "CMP-0042"
                next = Integer.parseInt(code.substring(4)) + 1;
            } catch (Exception ignored) {}
        }
        return String.format("CMP-%04d", next);
    }

    /* ── Create company ─────────────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> createCompany(Map<String, String> body, MultipartFile logo, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);

        // ── Required fields ──────────────────────────────────────────────
        String companyName   = requiredStr(body, "company_name");
        String adminEmail    = requiredStr(body, "admin_email").toLowerCase(Locale.ROOT);
        String adminPassword = requiredStr(body, "admin_password");
        String adminName     = strParam(body, "admin_name", adminEmail);

        // ── Optional company fields ───────────────────────────────────────
        String companyEmail  = strParam(body, "email", null);
        String phone         = strParam(body, "phone", null);
        String address       = strParam(body, "address", null);
        String plan          = strParam(body, "plan", "starter");
        String endDateStr    = strParam(body, "subscription_end_date", null);

        // ── Validate uniqueness ───────────────────────────────────────────
        userRepository.findByEmailIgnoreCase(adminEmail).ifPresent(u -> {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A user with admin email '" + adminEmail + "' already exists");
        });
        if (companyEmail != null) {
            companyRepository.findByEmailIgnoreCase(companyEmail).ifPresent(c -> {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Company with email '" + companyEmail + "' already exists");
            });
        }

        // ── Auto-generate company_code ────────────────────────────────────
        String companyCode = generateCompanyCode();

        // ── Build company entity ──────────────────────────────────────────
        UUID companyId = UUID.randomUUID();
        CompanyEntity company = new CompanyEntity();
        company.setId(companyId);
        company.setName(companyName);
        company.setEmail(companyEmail);
        company.setPhone(phone);
        company.setAddress(address);
        company.setCompanyCode(companyCode);
        company.setSubscriptionPlan(plan);
        company.setSubscriptionStatus("active");
        company.setIsActive(true);
        company.setUserLimit(50);
        company.setStorageUsedMb(0.0);
        company.setRiskFlags(List.of());
        company.setSettings(Map.of());
        company.setIpWhitelist(List.of());
        company.setCreatedAt(Instant.now());
        company.setUpdatedAt(Instant.now());

        if (endDateStr != null && !endDateStr.isBlank()) {
            company.setSubscriptionEndDate(LocalDate.parse(endDateStr));
        }

        // ── Handle logo ───────────────────────────────────────────────────
        if (logo != null && !logo.isEmpty()) {
            try {
                byte[] bytes = logo.getBytes();
                String originalName = logo.getOriginalFilename() != null ? logo.getOriginalFilename() : "logo";
                String ext = originalName.contains(".")
                        ? originalName.substring(originalName.lastIndexOf('.'))
                        : "";
                String r2Key = "logos/" + companyId + "/logo" + ext;

                // Upload to R2 (non-blocking; store key as logo_url)
                if (r2StorageService.isConfigured()) {
                    r2StorageService.upload(bytes, r2Key, logo.getContentType());
                    company.setLogoUrl(r2Key);
                }

                // Always store base64 data URI for offline/fallback rendering
                String mime = logo.getContentType() != null ? logo.getContentType() : "image/png";
                company.setLogoData("data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes));

            } catch (IOException e) {
                // Logo failure must not block company creation — log and continue
                // log.warn("Failed to process logo for company {}: {}", companyId, e.getMessage());
            }
        }

        log.info("[createCompany] Saving company: id={}, name={}, email={}, plan={}, status={}, isActive={}, userLimit={}, storageUsedMb={}, riskFlags={}, settings={}, ipWhitelist={}",
                company.getId(), company.getName(), company.getEmail(),
                company.getSubscriptionPlan(), company.getSubscriptionStatus(),
                company.getIsActive(), company.getUserLimit(), company.getStorageUsedMb(),
                company.getRiskFlags(), company.getSettings(), company.getIpWhitelist());
        try {
            companyRepository.saveAndFlush(company);
            log.info("[createCompany] Company saved OK: {}", company.getId());
        } catch (Exception e) {
            log.error("[createCompany] FAILED to save company — root cause: {}", getRootCause(e).getMessage(), e);
            throw e;
        }

        // ── Create admin (main_admin) user ────────────────────────────────
        UserEntity admin = new UserEntity();
        admin.setId(UUID.randomUUID());
        admin.setEmail(adminEmail);
        admin.setName(adminName);
        admin.setPasswordHash(passwordEncoder.encode(adminPassword));
        admin.setRole("main_admin");
        admin.setCompanyId(companyId);
        admin.setCompanyName(companyName);
        admin.setIsActive(true);
        admin.setFailedLoginAttempts(0);
        admin.setTwoFactorEnabled(false);
        admin.setOtpAttempts(0);
        admin.setForcePasswordReset(false);
        admin.setModulePermissions(Map.of());
        admin.setTags(List.of());
        admin.setCreatedAt(Instant.now());
        admin.setUpdatedAt(Instant.now());
        log.info("[createCompany] Saving admin user: id={}, email={}, role={}, companyId={}, tags={}, modulePermissions={}",
                admin.getId(), admin.getEmail(), admin.getRole(), admin.getCompanyId(),
                admin.getTags(), admin.getModulePermissions());
        try {
            userRepository.saveAndFlush(admin);
            log.info("[createCompany] Admin user saved OK: {}", admin.getId());
        } catch (Exception e) {
            log.error("[createCompany] FAILED to save admin user — root cause: {}", getRootCause(e).getMessage(), e);
            throw e;
        }

        // ── Create initial_users (if provided as JSON string) ─────────────
        String initialUsersJson = strParam(body, "initial_users", null);
        if (initialUsersJson != null && !initialUsersJson.isBlank()) {
            try {
                List<Map<String, Object>> initialUsers = objectMapper.readValue(
                        initialUsersJson, new TypeReference<>() {});
                for (Map<String, Object> u : initialUsers) {
                    String uEmail = u.containsKey("email") ? u.get("email").toString().toLowerCase(Locale.ROOT) : null;
                    if (uEmail == null || uEmail.isBlank()) continue;
                    if (userRepository.findByEmailIgnoreCase(uEmail).isPresent()) continue; // skip duplicates

                    String rawPwd = u.containsKey("password")
                            ? u.get("password").toString()
                            : UUID.randomUUID().toString().substring(0, 12);

                    UserEntity initialUser = new UserEntity();
                    initialUser.setId(UUID.randomUUID());
                    initialUser.setEmail(uEmail);
                    initialUser.setName(u.containsKey("name") ? u.get("name").toString() : uEmail);
                    initialUser.setPasswordHash(passwordEncoder.encode(rawPwd));
                    initialUser.setRole(u.containsKey("role") ? u.get("role").toString() : "user");
                    initialUser.setCompanyId(companyId);
                    initialUser.setCompanyName(companyName);
                    initialUser.setIsActive(true);
                    initialUser.setFailedLoginAttempts(0);
                    initialUser.setTwoFactorEnabled(false);
                    initialUser.setOtpAttempts(0);
                    initialUser.setForcePasswordReset(true);
                    initialUser.setModulePermissions(Map.of());
                    initialUser.setTags(List.of());
                    initialUser.setCreatedAt(Instant.now());
                    initialUser.setUpdatedAt(Instant.now());
                    log.info("[createCompany] Saving initial user: id={}, email={}, role={}, tags={}, modulePermissions={}",
                            initialUser.getId(), initialUser.getEmail(), initialUser.getRole(),
                            initialUser.getTags(), initialUser.getModulePermissions());
                    try {
                        userRepository.saveAndFlush(initialUser);
                    } catch (Exception ex) {
                        log.error("[createCompany] FAILED to save initial user {} — root cause: {}", initialUser.getEmail(), getRootCause(ex).getMessage(), ex);
                        throw ex;
                    }
                }
            } catch (IOException e) {
                // Malformed initial_users JSON — skip silently
            }
        }

        Map<String, Object> result = companyToMap(company);
        result.put("admin", userToMap(admin));
        return result;
    }

    /* ── Update company ─────────────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> updateCompany(UUID companyId, Map<String, String> body, MultipartFile logo, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);

        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));

        if (body.containsKey("company_name") || body.containsKey("name")) {
            String n = body.containsKey("company_name") ? body.get("company_name") : body.get("name");
            if (n != null && !n.isBlank()) company.setName(n.trim());
        }
        if (body.containsKey("email") && !body.get("email").isBlank()) {
            company.setEmail(body.get("email").trim().toLowerCase(Locale.ROOT));
        }
        if (body.containsKey("phone"))   company.setPhone(body.get("phone"));
        if (body.containsKey("address")) company.setAddress(body.get("address"));
        if (body.containsKey("plan") || body.containsKey("subscription_plan")) {
            String p = body.containsKey("plan") ? body.get("plan") : body.get("subscription_plan");
            if (p != null && !p.isBlank()) company.setSubscriptionPlan(p.trim());
        }
        if (body.containsKey("subscription_status") && !body.get("subscription_status").isBlank()) {
            company.setSubscriptionStatus(body.get("subscription_status").trim());
        }
        if (body.containsKey("subscription_end_date")) {
            String d = body.get("subscription_end_date");
            company.setSubscriptionEndDate(d == null || d.isBlank() ? null : LocalDate.parse(d.trim()));
        }
        if (body.containsKey("is_active") && !body.get("is_active").isBlank()) {
            company.setIsActive(Boolean.parseBoolean(body.get("is_active")));
        }

        // ── Handle logo update ────────────────────────────────────────────
        boolean removeLogo = "true".equalsIgnoreCase(body.get("remove_logo"));
        if (removeLogo) {
            company.setLogoUrl(null);
            company.setLogoData(null);
        } else if (logo != null && !logo.isEmpty()) {
            try {
                byte[] bytes = logo.getBytes();
                String originalName = logo.getOriginalFilename() != null ? logo.getOriginalFilename() : "logo";
                String ext = originalName.contains(".")
                        ? originalName.substring(originalName.lastIndexOf('.'))
                        : "";
                String r2Key = "logos/" + companyId + "/logo" + ext;

                if (r2StorageService.isConfigured()) {
                    r2StorageService.upload(bytes, r2Key, logo.getContentType());
                    company.setLogoUrl(r2Key);
                }

                String mime = logo.getContentType() != null ? logo.getContentType() : "image/png";
                company.setLogoData("data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes));

            } catch (IOException e) {
                // log.warn("Failed to process logo update for company {}: {}", companyId, e.getMessage());
            }
        }

        company.setUpdatedAt(Instant.now());
        companyRepository.save(company);
        return companyToMap(company);
    }

    /* ── Activate company ───────────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> activateCompany(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        company.setIsActive(true);
        company.setUpdatedAt(Instant.now());
        companyRepository.save(company);
        // also re-activate all users of this company
        userRepository.findAllByCompanyId(companyId)
                .forEach(u -> { u.setIsActive(true); u.setUpdatedAt(Instant.now()); userRepository.save(u); });
        return companyToMap(company);
    }

    /* ── Deactivate company ─────────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> deactivateCompany(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        company.setIsActive(false);
        company.setUpdatedAt(Instant.now());
        companyRepository.save(company);
        return companyToMap(company);
    }

    /* ── Delete company ─────────────────────────────────────────────────── */
    @Transactional
    public void deleteCompany(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        // soft-delete: deactivate + mark deleted_at
        company.setIsActive(false);
        company.setDeletedAt(Instant.now());
        company.setUpdatedAt(Instant.now());
        companyRepository.save(company);
    }

    /* ── Reset owner password ───────────────────────────────────────────── */
    @Transactional
    public String resetOwnerPassword(UUID companyId, String newPassword, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        if (newPassword == null || newPassword.length() < 6) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters");
        }
        UserEntity owner = userRepository
                .findFirstActiveOwnerByCompanyId(companyId, "main_admin")
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No active owner found for this company"));
        owner.setPasswordHash(passwordEncoder.encode(newPassword));
        owner.setFailedLoginAttempts(0);
        owner.setLockedUntil(null);
        owner.setForcePasswordReset(true);
        owner.setUpdatedAt(Instant.now());
        userRepository.save(owner);
        return owner.getEmail();
    }

    /* ── List users of a company ────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listCompanyUsers(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        return userRepository.findAllByCompanyId(companyId).stream()
                .map(this::userToMap)
                .toList();
    }

    /* ── Create user for a company ──────────────────────────────────────── */
    @Transactional
    public Map<String, Object> createCompanyUser(UUID companyId, Map<String, Object> body, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));

        String email = required(body, "email").toLowerCase(Locale.ROOT);
        userRepository.findByEmailIgnoreCase(email).ifPresent(u -> {
            throw new ApiException(HttpStatus.BAD_REQUEST, "User with this email already exists");
        });

        String rawPassword = str(body, "password", UUID.randomUUID().toString().substring(0, 12));
        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setName(required(body, "name"));
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setRole(str(body, "role", "user"));
        user.setCompanyId(companyId);
        user.setIsActive(true);
        user.setFailedLoginAttempts(0);
        user.setTwoFactorEnabled(false);
        user.setOtpAttempts(0);
        user.setForcePasswordReset(true);
        user.setModulePermissions(Map.of());
        user.setTags(List.of());
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);

        Map<String, Object> result = userToMap(user);
        result.put("temporary_password", rawPassword);
        return result;
    }

    /* ── List all platform admins ───────────────────────────────────────── */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listPlatformAdmins(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        return userRepository.findAllByRole("platform_admin").stream()
                .map(this::userToMap)
                .toList();
    }

    /* ── Create platform admin ──────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> createPlatformAdmin(Map<String, Object> body, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);

        String email = required(body, "email").toLowerCase(Locale.ROOT);
        userRepository.findByEmailIgnoreCase(email).ifPresent(u -> {
            throw new ApiException(HttpStatus.BAD_REQUEST, "User with this email already exists");
        });

        String rawPassword = required(body, "password");
        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setName(required(body, "name"));
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setRole("platform_admin");
        user.setIsActive(true);
        user.setFailedLoginAttempts(0);
        user.setTwoFactorEnabled(false);
        user.setOtpAttempts(0);
        user.setForcePasswordReset(false);
        user.setModulePermissions(Map.of());
        user.setTags(List.of());
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return userToMap(user);
    }

    /* ── Access-control views ───────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listAccessControlUsers(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        return userRepository.findAll().stream()
                .filter(u -> u.getDeletedAt() == null)
                .map(u -> {
                    Map<String, Object> m = userToMap(u);
                    m.put("company_name", u.getCompanyName());
                    return m;
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listAccessControlCompanies(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        return companyRepository.findAll().stream()
                .filter(c -> c.getDeletedAt() == null)
                .map(c -> {
                    Map<String, Object> m = companyToMap(c);
                    long userCount = userRepository.findAllByCompanyId(c.getId()).size();
                    m.put("user_count", userCount);
                    return m;
                })
                .toList();
    }

    /* ── Enter Company (impersonation) ───────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> enterCompany(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));
        if (!Boolean.TRUE.equals(company.getIsActive())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Company is inactive");
        }
        UserEntity owner = userRepository.findFirstActiveOwnerByCompanyId(companyId, "main_admin")
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No active owner found for this company"));

        String impersonationToken = jwtService.generateAccessToken(owner.getId());
        Map<String, Object> result = new LinkedHashMap<>(companyToMap(company));
        result.put("owner", Map.of("id", owner.getId(), "name", owner.getName() == null ? "" : owner.getName(), "email", owner.getEmail() == null ? "" : owner.getEmail()));
        result.put("impersonation_token", impersonationToken);
        return result;
    }

    /* ── Update company user ─────────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> updateCompanyUser(UUID companyId, UUID userId, Map<String, Object> body, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        UserEntity user = userRepository.findById(userId)
                .filter(u -> companyId.equals(u.getCompanyId()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found in this company"));

        if (body.containsKey("name"))      user.setName(str(body, "name", user.getName()));
        if (body.containsKey("role"))      user.setRole(str(body, "role", user.getRole()));
        if (body.containsKey("is_active")) user.setIsActive(Boolean.parseBoolean(String.valueOf(body.get("is_active"))));
        if (body.containsKey("password")) {
            String pwd = str(body, "password", null);
            if (pwd != null && !pwd.isBlank()) {
                user.setPasswordHash(passwordEncoder.encode(pwd));
                user.setForcePasswordReset(false);
            }
        }
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return userToMap(user);
    }

    /* ── Delete company user (soft) ──────────────────────────────────────── */
    @Transactional
    public Map<String, Object> deleteCompanyUser(UUID companyId, UUID userId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        UserEntity user = userRepository.findById(userId)
                .filter(u -> companyId.equals(u.getCompanyId()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found in this company"));
        user.setIsActive(false);
        user.setDeletedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return Map.of("message", "User deleted successfully");
    }

    /* ── Bulk delete company users (soft) ────────────────────────────────── */
    @Transactional
    public Map<String, Object> bulkDeleteCompanyUsers(UUID companyId, List<UUID> userIds, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        if (userIds == null || userIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No user IDs provided");
        }
        List<UserEntity> users = userRepository.findAllByCompanyIdAndIdIn(companyId, userIds);
        if (users.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No users found in this company");
        }
        Instant now = Instant.now();
        for (UserEntity u : users) {
            u.setIsActive(false);
            u.setDeletedAt(now);
            u.setUpdatedAt(now);
        }
        userRepository.saveAll(users);
        return Map.of("message", users.size() + " user(s) deleted successfully", "count", users.size());
    }

    /* ── Company activity ────────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> getCompanyActivity(UUID companyId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        CompanyEntity company = companyRepository.findById(companyId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));

        List<UserEntity> allUsers = userRepository.findAllByCompanyId(companyId).stream()
                .filter(u -> !"platform_admin".equals(u.getRole()))
                .toList();
        long totalUsers = allUsers.size();
        long activeUsers = allUsers.stream().filter(u -> Boolean.TRUE.equals(u.getIsActive())).count();

        Instant thirtyDaysAgo = Instant.now().minusSeconds(30L * 24 * 60 * 60);
        long recentlyActive = allUsers.stream()
                .filter(u -> u.getLastLogin() != null && u.getLastLogin().isAfter(thirtyDaysAgo))
                .count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("company_name", company.getName() == null ? "" : company.getName());
        result.put("company_code", company.getCompanyCode() == null ? "" : company.getCompanyCode());
        result.put("plan", company.getSubscriptionPlan() == null ? "" : company.getSubscriptionPlan());
        result.put("total_users", totalUsers);
        result.put("active_users", activeUsers);
        result.put("inactive_users", totalUsers - activeUsers);
        result.put("recently_active", recentlyActive);
        result.put("subscription_status", company.getSubscriptionStatus() == null ? "" : company.getSubscriptionStatus());
        result.put("subscription_end_date", company.getSubscriptionEndDate());
        result.put("last_activity_at", company.getLastActivityAt());
        return result;
    }

    /* ── Update platform admin ───────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> updatePlatformAdmin(UUID userId, Map<String, Object> body, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if (!"platform_admin".equals(user.getRole())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "User is not a platform admin");
        }
        if (body.containsKey("name"))      user.setName(str(body, "name", user.getName()));
        if (body.containsKey("email")) {
            String newEmail = str(body, "email", user.getEmail()).toLowerCase(Locale.ROOT);
            if (!newEmail.equals(user.getEmail())) {
                userRepository.findByEmailIgnoreCase(newEmail).ifPresent(existing -> {
                    throw new ApiException(HttpStatus.CONFLICT, "A user with this email already exists");
                });
            }
            user.setEmail(newEmail);
        }
        if (body.containsKey("is_active")) {
            user.setIsActive(Boolean.parseBoolean(String.valueOf(body.get("is_active"))));
        }
        if (body.containsKey("password")) {
            String pwd = str(body, "password", null);
            if (pwd != null && !pwd.isBlank()) {
                user.setPasswordHash(passwordEncoder.encode(pwd));
            }
        }
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return userToMap(user);
    }

    /* ── Delete platform admin ───────────────────────────────────────────── */
    @Transactional
    public Map<String, Object> deletePlatformAdmin(UUID userId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if (!"platform_admin".equals(user.getRole())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "User is not a platform admin");
        }
        long count = userRepository.findAllByRole("platform_admin").size();
        if (count <= 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot delete the last platform admin");
        }
        user.setIsActive(false);
        user.setDeletedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return Map.of("message", "Platform admin deleted");
    }

    /* ── Company owners ──────────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCompanyOwners(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        List<UserEntity> owners = userRepository.findAllByRole("main_admin").stream()
                .filter(u -> u.getCompanyId() != null)
                .toList();
        if (owners.isEmpty()) return List.of();

        List<UUID> companyIds = owners.stream().map(UserEntity::getCompanyId).distinct().toList();
        Map<UUID, CompanyEntity> companyById = new java.util.HashMap<>();
        companyRepository.findAllById(companyIds).forEach(c -> companyById.put(c.getId(), c));

        return owners.stream().map(o -> {
            CompanyEntity company = companyById.get(o.getCompanyId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.getId());
            m.put("name", o.getName() == null ? "" : o.getName());
            m.put("email", o.getEmail() == null ? "" : o.getEmail());
            m.put("last_login", o.getLastLogin());
            m.put("is_active", Boolean.TRUE.equals(o.getIsActive()));
            if (company != null && company.getDeletedAt() == null) {
                m.put("company", Map.of(
                        "id", company.getId(),
                        "name", company.getName() == null ? "" : company.getName(),
                        "company_code", company.getCompanyCode() == null ? "" : company.getCompanyCode(),
                        "plan", company.getSubscriptionPlan() == null ? "" : company.getSubscriptionPlan(),
                        "is_active", Boolean.TRUE.equals(company.getIsActive())));
            } else {
                m.put("company", null);
            }
            return m;
        }).toList();
    }

    /* ── Check / expire subscriptions ────────────────────────────────────── */
    @Transactional
    public Map<String, Object> checkSubscriptions(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int expiredCount = companyRepository.markExpiredSubscriptions(today, Instant.now());

        LocalDate thirtyDaysLater = today.plusDays(30);
        List<CompanyEntity> expiringSoon = companyRepository.findExpiringSoon(today, thirtyDaysLater);

        List<Map<String, Object>> expiringSoonList = expiringSoon.stream()
                .map(c -> Map.<String, Object>of(
                        "id", c.getId(),
                        "name", c.getName() == null ? "" : c.getName(),
                        "expires", c.getSubscriptionEndDate()))
                .toList();

        return Map.of("expiredCount", expiredCount, "expiringSoon", expiringSoonList);
    }

    /* ── Roles & permissions overview ────────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> getRolesOverview(AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        List<CompanyEntity> companies = companyRepository.findAll().stream()
                .filter(c -> c.getDeletedAt() == null)
                .sorted(java.util.Comparator.comparing(c -> c.getName() == null ? "" : c.getName()))
                .toList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (CompanyEntity company : companies) {
            List<UserEntity> companyUsers = userRepository.findAllByCompanyId(company.getId()).stream()
                    .filter(u -> !"platform_admin".equals(u.getRole()))
                    .toList();

            UserEntity owner = companyUsers.stream()
                    .filter(u -> "main_admin".equals(u.getRole()))
                    .min(java.util.Comparator.comparing(u -> u.getCreatedAt() == null ? Instant.MAX : u.getCreatedAt()))
                    .orElse(null);

            Map<String, Long> roleCounts = new java.util.HashMap<>();
            for (UserEntity u : companyUsers) {
                roleCounts.merge(u.getRole() == null ? "user" : u.getRole(), 1L, Long::sum);
            }

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("company", Map.of(
                    "id", company.getId(),
                    "name", company.getName() == null ? "" : company.getName(),
                    "is_active", Boolean.TRUE.equals(company.getIsActive()),
                    "plan", company.getSubscriptionPlan() == null ? "" : company.getSubscriptionPlan()));
            entry.put("owner", owner == null ? null : Map.of(
                    "id", owner.getId(),
                    "name", owner.getName() == null ? "" : owner.getName(),
                    "email", owner.getEmail() == null ? "" : owner.getEmail(),
                    "is_active", Boolean.TRUE.equals(owner.getIsActive()),
                    "last_login", owner.getLastLogin() == null ? "" : owner.getLastLogin().toString()));
            entry.put("role_counts", roleCounts);
            entry.put("total_users", (long) companyUsers.size());
            entry.put("users", companyUsers.stream().map(u -> {
                Map<String, Object> um = new LinkedHashMap<>();
                um.put("id", u.getId());
                um.put("name", u.getName() == null ? "" : u.getName());
                um.put("email", u.getEmail() == null ? "" : u.getEmail());
                um.put("role", u.getRole() == null ? "user" : u.getRole());
                um.put("is_active", Boolean.TRUE.equals(u.getIsActive()));
                um.put("last_login", u.getLastLogin());
                return um;
            }).toList());
            result.add(entry);
        }

        long totalCompanies = companies.size();
        long totalOwners = result.stream().filter(r -> r.get("owner") != null).count();
        long totalUsers = result.stream().mapToLong(r -> (Long) r.get("total_users")).sum();

        return Map.of(
                "totalCompanies", totalCompanies,
                "totalOwners", totalOwners,
                "totalUsers", totalUsers,
                "companies", result);
    }

    /* ── Bulk delete any users (soft) ────────────────────────────────────── */
    @Transactional
    public Map<String, Object> bulkDeleteUsers(List<UUID> userIds, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        if (userIds == null || userIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No user IDs provided");
        }
        List<UserEntity> users = userRepository.findAllById(userIds);
        if (users.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No users found");
        }
        boolean hasPlatformAdmin = users.stream().anyMatch(u -> "platform_admin".equals(u.getRole()));
        if (hasPlatformAdmin) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot delete platform admin users via bulk delete");
        }
        Instant now = Instant.now();
        for (UserEntity u : users) {
            u.setIsActive(false);
            u.setDeletedAt(now);
            u.setUpdatedAt(now);
        }
        userRepository.saveAll(users);
        return Map.of("message", users.size() + " user(s) deleted successfully", "count", users.size());
    }

    /* ── Reset any user's password ───────────────────────────────────────── */
    @Transactional
    public Map<String, Object> resetUserPassword(UUID userId, String newPassword, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        if (newPassword == null || newPassword.length() < 6) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Password must be at least 6 characters");
        }
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return Map.of("message", "Password reset successfully", "email", user.getEmail() == null ? "" : user.getEmail());
    }

    /* ── User activity ───────────────────────────────────────────────────── */
    @Transactional(readOnly = true)
    public Map<String, Object> getUserActivity(String numericUserId, AuthenticatedUser caller) {
        requirePlatformAdmin(caller);
        UserEntity user = userRepository.findByUserId(numericUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found with this User ID"));

        List<LoginHistoryEntity> loginHistory = loginHistoryRepository
                .findTop50ByUserIdOrderByCreatedAtDesc(user.getId());
        List<AuditLogEntity> auditLogs = auditLogRepository
                .findTop50ByPerformedByOrderByCreatedAtDesc(user.getId());

        String companyName = null;
        if (user.getCompanyId() != null) {
            companyName = companyRepository.findById(user.getCompanyId())
                    .map(c -> c.getName())
                    .orElse(null);
        }

        Map<String, Object> userMap = new LinkedHashMap<>();
        userMap.put("id", user.getId());
        userMap.put("name", user.getName() == null ? "" : user.getName());
        userMap.put("email", user.getEmail() == null ? "" : user.getEmail());
        userMap.put("role", user.getRole() == null ? "user" : user.getRole());
        userMap.put("user_id", user.getUserId());
        userMap.put("company", companyName);
        userMap.put("last_login", user.getLastLogin());
        userMap.put("created_at", user.getCreatedAt());

        List<Map<String, Object>> loginHistoryMaps = loginHistory.stream()
                .map(lh -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", lh.getId());
                    m.put("ip_address", lh.getIpAddress());
                    m.put("device", lh.getDevice());
                    m.put("status", lh.getStatus());
                    m.put("created_at", lh.getCreatedAt());
                    return m;
                }).toList();

        List<Map<String, Object>> auditLogMaps = auditLogs.stream()
                .map(al -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", al.getId());
                    m.put("action", al.getAction());
                    m.put("entity_type", al.getEntityType());
                    m.put("entity_name", al.getEntityName());
                    m.put("created_at", al.getCreatedAt());
                    return m;
                }).toList();

        return Map.of("user", userMap, "loginHistory", loginHistoryMaps, "auditLogs", auditLogMaps);
    }

    private Map<String, Object> userToMap(UserEntity u) {
        return new java.util.LinkedHashMap<>(Map.of(
                "id",         u.getId(),
                "name",       u.getName() == null ? "" : u.getName(),
                "email",      u.getEmail() == null ? "" : u.getEmail(),
                "role",       u.getRole() == null ? "user" : u.getRole(),
                "is_active",  Boolean.TRUE.equals(u.getIsActive()),
                "company_id", u.getCompanyId() == null ? "" : u.getCompanyId().toString(),
                "created_at", u.getCreatedAt()
        ));
    }

    // ── Unwrap to root cause for clear error logging ─────────────────────
    private static Throwable getRootCause(Throwable t) {
        Throwable cause = t;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

   // ── For multipart form endpoints (Map<String, String>) ────────────────
    private String requiredStr(Map<String, String> body, String key) {
        String val = body.get(key);
        if (val == null || val.isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST, "'" + key + "' is required");
        return val.trim();
    }

    private String strParam(Map<String, String> body, String key, String defaultVal) {
        String val = body.get(key);
        return (val == null || val.isBlank()) ? defaultVal : val.trim();
    }

    // ── For JSON body endpoints (Map<String, Object>) ─────────────────────
    private String required(Map<String, Object> body, String key) {
        Object val = body.get(key);
        if (val == null || val.toString().isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST, "'" + key + "' is required");
        return val.toString().trim();
    }

    private String str(Map<String, Object> body, String key, String defaultVal) {
        Object val = body.get(key);
        return (val == null || val.toString().isBlank()) ? defaultVal : val.toString().trim();
    }
}
