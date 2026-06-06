package com.forge.operations.api;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.RawMaterialParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/raw-materials")
public class RawMaterialParityController {

    private final RawMaterialParityService rawMaterialService;
    private final OperationAccessPolicy accessPolicy;

    public RawMaterialParityController(RawMaterialParityService rawMaterialService,
                                       OperationAccessPolicy accessPolicy) {
        this.rawMaterialService = rawMaterialService;
        this.accessPolicy = accessPolicy;
    }

    // ── Static Lookup Endpoints ─────────────────────────────────────────

    @GetMapping("/lookup/catalog")
    public ResponseEntity<?> getCatalog() {
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getCatalogAndDensityMap()));
    }

    @GetMapping("/lookup/categories")
    public ResponseEntity<?> getCategories() {
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getCategories()));
    }

    @GetMapping("/lookup/grades/{category}")
    public ResponseEntity<?> getGrades(@PathVariable String category) {
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getGradesForCategory(category)));
    }

    @GetMapping("/lookup/conditions/{category}/{grade}")
    public ResponseEntity<?> getConditions(@PathVariable String category,
                                                                    @PathVariable String grade) {
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getConditionsForGrade(category, grade)));
    }

    @GetMapping("/lookup/density/{category}/{grade}")
    public ResponseEntity<?> getDensity(@PathVariable String category,
                                                                        @PathVariable String grade) {
        Double density = rawMaterialService.getDensity(category, grade);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("density", density != null ? density : 0.0)));
    }

    @GetMapping("/lookup/forms")
    public ResponseEntity<?> getForms() {
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getFormOptions()));
    }

    @GetMapping("/lookup/shape/{form}")
    public ResponseEntity<?> getShapeForForm(@PathVariable String form) {
        String shape = rawMaterialService.getShapeForForm(form);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("shape", shape != null ? shape : "")));
    }

    // ── CRUD Endpoints ──────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) Map<String, String> query,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getAll(query, user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id,
                                                                     Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.getById(id)));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> payload,
                                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.create(payload, user)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable UUID id,
                                                                    @RequestBody Map<String, Object> payload,
                                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.update(id, payload, user)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable UUID id,
                                                                    Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.delete(id)));
    }

    @PatchMapping("/{id}/toggle-status")
    public ResponseEntity<?> toggleStatus(@PathVariable UUID id,
                                                                          Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.toggleStatus(id)));
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<?> bulkDelete(@RequestBody Map<String, Object> body,
                                                                        Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        @SuppressWarnings("unchecked")
        List<String> idStrings = (List<String>) body.get("ids");
        List<UUID> ids = idStrings.stream().map(UUID::fromString).toList();
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.bulkDelete(ids)));
    }

    @PostMapping("/duplicate/{id}")
    public ResponseEntity<?> duplicate(@PathVariable UUID id,
                                                                       Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(rawMaterialService.duplicate(id, user)));
    }
}
