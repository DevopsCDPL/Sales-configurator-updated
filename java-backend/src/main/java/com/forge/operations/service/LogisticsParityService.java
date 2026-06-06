package com.forge.operations.service;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.repository.CarrierRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Java parity of Node.js logisticsService.js.
 *
 * All logistics data is stored directly on the projects table.
 * Packing lists are stored in projects.packages_json (already a jsonb column).
 *
 * PDF generation (generatePackingListPdf) is NOT ported — the Node.js backend
 * handles that. The controller exposes a 501 stub for that route.
 */
@Service
public class LogisticsParityService {

    private final ProjectRepository projectRepository;
    private final CarrierRepository carrierRepository;
    private final OperationAccessPolicy accessPolicy;
    private final DocumentLifecycleService documentLifecycleService;

    public LogisticsParityService(ProjectRepository projectRepository,
                                  CarrierRepository carrierRepository,
                                  OperationAccessPolicy accessPolicy,
                                  DocumentLifecycleService documentLifecycleService) {
        this.projectRepository = projectRepository;
        this.carrierRepository = carrierRepository;
        this.accessPolicy = accessPolicy;
        this.documentLifecycleService = documentLifecycleService;
    }

    // ── Carriers ──────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getCarriers() {
        return carrierRepository.findAll().stream()
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id",      c.getId());
                    m.put("carrier", c.getCarrier());
                    return (Map<String, Object>) m;
                })
                .toList();
    }

    // ── Shipment methods (static) ─────────────────────────────────────────────

    public List<Map<String, Object>> getShipmentMethods() {
        return List.of(
                Map.of("value", "ground",   "label", "Ground Shipping"),
                Map.of("value", "air",      "label", "Air Freight"),
                Map.of("value", "sea",      "label", "Sea Freight"),
                Map.of("value", "express",  "label", "Express Delivery"),
                Map.of("value", "pickup",   "label", "Customer Pickup")
        );
    }

    // ── Get logistics ─────────────────────────────────────────────────────────

    public Map<String, Object> getLogisticsData(UUID projectId, AuthenticatedUser user) {
        ProjectEntity project = resolveProject(projectId, accessPolicy.resolveCompanyScope(user));
        return toLogisticsMap(project);
    }

    // ── Update logistics ──────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> updateLogistics(UUID projectId, Map<String, Object> body, AuthenticatedUser user) {
        ProjectEntity project = resolveProject(projectId, accessPolicy.resolveCompanyScope(user));

        List<String> allowedStatuses = List.of("order_confirmed", "in_production", "inspected", "shipped", "closed");
        if (!allowedStatuses.contains(project.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Logistics can only be updated for projects in production or later");
        }

        String shipToAddress    = coalesceStr(body.get("ship_to_address"), body.get("shipping_address"));
        String shipmentMethod   = strVal(body.get("shipment_method"));
        String packagingDetails = coalesceStr(body.get("packaging_details"), body.get("packaging"));
        String dispatchDateStr  = coalesceStr(body.get("dispatch_date"), body.get("ship_date"));
        String trackingNumber   = strVal(body.get("tracking_number"));
        String carrier          = strVal(body.get("carrier"));
        String notes            = coalesceStr(body.get("notes"), body.get("special_instructions"));
        Object packagesJson     = body.get("packages_json");

        if (shipToAddress    != null) project.setShipToAddress(shipToAddress);
        if (shipmentMethod   != null) project.setShipmentMethod(shipmentMethod);
        if (packagingDetails != null) project.setPackagingDetails(packagingDetails);
        if (dispatchDateStr  != null) project.setDispatchDate(parseInstant(dispatchDateStr));
        if (trackingNumber   != null) project.setTrackingNumber(trackingNumber);
        if (carrier          != null) project.setCarrier(carrier);
        if (notes            != null) project.setLogisticsNotes(notes);
        if (packagesJson != null) {
            @SuppressWarnings("unchecked")
            var pj = (List<Map<String, Object>>) packagesJson;
            project.setPackagesJson(pj);
        }
        project.setUpdatedAt(Instant.now());
        projectRepository.save(project);
        return toLogisticsMap(project);
    }

    // ── Mark as shipped ───────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> markAsShipped(UUID projectId, Map<String, Object> body, AuthenticatedUser user) {
        ProjectEntity project = resolveProject(projectId, accessPolicy.resolveCompanyScope(user));

        if (!"inspected".equals(project.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Only inspected projects can be marked as shipped");
        }

        String dispatchDateStr = coalesceStr(body.get("dispatch_date"), body.get("ship_date"));
        if (dispatchDateStr == null || dispatchDateStr.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Please set dispatch date before marking as shipped");
        }

        project.setStatus("shipped");
        project.setDispatchDate(parseInstant(dispatchDateStr));

        String trackingNumber   = strVal(body.get("tracking_number"));
        String carrier          = strVal(body.get("carrier"));
        String shipmentMethod   = strVal(body.get("shipment_method"));
        String shipToAddress    = coalesceStr(body.get("shipping_address"), body.get("ship_to_address"));
        String packagingDetails = coalesceStr(body.get("packaging"), body.get("packaging_details"));
        String notes            = coalesceStr(body.get("special_instructions"), body.get("notes"));
        Object packagesJson     = body.get("packages_json");

        if (trackingNumber   != null) project.setTrackingNumber(trackingNumber);
        if (carrier          != null) project.setCarrier(carrier);
        if (shipmentMethod   != null) project.setShipmentMethod(shipmentMethod);
        if (shipToAddress    != null) project.setShipToAddress(shipToAddress);
        if (packagingDetails != null) project.setPackagingDetails(packagingDetails);
        if (notes            != null) project.setLogisticsNotes(notes);
        if (packagesJson != null) {
            @SuppressWarnings("unchecked")
            var pj = (List<Map<String, Object>>) packagesJson;
            project.setPackagesJson(pj);
        }
        project.setUpdatedAt(Instant.now());
        projectRepository.save(project);
        return toLogisticsMap(project);
    }

    // ── Close project ─────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> closeProject(UUID projectId, AuthenticatedUser user) {
        ProjectEntity project = resolveProject(projectId, accessPolicy.resolveCompanyScope(user));

        if (!"shipped".equals(project.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Only shipped projects can be closed");
        }

        project.setStatus("closed");
        project.setUpdatedAt(Instant.now());
        projectRepository.save(project);
        return toLogisticsMap(project);
    }

    // ── Generate Packing List PDF ─────────────────────────────────────────────

    @Transactional
    public com.forge.configurator.entity.DocumentEntity generatePackingListPdf(UUID projectId, java.util.Map<String, Object> req, AuthenticatedUser user) {
        ProjectEntity project = resolveProject(projectId, accessPolicy.resolveCompanyScope(user));
        return documentLifecycleService.generateProjectDocument(projectId, "packing_list", req, user);
    }

    public DocumentLifecycleService.DownloadPayload readDocument(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.readDocument(documentId, user, false);
    }

    // ── Upload tracking slip ──────────────────────────────────────────────────

    public Map<String, Object> uploadTrackingSlip(UUID projectId, MultipartFile file, AuthenticatedUser user) {
        resolveProject(projectId, accessPolicy.resolveCompanyScope(user));
        DocumentEntity doc = documentLifecycleService.uploadProjectDocument(
                projectId, file, "tracking_slip",
                "Tracking Slip - " + file.getOriginalFilename(), null, user);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("file_path", doc.getFilePath());
        m.put("file_name", doc.getFileName());
        return m;
    }

    // ── Mapper ────────────────────────────────────────────────────────────────

    public Map<String, Object> toLogisticsMap(ProjectEntity p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("project_id",          p.getId());
        m.put("ship_to_address",     p.getShipToAddress());
        m.put("shipping_address",    p.getShipToAddress());
        m.put("shipment_method",     p.getShipmentMethod());
        m.put("packaging_details",   p.getPackagingDetails());
        m.put("packaging",           p.getPackagingDetails());
        m.put("dispatch_date",       p.getDispatchDate());
        m.put("ship_date",           p.getDispatchDate());
        m.put("tracking_number",     p.getTrackingNumber());
        m.put("carrier",             p.getCarrier());
        m.put("notes",               p.getLogisticsNotes());
        m.put("special_instructions", p.getLogisticsNotes());
        m.put("packages_json",       p.getPackagesJson() == null ? List.of() : p.getPackagesJson());
        m.put("status",              p.getStatus());
        return m;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ProjectEntity resolveProject(UUID projectId, UUID companyScope) {
        ProjectEntity project = companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(projectId).orElse(null)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyScope).orElse(null);
        if (project == null) throw new ApiException(HttpStatus.NOT_FOUND, "Project not found");
        return project;
    }

    private Instant parseInstant(String value) {
        if (value == null || value.isBlank()) return null;
        if (value.length() == 10) {
            return LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC);
        }
        return Instant.parse(value);
    }

    private String strVal(Object v) {
        return v != null ? v.toString() : null;
    }

    /** Returns first non-null string from the provided values. */
    private String coalesceStr(Object... values) {
        for (Object v : values) {
            if (v != null && !v.toString().isBlank()) return v.toString();
        }
        return null;
    }
}


