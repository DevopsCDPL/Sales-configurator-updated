package com.forge.operations.api;

import com.forge.operations.entity.ClientEntity;
import com.forge.operations.service.ClientParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.ParityMapper;
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

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/clients")
public class ClientParityController {
    private final ClientParityService clientParityService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public ClientParityController(ClientParityService clientParityService,
                                  OperationAccessPolicy accessPolicy,
                                  ParityMapper mapper) {
        this.clientParityService = clientParityService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam Map<String, String> query,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<ClientEntity> rows = clientParityService.getAllClients(query, user);
        List<Map<String, Object>> data = rows.stream().map(mapper::toClientMap).toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable("id") UUID id,
                                     Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        ClientEntity row = clientParityService.getClientById(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(mapper.toClientMap(row)));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        ClientEntity row = clientParityService.createClient(body, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(mapper.toClientMap(row)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable("id") UUID id,
                                    @RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        ClientEntity row = clientParityService.updateClient(id, body, user);
        return ResponseEntity.ok(ApiEnvelope.success(mapper.toClientMap(row)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable("id") UUID id,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = clientParityService.deleteClient(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(result));
    }
}
