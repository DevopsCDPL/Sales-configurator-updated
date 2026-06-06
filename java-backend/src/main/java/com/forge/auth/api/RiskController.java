package com.forge.auth.api;

import com.forge.auth.service.RiskService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/risk")
public class RiskController {

    private final RiskService riskService;
    private final OperationAccessPolicy accessPolicy;

    public RiskController(RiskService riskService, OperationAccessPolicy accessPolicy) {
        this.riskService = riskService;
        this.accessPolicy = accessPolicy;
    }

    /** GET /api/risk — all risk scores (scoped to company or all for platform_admin) */
    @GetMapping
    public ResponseEntity<?> getAll(Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        return ResponseEntity.ok(ApiEnvelope.success(riskService.getAllRiskScores(companyId)));
    }

    /** GET /api/risk/alerts — high + critical scores */
    @GetMapping("/alerts")
    public ResponseEntity<?> getAlerts(Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        UUID companyId = accessPolicy.resolveCompanyScope(user);
        return ResponseEntity.ok(ApiEnvelope.success(riskService.getAlerts(companyId)));
    }

    /** POST /api/risk/recalculate — main_admin / platform_admin only */
    @PostMapping("/recalculate")
    public ResponseEntity<?> recalculateAll(Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        if (!"main_admin".equals(user.role()) && !"platform_admin".equals(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return ResponseEntity.ok(ApiEnvelope.success(riskService.recalculateAll()));
    }

    /** GET /api/risk/company/{companyId} — calculate (or refresh) risk for a company */
    @GetMapping("/company/{companyId}")
    public ResponseEntity<?> calculateCompany(@PathVariable UUID companyId, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        // Non-platform_admin can only access their own company
        if (!"platform_admin".equals(user.role()) && !companyId.equals(user.companyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return ResponseEntity.ok(ApiEnvelope.success(riskService.calculateCompanyRisk(companyId)));
    }

    /** GET /api/risk/user/{userId} — calculate (or refresh) risk for a user */
    @GetMapping("/user/{userId}")
    public ResponseEntity<?> calculateUser(@PathVariable UUID userId, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(riskService.calculateUserRisk(userId)));
    }
}
