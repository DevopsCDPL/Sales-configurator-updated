package com.forge.operations.api;

import com.forge.operations.entity.VendorEntity;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.ParityMapper;
import com.forge.operations.service.VendorParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/vendors")
public class VendorParityController {
    private final VendorParityService vendorParityService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public VendorParityController(VendorParityService vendorParityService,
                                  OperationAccessPolicy accessPolicy,
                                  ParityMapper mapper) {
        this.vendorParityService = vendorParityService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam Map<String, String> query,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<VendorEntity> rows = vendorParityService.getAllVendors(query, user);
        List<Map<String, Object>> data = rows.stream().map(this::toVendorWithMaterials).toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping("/materials/all")
    public ResponseEntity<?> getAllMaterials(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(vendorParityService.getAllVendorMaterials(user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable("id") UUID id,
                                     Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        VendorEntity row = vendorParityService.getVendorById(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(toVendorWithMaterials(row)));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        VendorEntity row = vendorParityService.createVendor(body, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(toVendorWithMaterials(row)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable("id") UUID id,
                                    @RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        VendorEntity row = vendorParityService.updateVendor(id, body, user);
        return ResponseEntity.ok(ApiEnvelope.success(toVendorWithMaterials(row)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable("id") UUID id,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = vendorParityService.deleteVendor(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(result));
    }

    private Map<String, Object> toVendorWithMaterials(VendorEntity row) {
        Map<String, Object> data = new LinkedHashMap<>(mapper.toVendorMap(row));
        data.put("materials", vendorParityService.getVendorMaterials(row.getId()));
        return data;
    }
}
