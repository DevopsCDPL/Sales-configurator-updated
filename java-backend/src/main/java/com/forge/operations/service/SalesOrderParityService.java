package com.forge.operations.service;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ConfiguratorQuotationRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.SalesOrderEntity;
import com.forge.operations.entity.WorkOrderEntity;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.SalesOrderRepository;
import com.forge.operations.repository.WorkOrderRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Java parity of Node.js salesOrderService.js + salesOrderController.js.
 *
 * Mirrors the exact business logic:
 *  - GET  /api/sales-orders/project/:projectId
 *  - POST /api/sales-orders/project/:projectId        (create-or-update)
 *  - PUT  /api/sales-orders/:id                       (update)
 *  - POST /api/sales-orders/project/:projectId/upload-po
 */
@Service
public class SalesOrderParityService {

    private static final Logger log = LoggerFactory.getLogger(SalesOrderParityService.class);
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyyMM");

    private final SalesOrderRepository salesOrderRepository;
    private final ProjectRepository projectRepository;
    private final EstimateRepository estimateRepository;
    private final WorkOrderRepository workOrderRepository;
    private final ConfiguratorQuotationRepository configuratorQuotationRepository;
    private final SequenceNumberingService sequenceNumberingService;
    private final DocumentLifecycleService documentLifecycleService;
    private final OperationAccessPolicy accessPolicy;

    public SalesOrderParityService(SalesOrderRepository salesOrderRepository,
                                   ProjectRepository projectRepository,
                                   EstimateRepository estimateRepository,
                                   WorkOrderRepository workOrderRepository,
                                   ConfiguratorQuotationRepository configuratorQuotationRepository,
                                   SequenceNumberingService sequenceNumberingService,
                                   DocumentLifecycleService documentLifecycleService,
                                   OperationAccessPolicy accessPolicy) {
        this.salesOrderRepository = salesOrderRepository;
        this.projectRepository = projectRepository;
        this.estimateRepository = estimateRepository;
        this.workOrderRepository = workOrderRepository;
        this.configuratorQuotationRepository = configuratorQuotationRepository;
        this.sequenceNumberingService = sequenceNumberingService;
        this.documentLifecycleService = documentLifecycleService;
        this.accessPolicy = accessPolicy;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // GET by project
    // ──────────────────────────────────────────────────────────────────────────

    public SalesOrderEntity getSalesOrderByProjectId(UUID projectId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);
        return salesOrderRepository.findByProjectId(project.getId()).orElse(null);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Create or update (mirrors salesOrderService.createSalesOrder)
    // ──────────────────────────────────────────────────────────────────────────

    @Transactional
    public SalesOrderEntity createOrUpdateSalesOrder(UUID projectId,
                                                     Map<String, Object> body,
                                                     AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        // Backfill company_id on the project if missing (mirrors Node logic)
        UUID effectiveCompanyId = project.getCompanyId();
        if (effectiveCompanyId == null) {
            effectiveCompanyId = companyScope != null ? companyScope : user.companyId();
            if (effectiveCompanyId != null) {
                project.setCompanyId(effectiveCompanyId);
                projectRepository.save(project);
            }
        }
        final UUID companyId = effectiveCompanyId;

        String customerPoNumber = asString(body.get("customer_po_number"));
        String notes = asString(body.get("notes"));
        Instant acceptedDate = parseDate(body.get("accepted_date"));
        Instant deliveryDate = parseDate(body.get("delivery_date"));

        // ── Check for an existing sales order FIRST ────────────────────────────
        // Mirrors Node.js: if an order already exists (project was confirmed before),
        // allow updating it regardless of current project status.  The status + estimate
        // gates below only apply to creating a brand-new sales order.
        SalesOrderEntity existing = salesOrderRepository.findByProjectId(projectId).orElse(null);

        if (existing == null) {
            // Creating a new SO — enforce status gate (quoted or order_confirmed only)
            String status = project.getStatus() != null ? project.getStatus().trim() : "";
            if (!"quoted".equals(status) && !"order_confirmed".equals(status)) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Sales order can only be created for quoted or order-confirmed projects");
            }

            // Must have an approved legacy estimate OR a configurator quotation
            boolean hasApprovedEstimate = estimateRepository
                    .findByProjectIdOrderByRevisionAsc(projectId)
                    .stream().anyMatch(e -> Boolean.TRUE.equals(e.getIsApproved()));
            boolean hasConfiguratorQuotation = configuratorQuotationRepository
                    .existsByProjectIdAndDeletedAtIsNull(projectId);
            if (!hasApprovedEstimate && !hasConfiguratorQuotation) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Cannot create sales order without approved estimate and quotation");
            }
        }

        // ── Upsert logic ──────────────────────────────────────────────────────
        if (existing != null) {
            // Update existing sales order (no status gate — order was already confirmed)
            if (customerPoNumber != null) existing.setCustomerPoNumber(customerPoNumber);
            if (body.containsKey("accepted_date")) existing.setAcceptedDate(acceptedDate != null ? acceptedDate : Instant.now());
            if (body.containsKey("delivery_date")) existing.setDeliveryDate(deliveryDate);
            if (body.containsKey("notes")) existing.setNotes(notes);
            existing.setUpdatedAt(Instant.now());
            salesOrderRepository.save(existing);

            // Advance project status if still 'quoted'
            if ("quoted".equals(project.getStatus())) {
                project.setStatus("order_confirmed");
                projectRepository.save(project);
                createWorkOrderIfNeeded(projectId, companyId);
            }
            return existing;
        }

        // ── Create new sales order ─────────────────────────────────────────────
        String salesOrderNumber = generateSalesOrderNumber(companyId);

        SalesOrderEntity so = new SalesOrderEntity();
        so.setId(UUID.randomUUID());
        so.setProjectId(projectId);
        so.setCompanyId(companyId);
        so.setSalesOrderNumber(salesOrderNumber);
        so.setCustomerPoNumber(customerPoNumber);
        so.setAcceptedDate(acceptedDate != null ? acceptedDate : Instant.now());
        so.setDeliveryDate(deliveryDate);
        so.setNotes(notes);
        so.setCreatedAt(Instant.now());
        so.setUpdatedAt(Instant.now());
        salesOrderRepository.save(so);

        // Update project status to order_confirmed
        project.setStatus("order_confirmed");
        projectRepository.save(project);

        // Auto-create work order
        createWorkOrderIfNeeded(projectId, companyId);

        return so;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Update by ID (mirrors salesOrderService.updateSalesOrder)
    // ──────────────────────────────────────────────────────────────────────────

    @Transactional
    public SalesOrderEntity updateSalesOrder(UUID id, Map<String, Object> body, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        SalesOrderEntity so = salesOrderRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Sales order not found"));
        if (companyScope != null && !companyScope.equals(so.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }

        if (body.containsKey("customer_po_number")) so.setCustomerPoNumber(asString(body.get("customer_po_number")));
        if (body.containsKey("customer_po_file"))   so.setCustomerPoFile(asString(body.get("customer_po_file")));
        if (body.containsKey("accepted_date"))      so.setAcceptedDate(parseDate(body.get("accepted_date")));
        if (body.containsKey("delivery_date"))      so.setDeliveryDate(parseDate(body.get("delivery_date")));
        if (body.containsKey("notes"))              so.setNotes(asString(body.get("notes")));
        so.setUpdatedAt(Instant.now());
        return salesOrderRepository.save(so);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Upload PO document (mirrors salesOrderController.uploadPoDocument)
    // ──────────────────────────────────────────────────────────────────────────

    @Transactional
    public SalesOrderEntity uploadPoDocument(UUID projectId, MultipartFile file, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);
        UUID companyId = project.getCompanyId() != null ? project.getCompanyId() : companyScope;

        // Save file as a Document record (type = purchase_order)
        documentLifecycleService.uploadProjectDocument(
                projectId, file, "purchase_order",
                "PO from Client - " + file.getOriginalFilename(),
                null, user);

        // Find-or-create the sales order so customer_po_file is updated
        SalesOrderEntity so = salesOrderRepository.findByProjectId(projectId).orElse(null);
        if (so == null) {
            String salesOrderNumber = generateSalesOrderNumber(companyId);
            so = new SalesOrderEntity();
            so.setId(UUID.randomUUID());
            so.setProjectId(projectId);
            so.setCompanyId(companyId);
            so.setSalesOrderNumber(salesOrderNumber);
            so.setAcceptedDate(Instant.now());
            so.setCreatedAt(Instant.now());
        }
        so.setCustomerPoFile(file.getOriginalFilename());
        so.setUpdatedAt(Instant.now());
        return salesOrderRepository.save(so);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Serialisation helper
    // ──────────────────────────────────────────────────────────────────────────

    public Map<String, Object> toMap(SalesOrderEntity so) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", so.getId());
        m.put("project_id", so.getProjectId());
        m.put("sales_order_number", so.getSalesOrderNumber());
        m.put("customer_po_number", so.getCustomerPoNumber());
        m.put("customer_po_file", so.getCustomerPoFile());
        m.put("accepted_date", so.getAcceptedDate());
        m.put("delivery_date", so.getDeliveryDate());
        m.put("notes", so.getNotes());
        m.put("company_id", so.getCompanyId());
        m.put("created_at", so.getCreatedAt());
        m.put("updated_at", so.getUpdatedAt());
        return m;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SO number generation  (mirrors generateSalesOrderNumber in Node.js)
    // Pattern: SO-YYYYMM-XXXX  where XXXX is zero-padded monthly sequence
    // ──────────────────────────────────────────────────────────────────────────

    String generateSalesOrderNumber(UUID companyId) {
        String prefix = "SO-" + MONTH_FMT.format(java.time.LocalDate.now(ZoneOffset.UTC)) + "-";

        List<String> existing = salesOrderRepository.findSalesOrderNumbersByPrefix(prefix);

        int maxSeen = 0;
        for (String num : existing) {
            if (!num.startsWith(prefix)) continue;
            String suffix = num.substring(prefix.length());
            if (!suffix.matches("\\d+")) continue;
            try {
                int parsed = Integer.parseInt(suffix);
                if (parsed > maxSeen) maxSeen = parsed;
            } catch (NumberFormatException ignored) { /* skip */ }
        }

        for (int offset = 1; offset <= 200; offset++) {
            int next = maxSeen + offset;
            String candidate = prefix + String.format("%04d", next);
            if (salesOrderRepository.findBySalesOrderNumber(candidate).isEmpty()) {
                return candidate;
            }
        }
        // Emergency fallback
        return prefix + (System.currentTimeMillis() % 1_000_000);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Work order auto-creation (mirrors createWorkOrder in Node.js)
    // ──────────────────────────────────────────────────────────────────────────

    private void createWorkOrderIfNeeded(UUID projectId, UUID companyId) {
        if (workOrderRepository.existsByProjectId(projectId)) return;
        if (companyId == null) {
            log.warn("Skipping work order creation for project {} – company_id is null", projectId);
            return;
        }

        String workOrderNumber = sequenceNumberingService.generateNumber(
                SequenceNumberingService.WORK_ORDER_NUMBER, companyId);
        String productionTravelerNumber = sequenceNumberingService.generateNumber(
                SequenceNumberingService.PRODUCTION_TRAVELER_NUMBER, companyId);

        WorkOrderEntity wo = new WorkOrderEntity();
        wo.setId(UUID.randomUUID());
        wo.setProjectId(projectId);
        wo.setCompanyId(companyId);
        wo.setWorkOrderNumber(workOrderNumber);
        wo.setProductionTravelerNumber(productionTravelerNumber);
        wo.setReleaseDate(Instant.now());
        wo.setStatus("pending");
        wo.setOperations(List.of());
        wo.setCreatedAt(Instant.now());
        wo.setUpdatedAt(Instant.now());
        workOrderRepository.save(wo);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private ProjectEntity resolveProject(UUID projectId, UUID companyScope) {
        return (companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(projectId)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    private static String asString(Object v) {
        return v == null ? null : v.toString().trim().isEmpty() ? null : v.toString().trim();
    }

    /**
     * Accept ISO-8601 date strings ("2026-04-30" or "2026-04-30T00:00:00Z") or null.
     */
    private static Instant parseDate(Object v) {
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        try {
            if (s.length() == 10) {
                // plain date "YYYY-MM-DD"
                return LocalDate.parse(s, DateTimeFormatter.ISO_LOCAL_DATE)
                        .atStartOfDay(ZoneOffset.UTC).toInstant();
            }
            return Instant.parse(s);
        } catch (Exception e) {
            log.warn("Could not parse date value '{}': {}", s, e.getMessage());
            return null;
        }
    }
}
