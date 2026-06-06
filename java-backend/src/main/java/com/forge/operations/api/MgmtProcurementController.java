package com.forge.operations.api;

import com.forge.operations.service.MgmtProcurementParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/mgmt-procurement")
public class MgmtProcurementController {

    private final MgmtProcurementParityService svc;
    private final OperationAccessPolicy accessPolicy;

    public MgmtProcurementController(MgmtProcurementParityService svc,
                                      OperationAccessPolicy accessPolicy) {
        this.svc = svc;
        this.accessPolicy = accessPolicy;
    }

    // ── RFQ Routes ────────────────────────────────────────────────────────

    @GetMapping("/rfqs")
    public ResponseEntity<?> getAllRFQs(@RequestParam(required = false) Map<String, String> query,
                                        Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getAllRFQs(query, user)));
    }

    @GetMapping("/rfqs/{id}")
    public ResponseEntity<?> getRFQById(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getRFQById(id)));
    }

    @PostMapping("/rfqs")
    public ResponseEntity<?> createRFQ(@RequestBody Map<String, Object> body, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        List<Map<String, Object>> rfqs = svc.createRFQ(body, user);
        Map<String, Object> response = ApiEnvelope.success(rfqs);
        response.put("message", rfqs.size() + " RFQ(s) created successfully");
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/rfqs/{id}")
    public ResponseEntity<?> updateRFQ(@PathVariable UUID id,
                                        @RequestBody Map<String, Object> body,
                                        Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.updateRFQ(id, body, user)));
    }

    @PatchMapping("/rfqs/{id}/send")
    public ResponseEntity<?> sendRFQ(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.sendRFQ(id)));
    }

    @DeleteMapping("/rfqs/{id}")
    public ResponseEntity<?> deleteRFQ(@PathVariable UUID id,
                                        @RequestParam(required = false, defaultValue = "false") boolean force,
                                        Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.deleteRFQ(id, force, user)));
    }

    @GetMapping("/rfqs/{id}/pdf")
    public ResponseEntity<?> downloadRFQPdf(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        // PDF generation not implemented in Java backend — return stub
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(ApiEnvelope.error("PDF generation is not available in this deployment"));
    }

    @PostMapping("/rfqs/{id}/email")
    public ResponseEntity<?> sendRFQEmail(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.sendRFQEmail(id)));
    }

    @PostMapping("/rfqs/{id}/copy")
    public ResponseEntity<?> copyRFQ(@PathVariable UUID id, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(svc.copyRFQ(id, user)));
    }

    @PostMapping("/rfqs/bulk-delete")
    public ResponseEntity<?> bulkDeleteRFQs(@RequestBody Map<String, Object> body, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        @SuppressWarnings("unchecked")
        List<String> idStrings = (List<String>) body.get("ids");
        if (idStrings == null || idStrings.isEmpty())
            return ResponseEntity.badRequest().body(ApiEnvelope.error("ids array is required"));
        List<UUID> ids = idStrings.stream().map(UUID::fromString).toList();
        boolean force = Boolean.TRUE.equals(body.get("force"));
        return ResponseEntity.ok(ApiEnvelope.success(svc.bulkDeleteRFQs(ids, force, user)));
    }

    // ── PO Routes ─────────────────────────────────────────────────────────

    @GetMapping("/pos")
    public ResponseEntity<?> getAllPOs(@RequestParam(required = false) Map<String, String> query,
                                       Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getAllPOs(query, user)));
    }

    @GetMapping("/pos/{id}")
    public ResponseEntity<?> getPOById(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getPOById(id)));
    }

    @PostMapping("/pos")
    public ResponseEntity<?> createPO(@RequestBody Map<String, Object> body, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(svc.createPO(body, user)));
    }

    @PutMapping("/pos/{id}")
    public ResponseEntity<?> updatePO(@PathVariable UUID id,
                                       @RequestBody Map<String, Object> body,
                                       Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.updatePO(id, body)));
    }

    @PatchMapping("/pos/{id}/send")
    public ResponseEntity<?> sendPO(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.sendPO(id)));
    }

    @PatchMapping("/pos/{id}/ordered")
    public ResponseEntity<?> markOrdered(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.markOrdered(id)));
    }

    @PatchMapping("/pos/{id}/received")
    public ResponseEntity<?> markReceived(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.markReceived(id)));
    }

    @PostMapping("/pos/{id}/copy")
    public ResponseEntity<?> copyPO(@PathVariable UUID id, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(svc.copyPO(id, user)));
    }

    @DeleteMapping("/pos/{id}")
    public ResponseEntity<?> deletePO(@PathVariable UUID id, Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.deletePO(id, user)));
    }

    @GetMapping("/pos/{id}/pdf")
    public ResponseEntity<?> downloadPOPdf(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(ApiEnvelope.error("PDF generation is not available in this deployment"));
    }

    @PostMapping("/pos/{id}/email")
    public ResponseEntity<?> sendPOEmail(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.sendPOEmail(id)));
    }

    // ── Purchased Materials ───────────────────────────────────────────────

    @GetMapping("/purchased-materials")
    public ResponseEntity<?> getPurchasedMaterials(@RequestParam(required = false) Map<String, String> query,
                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(svc.getPurchasedMaterials(query, user)));
    }
}
