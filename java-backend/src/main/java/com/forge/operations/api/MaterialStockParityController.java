package com.forge.operations.api;

import com.forge.operations.service.MaterialParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/material-stock")
public class MaterialStockParityController {

    private final MaterialParityService materialService;
    private final OperationAccessPolicy accessPolicy;

    public MaterialStockParityController(MaterialParityService materialService,
                                         OperationAccessPolicy accessPolicy) {
        this.materialService = materialService;
        this.accessPolicy = accessPolicy;
    }

    @GetMapping
    public ResponseEntity<?> getAllStock(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(materialService.getAllStock(user)));
    }

    @PostMapping("/upsert")
    public ResponseEntity<?> upsertStock(@RequestBody Map<String, Object> body,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(materialService.upsertStock(body, user)));
    }
}
