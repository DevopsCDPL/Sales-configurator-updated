package com.forge.operations.api;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.operations.service.DocumentLifecycleService;
import com.forge.operations.service.InvoiceParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/invoices")
public class InvoiceParityController {

    private final InvoiceParityService service;
    private final OperationAccessPolicy accessPolicy;

    public InvoiceParityController(InvoiceParityService service, OperationAccessPolicy accessPolicy) {
        this.service = service;
        this.accessPolicy = accessPolicy;
    }

    // ── Most-specific routes first (avoid Spring ambiguity) ───────────────────

    /** GET /api/invoices/auto-populate/:projectId */
    @GetMapping("/auto-populate/{projectId}")
    public ResponseEntity<?> autoPopulate(@PathVariable UUID projectId, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(service.getAutoPopulatedData(projectId, user)));
    }

    /** GET /api/invoices/analytics/metrics */
    @GetMapping("/analytics/metrics")
    public ResponseEntity<?> analyticsMetrics(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(service.getAnalyticsMetrics(user)));
    }

    /** GET /api/invoices/all — all invoices visible to the caller's company */
    @GetMapping("/all")
    public ResponseEntity<?> getAll(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<Map<String, Object>> invoices = service.getAll(user);
        return ResponseEntity.ok(ApiEnvelope.success(invoices));
    }

    /** POST /api/invoices/ */
    @PostMapping
    public ResponseEntity<?> create(@org.springframework.web.bind.annotation.RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        return ResponseEntity.ok(ApiEnvelope.success(service.create(body, user)));
    }

    /** GET /api/invoices/project/:projectId */
    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProject(@PathVariable UUID projectId, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(service.getByProjectId(projectId, user)));
    }

    /** GET /api/invoices/:id/pdf */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<?> getPdf(@PathVariable UUID id, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity doc = service.generateInvoicePdf(id, user);
        DocumentLifecycleService.DownloadPayload payload = service.readDocument(doc.getId(), user);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                payload.contentType() != null ? payload.contentType() : MediaType.APPLICATION_PDF_VALUE));
        headers.setContentDisposition(ContentDisposition.attachment().filename(payload.fileName()).build());
        return new ResponseEntity<>(payload.bytes(), headers, HttpStatus.OK);
    }

    /** GET /api/invoices/:id */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(service.getById(id, user)));
    }

    /** PUT /api/invoices/:id */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable UUID id,
                                    @org.springframework.web.bind.annotation.RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        return ResponseEntity.ok(ApiEnvelope.success(service.update(id, body, user)));
    }

    /** DELETE /api/invoices/:id */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable UUID id, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin");
        service.delete(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("message", "Invoice deleted")));
    }
}
