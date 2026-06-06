package com.forge.operations.api;

import com.forge.operations.service.PlatformAdminService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/platform-admin")
public class PlatformAdminController {

    private final PlatformAdminService service;

    public PlatformAdminController(PlatformAdminService service) {
        this.service = service;
    }

    private AuthenticatedUser caller(Authentication auth) {
        return (AuthenticatedUser) auth.getPrincipal();
    }

    /* ── Dashboard ──────────────────────────────────────────────────────── */
    @GetMapping("/dashboard")
    public ResponseEntity<?> dashboard(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.getDashboardStats(caller(auth))));
    }

    /* ── Companies ──────────────────────────────────────────────────────── */
    @GetMapping("/companies")
    public ResponseEntity<?> listCompanies(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.listCompanies(caller(auth))));
    }

    @GetMapping("/companies/{id}")
    public ResponseEntity<?> getCompany(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.getCompany(id, caller(auth))));
    }

    @PostMapping(value = "/companies", consumes = "multipart/form-data")
    public ResponseEntity<?> createCompany(
            @RequestParam Map<String, String> body,
            @RequestPart(value = "logo", required = false) MultipartFile logo,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.createCompany(body, logo, caller(auth))));
    }

    @PutMapping(value = "/companies/{id}", consumes = "multipart/form-data")
    public ResponseEntity<?> updateCompany(
            @PathVariable UUID id,
            @RequestParam Map<String, String> body,
            @RequestPart(value = "logo", required = false) MultipartFile logo,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.updateCompany(id, body, logo, caller(auth))));
    }

    @PostMapping("/companies/{id}/activate")
    public ResponseEntity<?> activateCompany(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.activateCompany(id, caller(auth))));
    }

    @PostMapping("/companies/{id}/deactivate")
    public ResponseEntity<?> deactivateCompany(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.deactivateCompany(id, caller(auth))));
    }

    @PostMapping("/companies/{id}/enter")
    public ResponseEntity<?> enterCompany(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.enterCompany(id, caller(auth))));
    }

    @DeleteMapping("/companies/{id}")
    public ResponseEntity<?> deleteCompany(
            @PathVariable UUID id, Authentication auth) {
        service.deleteCompany(id, caller(auth));
        return ResponseEntity.ok(ApiEnvelope.success(null));
    }

    @PostMapping("/companies/{id}/reset-password")
    public ResponseEntity<?> resetOwnerPassword(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        String newPwd = body.get("password") == null ? null : body.get("password").toString();
        String email = service.resetOwnerPassword(id, newPwd, caller(auth));
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("email", email, "force_reset", true)));
    }

    /* ── Company users ──────────────────────────────────────────────────── */
    @GetMapping("/companies/{id}/users")
    public ResponseEntity<?> listCompanyUsers(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.listCompanyUsers(id, caller(auth))));
    }

    @PostMapping("/companies/{id}/users")
    public ResponseEntity<?> createCompanyUser(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.createCompanyUser(id, body, caller(auth))));
    }

    @PutMapping("/companies/{id}/users/{userId}")
    public ResponseEntity<?> updateCompanyUser(
            @PathVariable UUID id,
            @PathVariable UUID userId,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.updateCompanyUser(id, userId, body, caller(auth))));
    }

    @DeleteMapping("/companies/{id}/users/{userId}")
    public ResponseEntity<?> deleteCompanyUser(
            @PathVariable UUID id,
            @PathVariable UUID userId,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.deleteCompanyUser(id, userId, caller(auth))));
    }

    @PostMapping("/companies/{id}/users/bulk-delete")
    public ResponseEntity<?> bulkDeleteCompanyUsers(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        @SuppressWarnings("unchecked")
        List<String> rawIds = (List<String>) body.get("userIds");
        if (rawIds == null || rawIds.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("No user IDs provided"));
        }
        List<UUID> userIds = rawIds.stream().map(UUID::fromString).toList();
        return ResponseEntity.ok(ApiEnvelope.success(service.bulkDeleteCompanyUsers(id, userIds, caller(auth))));
    }

    @GetMapping("/companies/{id}/activity")
    public ResponseEntity<?> getCompanyActivity(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.getCompanyActivity(id, caller(auth))));
    }

    /* ── Platform admin users (/users mirrors Node.js routes) ───────────── */
    @GetMapping("/users")
    public ResponseEntity<?> listPlatformAdmins(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.listPlatformAdmins(caller(auth))));
    }

    @PostMapping("/users")
    public ResponseEntity<?> createPlatformAdmin(
            @RequestBody Map<String, Object> body, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.createPlatformAdmin(body, caller(auth))));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updatePlatformAdmin(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.updatePlatformAdmin(id, body, caller(auth))));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deletePlatformAdmin(
            @PathVariable UUID id, Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.deletePlatformAdmin(id, caller(auth))));
    }

    @PostMapping("/users/bulk-delete")
    public ResponseEntity<?> bulkDeleteUsers(
            @RequestBody Map<String, Object> body, Authentication auth) {
        @SuppressWarnings("unchecked")
        List<String> rawIds = (List<String>) body.get("userIds");
        if (rawIds == null || rawIds.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("No user IDs provided"));
        }
        List<UUID> userIds = rawIds.stream().map(UUID::fromString).toList();
        return ResponseEntity.ok(ApiEnvelope.success(service.bulkDeleteUsers(userIds, caller(auth))));
    }

    @PostMapping("/users/{userId}/reset-password")
    public ResponseEntity<?> resetUserPassword(
            @PathVariable UUID userId,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        String pwd = body.get("password") == null ? null : body.get("password").toString();
        if (pwd == null || pwd.length() < 6) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("Password must be at least 6 characters"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(service.resetUserPassword(userId, pwd, caller(auth))));
    }

    /* ── Company owners ─────────────────────────────────────────────────── */
    @GetMapping("/company-owners")
    public ResponseEntity<?> getCompanyOwners(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.getCompanyOwners(caller(auth))));
    }

    /* ── Subscription check ─────────────────────────────────────────────── */
    @PostMapping("/check-subscriptions")
    public ResponseEntity<?> checkSubscriptions(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.checkSubscriptions(caller(auth))));
    }

    /* ── Roles overview ─────────────────────────────────────────────────── */
    @GetMapping("/roles-overview")
    public ResponseEntity<?> getRolesOverview(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.getRolesOverview(caller(auth))));
    }

    /* ── Access control ─────────────────────────────────────────────────── */
    @GetMapping("/access-control/users")
    public ResponseEntity<?> accessControlUsers(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.listAccessControlUsers(caller(auth))));
    }

    @GetMapping("/access-control/companies")
    public ResponseEntity<?> accessControlCompanies(Authentication auth) {
        return ResponseEntity.ok(ApiEnvelope.success(service.listAccessControlCompanies(caller(auth))));
    }

    /* ── User activity ──────────────────────────────────────────────────── */
    @GetMapping("/user-activity")
    public ResponseEntity<?> getUserActivity(
            @RequestParam("user_id") String userId, Authentication auth) {
        if (userId == null || userId.isBlank()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("user_id query parameter is required"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(service.getUserActivity(userId, caller(auth))));
    }
}
