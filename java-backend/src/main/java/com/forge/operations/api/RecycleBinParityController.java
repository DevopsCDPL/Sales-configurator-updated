package com.forge.operations.api;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.RecycleBinParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/recycle-bin")
public class RecycleBinParityController {
    private final RecycleBinParityService recycleBinParityService;
    private final OperationAccessPolicy accessPolicy;

    public RecycleBinParityController(RecycleBinParityService recycleBinParityService,
                                      OperationAccessPolicy accessPolicy) {
        this.recycleBinParityService = recycleBinParityService;
        this.accessPolicy = accessPolicy;
    }

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(value = "module", required = false) String module,
                                  @RequestParam(value = "search", required = false) String search,
                                  @RequestParam(value = "page", defaultValue = "1") int page,
                                  @RequestParam(value = "limit", defaultValue = "50") int limit,
                                  Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> data = recycleBinParityService.list(module, search, page, limit, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping("/{module}/{id}/restore")
    public ResponseEntity<?> restore(@PathVariable("module") String module,
                                     @PathVariable("id") UUID id,
                                     Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> data = recycleBinParityService.restore(module, id, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @DeleteMapping("/{module}/{id}")
    public ResponseEntity<?> permanentDelete(@PathVariable("module") String module,
                                             @PathVariable("id") UUID id,
                                             Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> data = recycleBinParityService.permanentDelete(module, id, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping("/bulk-restore")
    public ResponseEntity<?> bulkRestore(@RequestBody Map<String, Object> body,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<Map<String, Object>> items = items(body.get("items"));
        if (items.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "items array is required");
        }
        Map<String, Object> data = recycleBinParityService.bulkRestore(items, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<?> bulkDelete(@RequestBody Map<String, Object> body,
                                        Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<Map<String, Object>> items = items(body.get("items"));
        if (items.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "items array is required");
        }
        Map<String, Object> data = recycleBinParityService.bulkPermanentDelete(items, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    private List<Map<String, Object>> items(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object row : list) {
            if (row instanceof Map<?, ?> mapAny) {
                Map<String, Object> item = new LinkedHashMap<>();
                mapAny.forEach((k, v) -> item.put(String.valueOf(k), v));
                rows.add(item);
            }
        }
        return rows;
    }
}
