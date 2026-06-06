package com.forge.auth.service;

import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.entity.RiskScoreEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.AuditLogRepository;
import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.LoginHistoryRepository;
import com.forge.auth.repository.RiskScoreRepository;
import com.forge.auth.repository.SessionRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.shared.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class RiskService {

    private static final List<String> ALERT_LEVELS = List.of("high", "critical");

    private final RiskScoreRepository riskRepo;
    private final UserRepository userRepo;
    private final CompanyRepository companyRepo;
    private final SessionRepository sessionRepo;
    private final LoginHistoryRepository loginHistoryRepo;
    private final AuditLogRepository auditLogRepo;

    public RiskService(RiskScoreRepository riskRepo,
                       UserRepository userRepo,
                       CompanyRepository companyRepo,
                       SessionRepository sessionRepo,
                       LoginHistoryRepository loginHistoryRepo,
                       AuditLogRepository auditLogRepo) {
        this.riskRepo = riskRepo;
        this.userRepo = userRepo;
        this.companyRepo = companyRepo;
        this.sessionRepo = sessionRepo;
        this.loginHistoryRepo = loginHistoryRepo;
        this.auditLogRepo = auditLogRepo;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET ALL RISK SCORES
    // ═══════════════════════════════════════════════════════════════════════

    public List<Map<String, Object>> getAllRiskScores(UUID companyId) {
        List<RiskScoreEntity> scores = companyId == null
                ? riskRepo.findAllByOrderByScoreDesc()
                : riskRepo.findAllByCompanyIdOrderByScoreDesc(companyId);
        return scores.stream().map(this::enrichRiskScore).toList();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET ALERTS (high + critical)
    // ═══════════════════════════════════════════════════════════════════════

    public List<Map<String, Object>> getAlerts(UUID companyId) {
        List<RiskScoreEntity> alerts = companyId == null
                ? riskRepo.findAllByLevelInOrderByScoreDesc(ALERT_LEVELS)
                : riskRepo.findAllByCompanyIdAndLevelInOrderByScoreDesc(companyId, ALERT_LEVELS);
        return alerts.stream().map(this::enrichRiskScore).toList();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CALCULATE COMPANY RISK
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    public Map<String, Object> calculateCompanyRisk(UUID companyId) {
        List<Map<String, Object>> factors = new ArrayList<>();
        int totalScore = 0;
        Instant now = Instant.now();
        Instant yesterday = now.minus(24, ChronoUnit.HOURS);

        // 1. Failed logins in last 24h for this company
        long failedLogins = loginHistoryRepo.countByCompanyIdAndStatusAndCreatedAtAfter(
                companyId, "failed", yesterday);
        if (failedLogins > 10) {
            int weight = (int) Math.min(30, failedLogins * 2);
            factors.add(factor("failed_logins", weight, failedLogins + " failed logins in 24h"));
            totalScore += weight;
        }

        // 2. Inactive users ratio
        long totalUsers = userRepo.countByCompanyId(companyId);
        long inactiveUsers = userRepo.countByCompanyIdAndIsActiveFalse(companyId);
        if (totalUsers > 0) {
            double ratio = (double) inactiveUsers / totalUsers;
            if (ratio > 0.5) {
                int weight = (int) Math.round(ratio * 20);
                factors.add(factor("high_inactive_ratio", weight,
                        inactiveUsers + "/" + totalUsers + " users inactive"));
                totalScore += weight;
            }
        }

        // 3. Locked accounts
        long lockedUsers = userRepo.countByCompanyIdAndLockedUntilAfter(companyId, now);
        if (lockedUsers > 0) {
            int weight = (int) Math.min(lockedUsers * 10, 25);
            factors.add(factor("locked_accounts", weight,
                    lockedUsers + " accounts currently locked"));
            totalScore += weight;
        }

        // 4. No admin activity in 30 days
        companyRepo.findById(companyId).ifPresent(company -> {
            // handled separately below since we need to mutate totalScore
        });
        CompanyEntity company = companyRepo.findById(companyId).orElse(null);
        if (company != null && company.getLastActivityAt() != null) {
            long daysSince = ChronoUnit.DAYS.between(company.getLastActivityAt(), now);
            if (daysSince > 30) {
                factors.add(factor("admin_inactivity", 15,
                        "No admin activity for " + daysSince + " days"));
                totalScore += 15;
            }
        }

        // 5. Mass data operations (>20 export audit logs in 24h)
        long massOps = auditLogRepo.countByCompanyIdAndActionContainingIgnoreCaseAndCreatedAtAfter(
                companyId, "export", yesterday);
        if (massOps > 20) {
            factors.add(factor("mass_data_operations", 20,
                    massOps + " export operations in 24h"));
            totalScore += 20;
        }

        totalScore = Math.min(totalScore, 100);
        String level = scoreToLevel(totalScore);

        upsertRiskScore("company", companyId, companyId, totalScore, level, factors);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("score", totalScore);
        result.put("level", level);
        result.put("factors", factors);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CALCULATE USER RISK
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    public Map<String, Object> calculateUserRisk(UUID userId) {
        UserEntity user = userRepo.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        List<Map<String, Object>> factors = new ArrayList<>();
        int totalScore = 0;
        Instant now = Instant.now();

        // 1. Failed login attempts
        int failedAttempts = user.getFailedLoginAttempts() != null ? user.getFailedLoginAttempts() : 0;
        if (failedAttempts > 3) {
            int weight = Math.min(30, failedAttempts * 5);
            factors.add(factor("failed_logins", weight,
                    failedAttempts + " failed attempts"));
            totalScore += weight;
        }

        // 2. Account locked
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
            factors.add(factor("account_locked", 20, "Account is currently locked"));
            totalScore += 20;
        }

        // 3. Multiple active sessions (> 5)
        long activeSessions = sessionRepo.countByUserIdAndIsActiveTrueAndExpiresAtAfter(userId, now);
        if (activeSessions > 5) {
            factors.add(factor("many_sessions", 15,
                    activeSessions + " active sessions"));
            totalScore += 15;
        }

        // 4. Admin without 2FA
        boolean isAdmin = "main_admin".equals(user.getRole()) || "admin".equals(user.getRole());
        boolean hasTwoFactor = Boolean.TRUE.equals(user.getTwoFactorEnabled());
        if (isAdmin && !hasTwoFactor) {
            factors.add(factor("no_2fa", 10, "Admin without 2FA"));
            totalScore += 10;
        }

        // 5. No login in >60 days
        if (user.getLastLogin() != null) {
            long daysSince = ChronoUnit.DAYS.between(user.getLastLogin(), now);
            if (daysSince > 60) {
                factors.add(factor("long_inactive", 15,
                        "No login for " + daysSince + " days"));
                totalScore += 15;
            }
        }

        totalScore = Math.min(totalScore, 100);
        String level = scoreToLevel(totalScore);

        upsertRiskScore("user", userId, user.getCompanyId(), totalScore, level, factors);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("score", totalScore);
        result.put("level", level);
        result.put("factors", factors);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RECALCULATE ALL (admin only)
    // ═══════════════════════════════════════════════════════════════════════

    @Transactional
    public List<Map<String, Object>> recalculateAll() {
        List<CompanyEntity> companies = companyRepo.findByIsActiveTrue();
        List<Map<String, Object>> results = new ArrayList<>();
        for (CompanyEntity c : companies) {
            try {
                Map<String, Object> risk = calculateCompanyRisk(c.getId());
                Map<String, Object> row = new LinkedHashMap<>(risk);
                row.put("company_id", c.getId());
                results.add(row);
            } catch (Exception e) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("company_id", c.getId());
                row.put("error", e.getMessage());
                results.add(row);
            }
        }
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private void upsertRiskScore(String entityType, UUID entityId, UUID companyId,
                                  int score, String level, List<Map<String, Object>> factors) {
        Instant now = Instant.now();
        RiskScoreEntity entity = riskRepo.findByEntityTypeAndEntityId(entityType, entityId)
                .orElseGet(() -> {
                    RiskScoreEntity n = new RiskScoreEntity();
                    n.setId(UUID.randomUUID());
                    n.setEntityType(entityType);
                    n.setEntityId(entityId);
                    n.setCreatedAt(now);
                    return n;
                });
        entity.setScore(score);
        entity.setLevel(level);
        entity.setFactors(factors);
        entity.setLastCalculatedAt(now);
        entity.setCompanyId(companyId);
        entity.setUpdatedAt(now);
        riskRepo.save(entity);
    }

    private Map<String, Object> enrichRiskScore(RiskScoreEntity r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("entity_type", r.getEntityType());
        m.put("entity_id", r.getEntityId());
        m.put("score", r.getScore());
        m.put("level", r.getLevel());
        m.put("factors", buildFactorOutput(r.getFactors()));
        m.put("last_calculated_at", r.getLastCalculatedAt());
        m.put("company_id", r.getCompanyId());

        if ("company".equals(r.getEntityType())) {
            companyRepo.findById(r.getEntityId()).ifPresent(c -> {
                Map<String, Object> co = new LinkedHashMap<>();
                co.put("name", c.getName());
                m.put("company", co);
            });
        } else if ("user".equals(r.getEntityType())) {
            userRepo.findById(r.getEntityId()).ifPresent(u -> {
                Map<String, Object> uo = new LinkedHashMap<>();
                uo.put("name", u.getName());
                uo.put("email", u.getEmail());
                m.put("user", uo);
            });
        }
        return m;
    }

    /**
     * Translate stored factor maps into the frontend-expected shape:
     * { name, score, weight, description }
     * Node stores factors as { factor, weight, detail } — we map those fields.
     */
    private List<Map<String, Object>> buildFactorOutput(List<Map<String, Object>> raw) {
        if (raw == null) return List.of();
        return raw.stream().map(f -> {
            Map<String, Object> out = new LinkedHashMap<>();
            String name = f.getOrDefault("factor", "unknown").toString();
            Object w = f.getOrDefault("weight", 0);
            int weight = w instanceof Number n ? n.intValue() : 0;
            out.put("name", name);
            out.put("score", weight);
            out.put("weight", weight);
            out.put("description", f.getOrDefault("detail", name));
            return out;
        }).toList();
    }

    private Map<String, Object> factor(String name, int weight, String detail) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("factor", name);
        f.put("weight", weight);
        f.put("detail", detail);
        return f;
    }

    private String scoreToLevel(int score) {
        if (score >= 75) return "critical";
        if (score >= 50) return "high";
        if (score >= 25) return "medium";
        return "low";
    }
}
