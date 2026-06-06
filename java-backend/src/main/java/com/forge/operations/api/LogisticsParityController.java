package com.forge.operations.api;

import com.forge.operations.service.LogisticsParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import java.util.Map;
import java.util.UUID;

/**
 * Java parity of Node.js logisticsRoutes.js.
 *
 * GET    /api/logistics/carriers
 * GET    /api/logistics/shipment-methods
 * GET    /api/logistics/project/{projectId}
 * PUT    /api/logistics/project/{projectId}                     (authorize admin, logistics)
 * POST   /api/logistics/project/{projectId}/ship                (authorize admin, logistics)
 * POST   /api/logistics/project/{projectId}/close               (authorize admin)
 * POST   /api/logistics/project/{projectId}/packing-list-pdf    (stub — PDF via Node.js)
 * POST   /api/logistics/project/{projectId}/tracking-slip       (multipart)
 */
@RestController
@RequestMapping("/api/logistics")
public class LogisticsParityController {

    private final LogisticsParityService logisticsParityService;
    private final OperationAccessPolicy accessPolicy;

    public LogisticsParityController(LogisticsParityService logisticsParityService,
                                     OperationAccessPolicy accessPolicy) {
        this.logisticsParityService = logisticsParityService;
        this.accessPolicy = accessPolicy;
    }

    // ── GET /api/logistics/carriers ───────────────────────────────────────────

    @GetMapping("/carriers")
    public ResponseEntity<?> getCarriers(Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(logisticsParityService.getCarriers()));
    }

    // ── GET /api/logistics/shipment-methods ───────────────────────────────────

    @GetMapping("/shipment-methods")
    public ResponseEntity<?> getShipmentMethods(Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(logisticsParityService.getShipmentMethods()));
    }

    // ── GET /api/logistics/project/{projectId} ────────────────────────────────

    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProjectId(@PathVariable UUID projectId,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(
                logisticsParityService.getLogisticsData(projectId, user)));
    }

    // ── PUT /api/logistics/project/{projectId} ────────────────────────────────

    @PutMapping("/project/{projectId}")
    public ResponseEntity<?> update(@PathVariable UUID projectId,
                                    @RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "logistics");
        return ResponseEntity.ok(ApiEnvelope.success(
                logisticsParityService.updateLogistics(projectId, body, user)));
    }

    // ── POST /api/logistics/project/{projectId}/ship ──────────────────────────

    @PostMapping("/project/{projectId}/ship")
    public ResponseEntity<?> markShipped(@PathVariable UUID projectId,
                                         @RequestBody(required = false) Map<String, Object> body,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "logistics");
        return ResponseEntity.ok(ApiEnvelope.success(
                logisticsParityService.markAsShipped(projectId, body == null ? Map.of() : body, user)));
    }

    // ── POST /api/logistics/project/{projectId}/close ─────────────────────────

    @PostMapping("/project/{projectId}/close")
    public ResponseEntity<?> closeProject(@PathVariable UUID projectId,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin");
        return ResponseEntity.ok(ApiEnvelope.success(
                logisticsParityService.closeProject(projectId, user)));
    }

    // ── POST /api/logistics/project/{projectId}/packing-list-pdf ──────────────

    @PostMapping("/project/{projectId}/packing-list-pdf")
    public ResponseEntity<?> generatePackingListPdf(@PathVariable UUID projectId, @RequestBody java.util.Map<String, Object> req, Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        com.forge.configurator.entity.DocumentEntity doc = logisticsParityService.generatePackingListPdf(projectId, req, user);
        com.forge.operations.service.DocumentLifecycleService.DownloadPayload payload = logisticsParityService.readDocument(doc.getId(), user);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(payload.contentType() == null ? MediaType.APPLICATION_PDF_VALUE : payload.contentType()));
        headers.setContentDisposition(ContentDisposition.attachment().filename(payload.fileName()).build());
        return new ResponseEntity<>(payload.bytes(), headers, HttpStatus.OK);
    }

    // ── POST /api/logistics/project/{projectId}/tracking-slip  (multipart) ────

    @PostMapping(value = "/project/{projectId}/tracking-slip",
                 consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadTrackingSlip(@PathVariable UUID projectId,
                                                @RequestParam("file") MultipartFile file,
                                                Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("No file uploaded"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(
                logisticsParityService.uploadTrackingSlip(projectId, file, user)));
    }
}


