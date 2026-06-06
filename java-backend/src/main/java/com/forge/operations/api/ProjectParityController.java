package com.forge.operations.api;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.ParityMapper;
import com.forge.operations.service.ProjectParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.operations.entity.ProjectAnalyticsEntity;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/projects")
public class ProjectParityController {
    private final ProjectParityService projectParityService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    private static final Logger log = LoggerFactory.getLogger(ProjectParityController.class);

    public ProjectParityController(ProjectParityService projectParityService,
                                   OperationAccessPolicy accessPolicy,
                                   ParityMapper mapper) {
        this.projectParityService = projectParityService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    @GetMapping("/workflow")
    public ResponseEntity<?> getStatusWorkflow() {
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.getStatusWorkflow()));
    }

    @GetMapping("/next-quotation-number")
    public ResponseEntity<?> getNextQuotationNumber(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.getNextQuotationNumber(user)));
    }

    @GetMapping("/next-project-number")
    public ResponseEntity<?> getNextProjectNumber(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.getNextProjectNumber(user)));
    }

    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam Map<String, String> query,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        log.info("GET /api/projects called by user{}", user.email());
        List<Map<String, Object>> data = projectParityService.getAllEnrichedProjects(query, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable("id") UUID id,
                                     Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> data = projectParityService.getEnrichedProjectById(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        var row = projectParityService.createProject(body, user);
        Map<String, Object> data = projectParityService.buildEnrichedProjectMap(row);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(data));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable("id") UUID id,
                                    @RequestBody Map<String, Object> body,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        var row = projectParityService.updateProject(id, body, user);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.buildEnrichedProjectMap(row)));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable("id") UUID id,
                                          @RequestBody Map<String, Object> body,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        String status = text(body.get("status"));
        var row = projectParityService.updateProjectStatus(id, status, user);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.buildEnrichedProjectMap(row)));
    }

    @PatchMapping("/{id}/advance-workflow")
    public ResponseEntity<?> advanceWorkflow(@PathVariable("id") UUID id,
                                             @RequestBody Map<String, Object> body,
                                             Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Integer completedStep = asInteger(body.get("completedStep"));
        var row = projectParityService.advanceWorkflow(id, completedStep, user);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.buildEnrichedProjectMap(row)));
    }

    @PostMapping("/{id}/copy")
    public ResponseEntity<?> copy(@PathVariable("id") UUID id,
                                  Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        var row = projectParityService.copyProject(id, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(projectParityService.buildEnrichedProjectMap(row)));
    }

    @PatchMapping("/{id}/select-revision")
    public ResponseEntity<?> selectRevision(@PathVariable("id") UUID id,
                                            @RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Integer revision = asInteger(body.get("revision"));
        var row = projectParityService.selectRevision(id, revision, user);
        return ResponseEntity.ok(ApiEnvelope.success(projectParityService.buildEnrichedProjectMap(row)));
    }

    @PatchMapping("/{id}/traveler-type")
    public ResponseEntity<?> travelerType(@PathVariable("id") UUID id,
                                          @RequestBody Map<String, Object> body,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        String travelerType = text(body.get("production_traveler_type"));
        ProjectEntity row = projectParityService.updateTravelerType(id, travelerType, user);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", row.getId());
        data.put("production_traveler_type", row.getProductionTravelerType());
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable("id") UUID id,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = projectParityService.deleteProject(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(result));
    }

    @GetMapping("/{id}/analytics")
    public ResponseEntity<?> getAnalytics(@PathVariable("id") UUID id,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<ProjectAnalyticsEntity> rows = projectParityService.getAnalytics(id, user);
        List<Map<String, Object>> data = rows.stream().map(mapper::toProjectAnalyticsMap).toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping("/{id}/analytics")
    public ResponseEntity<?> saveAnalytics(@PathVariable("id") UUID id,
                                           @RequestBody Map<String, Object> body,
                                           Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<Map<String, Object>> items = listOfMap(body.get("items"));
        List<ProjectAnalyticsEntity> rows = projectParityService.saveAnalytics(id, items, user);
        List<Map<String, Object>> data = rows.stream().map(mapper::toProjectAnalyticsMap).toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping("/{id}/commission")
    public ResponseEntity<?> commission(@PathVariable("id") UUID id,
                                        @RequestBody Map<String, Object> body,
                                        Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<Map<String, Object>> items = listOfMap(body.get("items"));
        Map<String, Object> result = projectParityService.commissionProject(id, items, user);

        Map<String, Object> response = ApiEnvelope.success(result.get("data"));
        response.put("message", result.get("message"));
        return ResponseEntity.ok(response);
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Integer asInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private List<Map<String, Object>> listOfMap(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object row : list) {
            if (row instanceof Map<?, ?> mapAny) {
                Map<String, Object> map = new LinkedHashMap<>();
                mapAny.forEach((k, v) -> map.put(String.valueOf(k), v));
                rows.add(map);
            }
        }
        return rows;
    }
}
