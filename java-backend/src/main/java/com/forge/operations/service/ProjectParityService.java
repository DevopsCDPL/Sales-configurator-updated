package com.forge.operations.service;

import com.forge.auth.repository.UserRepository;
import com.forge.configurator.entity.ConfiguratorConfigurationEntity;
import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ConfiguratorConfigurationRepository;
import com.forge.configurator.repository.ConfiguratorQuotationRepository;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.EstimateEntity;
import com.forge.operations.entity.EstimateItemEntity;
import com.forge.operations.entity.ProjectAnalyticsEntity;
import com.forge.operations.entity.QualityRecordEntity;
import com.forge.operations.entity.SalesOrderEntity;
import com.forge.operations.entity.WorkOrderEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.EstimateItemRepository;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.ProjectAnalyticsRepository;
import com.forge.operations.repository.QualityRecordRepository;
import com.forge.operations.repository.SalesOrderRepository;
import com.forge.operations.repository.WorkOrderRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ProjectParityService {
    private static final Logger log = LoggerFactory.getLogger(ProjectParityService.class);

    private static final Map<String, List<String>> STATUS_WORKFLOW = Map.of(
            "draft", List.of("estimated"),
            "estimated", List.of("quoted", "draft"),
            "quoted", List.of("order_confirmed", "estimated"),
            "order_confirmed", List.of("in_production"),
            "in_production", List.of("inspected"),
            "inspected", List.of("shipped"),
            "shipped", List.of("closed"),
            "closed", List.of()
    );

    private static final Map<Integer, String> STEP_TO_STATUS = Map.of(
            1, "estimated",
            2, "quoted",
            3, "order_confirmed",
            5, "in_production",
            7, "inspected",
            8, "shipped",
            9, "closed"
    );

    private static final Map<String, Integer> STATUS_LEVEL = Map.of(
            "draft", 0,
            "estimated", 1,
            "quoted", 2,
            "order_confirmed", 3,
            "in_production", 4,
            "inspected", 5,
            "shipped", 6,
            "closed", 7
    );

    private static final Set<String> STATUS_PATCH_ALLOWED = Set.of(
            "draft",
            "estimated",
            "quoted",
            "order_confirmed",
            "in_production",
            "inspected",
            "shipped",
            "closed"
    );

    private final ProjectRepository projectRepository;
    private final ClientRepository clientRepository;
    private final ProjectAnalyticsRepository projectAnalyticsRepository;
    private final OperationAccessPolicy accessPolicy;
    private final FolderStructureService folderStructureService;
    private final SequenceNumberingService sequenceNumberingService;
    private final EstimateRepository estimateRepository;
    private final EstimateItemRepository estimateItemRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final WorkOrderRepository workOrderRepository;
    private final QualityRecordRepository qualityRecordRepository;
    private final DocumentRepository documentRepository;
    private final ConfiguratorConfigurationRepository configuratorConfigurationRepository;
    private final ConfiguratorQuotationRepository configuratorQuotationRepository;
    private final UserRepository userRepository;
    private final ParityMapper mapper;

    @PersistenceContext
    private EntityManager entityManager;

    public ProjectParityService(ProjectRepository projectRepository,
                                ClientRepository clientRepository,
                                ProjectAnalyticsRepository projectAnalyticsRepository,
                                OperationAccessPolicy accessPolicy,
                                FolderStructureService folderStructureService,
                                SequenceNumberingService sequenceNumberingService,
                                EstimateRepository estimateRepository,
                                EstimateItemRepository estimateItemRepository,
                                SalesOrderRepository salesOrderRepository,
                                WorkOrderRepository workOrderRepository,
                                QualityRecordRepository qualityRecordRepository,
                                DocumentRepository documentRepository,
                                ConfiguratorConfigurationRepository configuratorConfigurationRepository,
                                ConfiguratorQuotationRepository configuratorQuotationRepository,
                                UserRepository userRepository,
                                ParityMapper mapper) {
        this.projectRepository = projectRepository;
        this.clientRepository = clientRepository;
        this.projectAnalyticsRepository = projectAnalyticsRepository;
        this.accessPolicy = accessPolicy;
        this.folderStructureService = folderStructureService;
        this.sequenceNumberingService = sequenceNumberingService;
        this.estimateRepository = estimateRepository;
        this.estimateItemRepository = estimateItemRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.workOrderRepository = workOrderRepository;
        this.qualityRecordRepository = qualityRecordRepository;
        this.documentRepository = documentRepository;
        this.configuratorConfigurationRepository = configuratorConfigurationRepository;
        this.configuratorQuotationRepository = configuratorQuotationRepository;
        this.userRepository = userRepository;
        this.mapper = mapper;
    }

    public Map<String, List<String>> getStatusWorkflow() {
        return STATUS_WORKFLOW;
    }

    public List<ProjectEntity> getAllProjects(Map<String, String> filters, AuthenticatedUser user) {
        Map<String, String> safeFilters = filters == null ? Map.of() : filters;

        UUID scopeFromAccess = accessPolicy.resolveCompanyScope(user);
        UUID scopeFromUser = user == null ? null : user.companyId();
        UUID scopeFromFilter = asUuid(safeFilters.get("company_id"));

        UUID effectiveCompanyScope = scopeFromAccess != null ? scopeFromAccess : scopeFromUser;
        if (scopeFromFilter != null) {
            accessPolicy.requireCompanyAccess(scopeFromFilter, effectiveCompanyScope, "Access denied.");
            effectiveCompanyScope = scopeFromFilter;
        }

        final UUID companyScopeForQuery = effectiveCompanyScope;

        Specification<ProjectEntity> baseSpec = (root, query, cb) -> cb.isNull(root.get("deletedAt"));
        if (companyScopeForQuery != null) {
            baseSpec = baseSpec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScopeForQuery));
        }

        Specification<ProjectEntity> spec = baseSpec;

        String status = trim(safeFilters.get("status"));
        if (status != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("status"), status));
        }

        UUID clientId = asUuid(safeFilters.get("client_id"));
        if (clientId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("clientId"), clientId));
        }

        UUID preparedBy = asUuid(safeFilters.get("prepared_by"));
        if (preparedBy != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("preparedBy"), preparedBy));
        }

        String search = trim(safeFilters.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("projectName")), pattern));
        }

        List<ProjectEntity> projectEntities = projectRepository.findAll(spec, Sort.by(Sort.Direction.DESC, "updatedAt"));

        if (projectEntities.isEmpty()) {
            long activeRowsForScope = projectRepository.count(baseSpec);
            long allRowsForScope = projectRepository.count((root, query, cb) ->
                    companyScopeForQuery == null ? cb.conjunction() : cb.equal(root.get("companyId"), companyScopeForQuery));

            log.info(
                    "getAllProjects empty. scopeFromAccess={}, scopeFromUser={}, scopeFromFilter={}, effectiveScope={}, activeRowsForScope={}, allRowsForScope={}",
                    scopeFromAccess, scopeFromUser, scopeFromFilter, companyScopeForQuery, activeRowsForScope, allRowsForScope
            );
        } else {
            log.info("getAllProjects count={}, firstProjectId={}", projectEntities.size(), projectEntities.get(0).getId());
        }

        return projectEntities;
    }

    public ProjectEntity getProjectById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        return (companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(id)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(id, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found"));
    }

    public ProjectEntity createProject(Map<String, Object> payload, AuthenticatedUser user) {
        String projectName = trim(asString(payload.get("project_name")));
        UUID clientId = asUuid(payload.get("client_id"));

        if (projectName == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Project name is required");
        }
        if (clientId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Valid client ID is required");
        }

        ClientEntity client = clientRepository.findByIdAndDeletedAtIsNull(clientId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Client not found"));

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        UUID companyId = companyScope != null ? companyScope : (user.companyId() != null ? user.companyId() : client.getCompanyId());

        Optional<ProjectEntity> existing = companyId == null
                ? projectRepository.findByProjectNameAndDeletedAtIsNull(projectName)
                : projectRepository.findByProjectNameAndCompanyIdAndDeletedAtIsNull(projectName, companyId);
        if (existing.isPresent()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Project name already exists");
        }

        Instant now = Instant.now();

        ProjectEntity project = new ProjectEntity();
        project.setId(UUID.randomUUID());
        project.setProjectName(projectName);
        project.setClientId(clientId);
        project.setPreparedBy(user.id());
        project.setCompanyId(companyId);
        project.setRevision(nextRevision());
        project.setStatus("draft");
        project.setQuotationNumber(sequenceNumberingService.generateNumber(SequenceNumberingService.QUOTATION_NUMBER, companyId));
        project.setProjectNumber(sequenceNumberingService.generateNumber(SequenceNumberingService.PROJECT_NUMBER, companyId));
        project.setProductionTravelerType(fetchProductionTravelerType());
        project.setCreatedAt(now);
        project.setUpdatedAt(now);

        project = projectRepository.save(project);
        folderStructureService.ensureProjectFolders(project.getId(), project.getProjectName(), project.getCompanyId());
        return project;
    }

    public ProjectEntity updateProject(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(id, user);

        boolean locked = project.getStatus() != null && !"draft".equals(project.getStatus());
        if (locked) {
            if (payload.containsKey("project_name") || payload.containsKey("client_id")) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Cannot modify project name or client after draft status");
            }
        }

        if (payload.containsKey("project_name")) {
            String value = trim(asString(payload.get("project_name")));
            if (value == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Project name cannot be empty");
            }
            project.setProjectName(value);
        }

        if (payload.containsKey("client_id")) {
            UUID clientId = asUuid(payload.get("client_id"));
            if (clientId == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Valid client ID is required");
            }
            project.setClientId(clientId);
        }

        if (payload.containsKey("ship_to_address")) project.setShipToAddress(trim(asString(payload.get("ship_to_address"))));
        if (payload.containsKey("material_type")) project.setMaterialType(trim(asString(payload.get("material_type"))));
        if (payload.containsKey("material_grade")) project.setMaterialGrade(trim(asString(payload.get("material_grade"))));
        if (payload.containsKey("heat_number")) project.setHeatNumber(trim(asString(payload.get("heat_number"))));
        if (payload.containsKey("material_supplied_by")) project.setMaterialSuppliedBy(trim(asString(payload.get("material_supplied_by"))));
        if (payload.containsKey("quantity")) project.setQuantity(asInteger(payload.get("quantity"), project.getQuantity()));
        if (payload.containsKey("quote_info")) project.setQuoteInfo(asMap(payload.get("quote_info")));

        project.setUpdatedAt(Instant.now());
        return projectRepository.save(project);
    }

    public ProjectEntity updateProjectStatus(UUID id, String status, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(id, user);
        if (!STATUS_PATCH_ALLOWED.contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid status");
        }

        List<String> allowedTransitions = STATUS_WORKFLOW.getOrDefault(project.getStatus(), List.of());
        if (!allowedTransitions.contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Cannot transition from " + project.getStatus() + " to " + status);
        }

        validateStatusTransition(project, status);

        project.setStatus(status);
        project.setUpdatedAt(Instant.now());
        return projectRepository.save(project);
    }

    public ProjectEntity advanceWorkflow(UUID id, Integer completedStep, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(id, user);
        if (completedStep == null) {
            return project;
        }

        String targetStatus = STEP_TO_STATUS.get(completedStep);
        if (targetStatus == null) {
            return project;
        }

        int currentLevel = STATUS_LEVEL.getOrDefault(project.getStatus(), 0);
        int targetLevel = STATUS_LEVEL.getOrDefault(targetStatus, 0);
        if (targetLevel > currentLevel) {
            project.setStatus(targetStatus);
            project.setUpdatedAt(Instant.now());
            project = projectRepository.save(project);
        }
        return project;
    }

    public ProjectEntity copyProject(UUID id, AuthenticatedUser user) {
        ProjectEntity source = getProjectById(id, user);

        String rootName = source.getProjectName() == null
                ? "Project"
                : source.getProjectName().replaceAll("_\\d+$", "");

        List<ProjectEntity> copies = source.getCompanyId() == null
                ? projectRepository.findByProjectNameStartingWithAndDeletedAtIsNull(rootName + "_")
                : projectRepository.findByProjectNameStartingWithAndCompanyIdAndDeletedAtIsNull(rootName + "_", source.getCompanyId());

        int maxSuffix = 0;
        Pattern pattern = Pattern.compile("^" + Pattern.quote(rootName) + "_(\\d+)$");
        for (ProjectEntity row : copies) {
            if (row.getProjectName() == null) continue;
            Matcher matcher = pattern.matcher(row.getProjectName());
            if (matcher.matches()) {
                int value = Integer.parseInt(matcher.group(1));
                maxSuffix = Math.max(maxSuffix, value);
            }
        }

        ProjectEntity copied = new ProjectEntity();
        copied.setId(UUID.randomUUID());
        copied.setProjectName(rootName + "_" + String.format("%02d", maxSuffix + 1));
        copied.setClientId(source.getClientId());
        copied.setPreparedBy(user.id());
        copied.setCompanyId(source.getCompanyId());
        copied.setRevision(0);
        copied.setStatus("draft");
        copied.setQuotationNumber(sequenceNumberingService.generateNumber(SequenceNumberingService.QUOTATION_NUMBER, source.getCompanyId()));
        copied.setProjectNumber(sequenceNumberingService.generateNumber(SequenceNumberingService.PROJECT_NUMBER, source.getCompanyId()));
        copied.setSelectedRevision(source.getSelectedRevision());
        copied.setProductionTravelerType(source.getProductionTravelerType());
        copied.setCreatedAt(Instant.now());
        copied.setUpdatedAt(Instant.now());

        copied = projectRepository.save(copied);
        folderStructureService.ensureProjectFolders(copied.getId(), copied.getProjectName(), copied.getCompanyId());
        return copied;
    }

    public ProjectEntity selectRevision(UUID id, Integer revision, AuthenticatedUser user) {
        if (revision == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "revision is required");
        }
        ProjectEntity project = getProjectById(id, user);
        project.setSelectedRevision(revision);
        project.setUpdatedAt(Instant.now());
        return projectRepository.save(project);
    }

    public ProjectEntity updateTravelerType(UUID id, String travelerType, AuthenticatedUser user) {
        if (!"machining_industry".equals(travelerType) && !"anodizing_industry".equals(travelerType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid production_traveler_type value");
        }
        ProjectEntity project = getProjectById(id, user);
        project.setProductionTravelerType(travelerType);
        project.setUpdatedAt(Instant.now());
        return projectRepository.save(project);
    }

    public Map<String, Object> deleteProject(UUID id, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(id, user);
        project.setDeletedAt(Instant.now());
        project.setDeletedBy(user.id());
        project.setUpdatedAt(Instant.now());
        projectRepository.save(project);
        return Map.of("message", "Project moved to recycle bin");
    }

    public List<ProjectAnalyticsEntity> getAnalytics(UUID projectId, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(projectId, user);
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        accessPolicy.requireCompanyAccess(project.getCompanyId(), companyScope, "Access denied.");
        return projectAnalyticsRepository.findByProjectIdOrderByCreatedAtAsc(projectId);
    }

    public List<ProjectAnalyticsEntity> saveAnalytics(UUID projectId, List<Map<String, Object>> items, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(projectId, user);
        if (items == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "items array required");
        }

        projectAnalyticsRepository.deleteByProjectId(projectId);
        List<ProjectAnalyticsEntity> rows = new ArrayList<>();
        Instant now = Instant.now();

        for (Map<String, Object> item : items) {
            ProjectAnalyticsEntity row = new ProjectAnalyticsEntity();
            row.setId(UUID.randomUUID());
            row.setProjectId(projectId);
            row.setPartDescription(trim(asString(item.get("part_description"))));
            row.setQuantity(asInteger(item.get("quantity"), 0));
            row.setTotal(asDouble(item.get("total"), 0D));
            row.setMfgCost(asDouble(item.get("mfg_cost"), null));
            row.setProfit(asDouble(item.get("profit"), null));
            row.setMaterialsUnused(asDouble(item.get("materials_unused"), null));
            row.setRawMaterialUsed(trim(asString(item.get("raw_material_used"))));
            row.setPurchasedDimension(trim(asString(item.get("purchased_dimension"))));
            row.setDimensionAfterUsage(trim(asString(item.get("dimension_after_usage"))));
            row.setQtyAvailable(asDouble(item.get("qty_available"), null));
            row.setAuditInfo(asMap(item.get("audit_info")));
            row.setCompanyId(project.getCompanyId());
            row.setCreatedAt(now);
            row.setUpdatedAt(now);
            rows.add(row);
        }

        return projectAnalyticsRepository.saveAll(rows);
    }

    public Map<String, Object> commissionProject(UUID projectId, List<Map<String, Object>> items, AuthenticatedUser user) {
        List<ProjectAnalyticsEntity> saved = saveAnalytics(projectId, items, user);
        return Map.of(
                "data", saved,
                "message", "Project commissioned and stock updated"
        );
    }

    public String getNextQuotationNumber(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        return sequenceNumberingService.generatePreview(SequenceNumberingService.QUOTATION_NUMBER, companyScope);
    }

    public String getNextProjectNumber(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        return sequenceNumberingService.generatePreview(SequenceNumberingService.PROJECT_NUMBER, companyScope);
    }

    private Integer nextRevision() {
        Integer max = projectRepository.findMaxRevision();
        return (max == null ? 0 : max) + 1;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trim(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private UUID asUuid(Object value) {
        if (value == null) return null;
        if (value instanceof UUID uuid) return uuid;
        try {
            return UUID.fromString(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private Integer asInteger(Object value, Integer fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private Double asDouble(Object value, Double fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private Map<String, Object> asMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((k, v) -> result.put(String.valueOf(k), v));
        return result;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Enriched project response building — mirrors Node's getProjectById logic
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Returns a fully-enriched project map matching the Node.js response shape.
     * Includes client, preparedBy user, estimates (legacy + configurator),
     * salesOrder, workOrder, qualityRecord, documents, configurations, quotations.
     */
    public Map<String, Object> buildEnrichedProjectMap(ProjectEntity project) {
        Map<String, Object> map = mapper.toProjectMap(project);
        UUID projectId = project.getId();

        // Auto-assign quotation number if missing (parity with Node's getProjectById)
        if (project.getQuotationNumber() == null) {
            String qn = sequenceNumberingService.generateNumber(
                    SequenceNumberingService.QUOTATION_NUMBER, project.getCompanyId());
            project.setQuotationNumber(qn);
            project.setUpdatedAt(Instant.now());
            project = projectRepository.save(project);
            map.put("quotation_number", qn);
        }

        // preparedBy user
        if (project.getPreparedBy() != null) {
            userRepository.findById(project.getPreparedBy()).ifPresent(u -> {
                Map<String, Object> userMap = new LinkedHashMap<>();
                userMap.put("id", u.getId());
                userMap.put("name", u.getName());
                userMap.put("email", u.getEmail());
                userMap.put("phone", u.getPhone());
                userMap.put("position", u.getPosition());
                userMap.put("role", u.getRole());
                map.put("preparedBy", userMap);
            });
        }
        if (!map.containsKey("preparedBy")) map.put("preparedBy", null);

        // Legacy estimates from `estimates` table (written by Node backend)
        List<EstimateEntity> estimateList = estimateRepository.findByProjectIdOrderByRevisionAsc(projectId);
        if (!estimateList.isEmpty()) {
            List<Map<String, Object>> estimateMaps = new ArrayList<>();
            for (EstimateEntity est : estimateList) {
                Map<String, Object> estMap = toEstimateMap(est);
                List<EstimateItemEntity> items = estimateItemRepository.findByEstimateIdOrderBySequenceOrderAsc(est.getId());
                estMap.put("items", items.stream().map(this::toEstimateItemMap).toList());
                estimateMaps.add(estMap);
            }
            map.put("estimates", estimateMaps);

            // Pick approved → selected_revision → latest
            Integer selectedRevision = project.getSelectedRevision();
            Map<String, Object> selected = estimateMaps.stream()
                    .filter(e -> Boolean.TRUE.equals(e.get("is_approved"))).findFirst()
                    .orElseGet(() -> estimateMaps.stream()
                            .filter(e -> Objects.equals(e.get("revision"), selectedRevision)).findFirst()
                            .orElse(estimateMaps.get(estimateMaps.size() - 1)));

            buildAllItems(selected);
            map.put("estimate", selected);
        } else {
            map.put("estimates", List.of());
            map.put("estimate", null);
        }

        // Configurator configurations (Java's estimation equivalent)
        List<ConfiguratorConfigurationEntity> configs =
                configuratorConfigurationRepository.findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(projectId);
        map.put("configurations", configs.stream().map(this::toConfigurationMap).toList());

        // Configurator quotations
        List<ConfiguratorQuotationEntity> quotations =
                configuratorQuotationRepository.findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(projectId);
        map.put("quotations", quotations.stream().map(this::toConfiguratorQuotationMap).toList());

        // SalesOrder
        salesOrderRepository.findByProjectId(projectId).ifPresentOrElse(
                so -> map.put("salesOrder", toSalesOrderMap(so)),
                () -> map.put("salesOrder", null));

        // WorkOrder
        workOrderRepository.findByProjectId(projectId).ifPresentOrElse(
                wo -> map.put("workOrder", toWorkOrderMap(wo)),
                () -> map.put("workOrder", null));

        // QualityRecord
        qualityRecordRepository.findByProjectId(projectId).ifPresentOrElse(
                qr -> map.put("qualityRecord", toQualityRecordMap(qr)),
                () -> map.put("qualityRecord", null));

        // Documents
        List<DocumentEntity> docs = documentRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        map.put("documents", docs.stream().map(mapper::toDocumentMap).toList());

        return map;
    }

    /**
     * Public enriched-by-id lookup (used by controller GET /{id}).
     */
    public Map<String, Object> getEnrichedProjectById(UUID id, AuthenticatedUser user) {
        ProjectEntity project = getProjectById(id, user);
        return buildEnrichedProjectMap(project);
    }

    /**
     * Enriched list (used by controller GET /).
     * Returns summary-level enrichment: client, preparedBy name, estimate summary.
     */
    public List<Map<String, Object>> getAllEnrichedProjects(Map<String, String> filters, AuthenticatedUser user) {
        List<ProjectEntity> entities = getAllProjects(filters, user);
        return entities.stream().map(this::buildSummaryProjectMap).toList();
    }

    /** Lightweight enrichment for list items (matches Node's getAllProjects include set). */
    private Map<String, Object> buildSummaryProjectMap(ProjectEntity project) {
        Map<String, Object> map = mapper.toProjectMap(project);

        // preparedBy (id + name only)
        if (project.getPreparedBy() != null) {
            userRepository.findById(project.getPreparedBy()).ifPresent(u -> {
                Map<String, Object> userMap = new LinkedHashMap<>();
                userMap.put("id", u.getId());
                userMap.put("name", u.getName());
                map.put("preparedBy", userMap);
            });
        }
        if (!map.containsKey("preparedBy")) map.put("preparedBy", null);

        // Estimate summary (minimal fields) from legacy table
        List<EstimateEntity> estimateList = estimateRepository.findByProjectIdOrderByRevisionAsc(project.getId());
        if (!estimateList.isEmpty()) {
            List<Map<String, Object>> summaries = estimateList.stream().map(est -> {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("id", est.getId());
                s.put("revision", est.getRevision());
                s.put("is_approved", est.getIsApproved());
                s.put("final_price", est.getFinalPrice());
                s.put("is_locked", est.getIsLocked());
                return s;
            }).toList();
            map.put("estimate", summaries);
        } else {
            map.put("estimate", List.of());
        }

        return map;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Status transition validation — mirrors Node's validateStatusTransition
    // ──────────────────────────────────────────────────────────────────────────

    private void validateStatusTransition(ProjectEntity project, String newStatus) {
        UUID projectId = project.getId();
        switch (newStatus) {
            case "estimated":
                // Must have a legacy estimate OR a configurator configuration
                if (!estimateRepository.existsByProjectId(projectId)
                        && !configuratorConfigurationRepository.existsByProjectIdAndDeletedAtIsNull(projectId)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cannot mark as estimated without creating an estimate or configuration");
                }
                break;
            case "quoted":
                // Must have an approved legacy estimate OR a configurator quotation
                boolean hasApprovedEstimate = estimateRepository.findByProjectIdOrderByRevisionAsc(projectId)
                        .stream().anyMatch(e -> Boolean.TRUE.equals(e.getIsApproved()));
                if (!hasApprovedEstimate && !configuratorQuotationRepository.existsByProjectIdAndDeletedAtIsNull(projectId)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cannot generate quotation without approved estimate or configurator quotation");
                }
                break;
            case "order_confirmed":
                if (!salesOrderRepository.existsByProjectId(projectId)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cannot confirm order without sales order");
                }
                break;
            case "in_production":
                if (!workOrderRepository.existsByProjectId(projectId)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cannot start production without work order");
                }
                break;
            case "inspected":
                if (!qualityRecordRepository.existsByProjectId(projectId)) {
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                            "Cannot mark as inspected without quality record");
                }
                break;
            case "shipped":
                // CoC check removed — shipping allowed without Certificate of Conformance
                break;
            default:
                break;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // System config helpers
    // ──────────────────────────────────────────────────────────────────────────

    /** Read production_traveler_type from system_module_config (mirrors Node createProject logic). */
    private String fetchProductionTravelerType() {
        try {
            // Guard: check table existence before querying — a missing-relation SQL error
            // poisons the current PostgreSQL connection/transaction even if caught in Java.
            @SuppressWarnings("unchecked")
            List<?> tableExists = entityManager.createNativeQuery(
                    "SELECT 1 FROM information_schema.tables " +
                    "WHERE table_schema = 'public' AND table_name = 'system_module_config'")
                    .getResultList();
            if (tableExists.isEmpty()) {
                return "machining_industry";
            }

            @SuppressWarnings("unchecked")
            List<Object[]> rows = entityManager.createNativeQuery(
                    "SELECT module_key FROM system_module_config WHERE section_name = 'production_traveler' LIMIT 1")
                    .getResultList();
            if (!rows.isEmpty()) {
                Object val = rows.get(0);
                if (val instanceof Object[] arr && arr.length > 0 && arr[0] != null) {
                    return String.valueOf(arr[0]);
                }
                if (val != null && !(val instanceof Object[])) {
                    return String.valueOf(val);
                }
            }
        } catch (Exception e) {
            log.warn("Could not fetch production traveler type from system_module_config: {}", e.getMessage());
        }
        return "machining_industry";
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Entity → Map converters for associations
    // ──────────────────────────────────────────────────────────────────────────

    private Map<String, Object> toEstimateMap(EstimateEntity e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("project_id", e.getProjectId());
        m.put("revision", e.getRevision());
        m.put("is_locked", e.getIsLocked());
        m.put("raw_material_cost", e.getRawMaterialCost());
        m.put("process_cost", e.getProcessCost());
        m.put("overhead_cost", e.getOverheadCost());
        m.put("total_cost", e.getTotalCost());
        m.put("margin_percent", e.getMarginPercent());
        m.put("final_price", e.getFinalPrice());
        m.put("is_approved", e.getIsApproved());
        m.put("approved_by", e.getApprovedBy());
        m.put("approved_at", e.getApprovedAt());
        m.put("quotation", e.getQuotation());
        m.put("custom_parts", e.getCustomParts() == null ? List.of() : e.getCustomParts());
        m.put("company_id", e.getCompanyId());
        m.put("created_at", e.getCreatedAt());
        m.put("updated_at", e.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toEstimateItemMap(EstimateItemEntity item) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", item.getId());
        m.put("estimate_id", item.getEstimateId());
        m.put("module_type", item.getModuleType());
        m.put("input_json", item.getInputJson());
        m.put("calculated_json", item.getCalculatedJson());
        m.put("total_cost", item.getTotalCost());
        m.put("sequence_order", item.getSequenceOrder());
        m.put("company_id", item.getCompanyId());
        m.put("created_at", item.getCreatedAt());
        m.put("updated_at", item.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toSalesOrderMap(SalesOrderEntity so) {
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

    private Map<String, Object> toWorkOrderMap(WorkOrderEntity wo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", wo.getId());
        m.put("project_id", wo.getProjectId());
        m.put("work_order_number", wo.getWorkOrderNumber());
        m.put("production_traveler_number", wo.getProductionTravelerNumber());
        m.put("release_date", wo.getReleaseDate());
        m.put("operations", wo.getOperations() == null ? List.of() : wo.getOperations());
        m.put("notes", wo.getNotes());
        m.put("target_date", wo.getTargetDate());
        m.put("approved_by", wo.getApprovedBy());
        m.put("quality_requirements", wo.getQualityRequirements());
        m.put("special_instructions", wo.getSpecialInstructions());
        m.put("status", wo.getStatus());
        m.put("revision", wo.getRevision());
        m.put("dimensional_report", wo.getDimensionalReport());
        m.put("materials", wo.getMaterials() == null ? List.of() : wo.getMaterials());
        m.put("external_processes", wo.getExternalProcesses() == null ? List.of() : wo.getExternalProcesses());
        m.put("prepared_by", wo.getPreparedBy());
        m.put("job_ids", wo.getJobIds() == null ? List.of() : wo.getJobIds());
        m.put("production_forms", wo.getProductionForms() == null ? List.of() : wo.getProductionForms());
        m.put("job_requirements", wo.getJobRequirements());
        m.put("company_id", wo.getCompanyId());
        m.put("created_at", wo.getCreatedAt());
        m.put("updated_at", wo.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toQualityRecordMap(QualityRecordEntity qr) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", qr.getId());
        m.put("project_id", qr.getProjectId());
        m.put("dimensional_verification", qr.getDimensionalVerification());
        m.put("visual_inspection", qr.getVisualInspection());
        m.put("hardness_testing", qr.getHardnessTesting());
        m.put("ndt_testing", qr.getNdtTesting());
        m.put("pressure_testing", qr.getPressureTesting());
        m.put("mtr_verification", qr.getMtrVerification());
        m.put("inspection_data_json", qr.getInspectionDataJson());
        m.put("inspection_checklist", qr.getInspectionChecklist() == null ? List.of() : qr.getInspectionChecklist());
        m.put("inspector_notes", qr.getInspectorNotes());
        m.put("overall_result", qr.getOverallResult());
        m.put("is_finalized", qr.getIsFinalized());
        m.put("report_files", qr.getReportFiles() == null ? List.of() : qr.getReportFiles());
        m.put("coc_generated", qr.getCocGenerated());
        m.put("inspection_date", qr.getInspectionDate());
        m.put("inspector_name", qr.getInspectorName());
        m.put("notes", qr.getNotes());
        m.put("job_quality_forms", qr.getJobQualityForms() == null ? List.of() : qr.getJobQualityForms());
        m.put("company_id", qr.getCompanyId());
        m.put("created_at", qr.getCreatedAt());
        m.put("updated_at", qr.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toConfigurationMap(ConfiguratorConfigurationEntity c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("code", c.getCode());
        m.put("name", c.getName());
        m.put("description", c.getDescription());
        m.put("project_id", c.getProjectId());
        m.put("user_id", c.getUserId());
        m.put("config_data", c.getConfigData());
        m.put("active_step", c.getActiveStep());
        m.put("progress_pct", c.getProgressPct());
        m.put("is_template", c.getIsTemplate());
        m.put("is_draft", c.getIsDraft());
        m.put("company_id", c.getCompanyId());
        m.put("created_by", c.getCreatedBy());
        m.put("created_at", c.getCreatedAt());
        m.put("updated_at", c.getUpdatedAt());
        return m;
    }

    private Map<String, Object> toConfiguratorQuotationMap(ConfiguratorQuotationEntity q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId());
        m.put("quotation_number", q.getQuotationNumber());
        m.put("project_id", q.getProjectId());
        m.put("configuration_id", q.getConfigurationId());
        m.put("customer_name", q.getCustomerName());
        m.put("issued_at", q.getIssuedAt());
        m.put("valid_until", q.getValidUntil());
        m.put("status", q.getStatus());
        m.put("sold", q.getSold());
        m.put("subtotal", q.getSubtotal());
        m.put("labour_total", q.getLabourTotal());
        m.put("material_total", q.getMaterialTotal());
        m.put("overhead_total", q.getOverheadTotal());
        m.put("margin_pct", q.getMarginPct());
        m.put("margin_total", q.getMarginTotal());
        m.put("tax_total", q.getTaxTotal());
        m.put("grand_total", q.getGrandTotal());
        m.put("currency", q.getCurrency());
        m.put("terms", q.getTerms());
        m.put("notes", q.getNotes());
        m.put("pdf_document_id", q.getPdfDocumentId());
        m.put("company_id", q.getCompanyId());
        m.put("created_by", q.getCreatedBy());
        m.put("created_at", q.getCreatedAt());
        m.put("updated_at", q.getUpdatedAt());
        return m;
    }

    /**
     * Build all_items array on the estimate map (mirrors Node's estimate enrichment).
     * Combines custom_parts (JSONB) and process modules (estimate_items) into all_items.
     */
    @SuppressWarnings("unchecked")
    private void buildAllItems(Map<String, Object> estimateMap) {
        List<Map<String, Object>> customParts;
        Object cp = estimateMap.get("custom_parts");
        if (cp instanceof List<?> list) {
            customParts = list.stream()
                    .filter(x -> x instanceof Map)
                    .map(x -> (Map<String, Object>) x)
                    .collect(Collectors.toList());
        } else {
            customParts = List.of();
        }

        List<Map<String, Object>> items;
        Object it = estimateMap.get("items");
        if (it instanceof List<?> list) {
            items = list.stream()
                    .filter(x -> x instanceof Map)
                    .map(x -> (Map<String, Object>) x)
                    .collect(Collectors.toList());
        } else {
            items = List.of();
        }

        List<Map<String, Object>> mappedModules = items.stream().map(item -> {
            Map<String, Object> inp = item.containsKey("input_json") && item.get("input_json") instanceof Map<?, ?>
                    ? (Map<String, Object>) item.get("input_json")
                    : Map.of();
            int qty = asIntSafe(inp.get("quantity"));
            double totalCost = asDoubleSafe(item.get("total_cost"));
            double unitPrice = qty > 0 ? totalCost / qty : totalCost;
            String moduleType = item.containsKey("module_type") ? String.valueOf(item.get("module_type")) : "";
            String moduleLabel = Arrays.stream(moduleType.split("_"))
                    .map(w -> w.isEmpty() ? w : Character.toUpperCase(w.charAt(0)) + w.substring(1))
                    .collect(Collectors.joining(" "));
            Map<String, Object> mapped = new LinkedHashMap<>();
            mapped.put("_source", "process_module");
            mapped.put("module_type", moduleType);
            mapped.put("job_description", inp.getOrDefault("job_name", moduleLabel));
            mapped.put("drawing_part_no", inp.getOrDefault("drawing_part_no", ""));
            mapped.put("material", inp.getOrDefault("material_type", inp.getOrDefault("material_grade", "")));
            mapped.put("material_grade", inp.getOrDefault("material_grade", inp.getOrDefault("material_type", "")));
            mapped.put("quantity", qty);
            mapped.put("job_cost_per_unit", unitPrice);
            mapped.put("total_cost", totalCost);
            mapped.put("heat_number", inp.getOrDefault("heat_number", ""));
            mapped.put("raw_material_dimension", inp.getOrDefault("raw_material_dimension", ""));
            return mapped;
        }).toList();

        List<Map<String, Object>> allItems = new ArrayList<>(customParts);
        allItems.addAll(mappedModules);
        estimateMap.put("all_items", allItems);
    }

    private int asIntSafe(Object value) {
        if (value == null) return 0;
        if (value instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(value)); } catch (Exception e) { return 0; }
    }

    private double asDoubleSafe(Object value) {
        if (value == null) return 0.0;
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof BigDecimal bd) return bd.doubleValue();
        try { return Double.parseDouble(String.valueOf(value)); } catch (Exception e) { return 0.0; }
    }
}
