package com.forge.operations.api;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.WorkOrderParityService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;

import org.springframework.web.bind.annotation.RequestBody;

@RestController
@RequestMapping("/api/work-orders")
public class WorkOrderParityController {
    
    private final WorkOrderParityService workOrderParityService;
    private final OperationAccessPolicy operationAccessPolicy;
    private final R2StorageService r2StorageService;

    public WorkOrderParityController(WorkOrderParityService workOrderParityService, 
                                    OperationAccessPolicy operationAccessPolicy,
                                    R2StorageService r2StorageService
    ){
        this.workOrderParityService = workOrderParityService;
        this.operationAccessPolicy = operationAccessPolicy;
        this.r2StorageService = r2StorageService;
    }

    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProjectId(@PathVariable UUID projectId,
                                            Authentication authentication
    ) {
        operationAccessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(workOrderParityService.getByProjectId(projectId)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id, Authentication authentication) {
        operationAccessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(workOrderParityService.getById(id)));
    }

    @PostMapping
    public ResponseEntity<?> createWorkOrder(@RequestBody Map<String, Object> body,
        Authentication authentication
    ) {
        AuthenticatedUser user = operationAccessPolicy.requirePrincipal(authentication);
        UUID companyId = operationAccessPolicy.resolveCompanyScope(user);
        return ResponseEntity.ok(ApiEnvelope.success(workOrderParityService.createWorkOrder(body, companyId)));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateWorkOrder(@PathVariable UUID id,
        @RequestBody Map<String, Object> body,
        Authentication authentication
    ) {
        operationAccessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(workOrderParityService.updateWorkOrder(id, body)));
    }

    @GetMapping("{id}/traveller")
    public ResponseEntity<byte[]> generatePdf(@PathVariable UUID id,
        Authentication authentication
    ) {
        AuthenticatedUser user = operationAccessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = workOrderParityService.generateWorkOrderPdf(id, user);

        String r2Key   = (String) result.get("r2_url");
        String fileName = (String) result.getOrDefault("file_name", "work_order.pdf");

        R2StorageService.DownloadedObject obj = r2StorageService.download(r2Key);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment().filename(fileName).build());

        return new ResponseEntity<>(obj.buffer(), headers, HttpStatus.OK);
    }
    
}
