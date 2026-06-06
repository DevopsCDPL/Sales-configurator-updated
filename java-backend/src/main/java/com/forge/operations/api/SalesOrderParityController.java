package com.forge.operations.api;

import com.forge.operations.entity.SalesOrderEntity;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.SalesOrderParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
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

import java.util.Map;
import java.util.UUID;

/**
 * Java parity of Node.js salesOrderRoutes.js.
 *
 * Routes:
 *  GET    /api/sales-orders/project/{projectId}
 *  POST   /api/sales-orders/project/{projectId}/upload-po
 *  POST   /api/sales-orders/project/{projectId}
 *  PUT    /api/sales-orders/{id}
 *  GET    /api/sales-orders/{id}/pdf   (stub – Node PDF not yet ported)
 */
@RestController
@RequestMapping("/api/sales-orders")
public class SalesOrderParityController {

    private final SalesOrderParityService salesOrderParityService;
    private final OperationAccessPolicy accessPolicy;

    public SalesOrderParityController(SalesOrderParityService salesOrderParityService,
                                      OperationAccessPolicy accessPolicy) {
        this.salesOrderParityService = salesOrderParityService;
        this.accessPolicy = accessPolicy;
    }

    /** GET /api/sales-orders/project/{projectId} */
    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProjectId(@PathVariable("projectId") UUID projectId,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        SalesOrderEntity so = salesOrderParityService.getSalesOrderByProjectId(projectId, user);
        return ResponseEntity.ok(ApiEnvelope.success(so != null ? salesOrderParityService.toMap(so) : null));
    }

    /**
     * POST /api/sales-orders/project/{projectId}/upload-po
     * Must be declared BEFORE the generic POST /project/{projectId} so Spring
     * matches the more-specific path first.
     */
    @PostMapping(value = "/project/{projectId}/upload-po", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadPoDocument(@PathVariable("projectId") UUID projectId,
                                              @RequestParam("po_document") MultipartFile file,
                                              Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiEnvelope.error("No file uploaded"));
        }
        SalesOrderEntity so = salesOrderParityService.uploadPoDocument(projectId, file, user);
        return ResponseEntity.ok(ApiEnvelope.success(salesOrderParityService.toMap(so)));
    }

    /** POST /api/sales-orders/project/{projectId}  (create or update) */
    @PostMapping("/project/{projectId}")
    public ResponseEntity<?> createOrUpdate(@PathVariable("projectId") UUID projectId,
                                            @RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        SalesOrderEntity so = salesOrderParityService.createOrUpdateSalesOrder(projectId, body, user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiEnvelope.success(salesOrderParityService.toMap(so)));
    }

    /** PUT /api/sales-orders/{id} */
    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable("id") UUID id,
                                    @RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        SalesOrderEntity so = salesOrderParityService.updateSalesOrder(id, body, user);
        return ResponseEntity.ok(ApiEnvelope.success(salesOrderParityService.toMap(so)));
    }

    /**
     * GET /api/sales-orders/{id}/pdf
     * PDF generation is not yet ported; return 501 so the frontend can gracefully
     * fall back to the Node service if needed.
     */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<?> generatePdf(@PathVariable("id") UUID id,
                                         Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(ApiEnvelope.error("Sales order PDF generation is not yet available in the Java service"));
    }
}
