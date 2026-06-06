package com.forge.operations.service;

import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.SettingRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import com.forge.configurator.entity.ConfiguratorQuotationItemEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ConfiguratorQuotationItemRepository;
import com.forge.configurator.repository.ConfiguratorQuotationRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.EstimateEntity;
import com.forge.operations.entity.EstimateItemEntity;
import com.forge.operations.entity.WorkOrderEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.EstimateItemRepository;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.SalesOrderRepository;
import com.forge.operations.repository.WorkOrderRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class WorkOrderParityService {

    private final WorkOrderRepository workOrderRepository;
    private final SequenceNumberingService sequenceNumberingService;
    private final PdfServiceClient pdfServiceClient;
    private final ProjectRepository projectRepository;
    private final SettingRepository settingRepository;
    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final EstimateRepository estimateRepository;
    private final EstimateItemRepository estimateItemRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final ConfiguratorQuotationRepository configuratorQuotationRepository;
    private final ConfiguratorQuotationItemRepository configuratorQuotationItemRepository;
    private final CompanyRepository companyRepository;

    public WorkOrderParityService(WorkOrderRepository workOrderRepository,
                                  SequenceNumberingService sequenceNumberingService,
                                  PdfServiceClient pdfServiceClient,
                                  ProjectRepository projectRepository,
                                  SettingRepository settingRepository,
                                  UserRepository userRepository,
                                  ClientRepository clientRepository,
                                  EstimateRepository estimateRepository,
                                  EstimateItemRepository estimateItemRepository,
                                  SalesOrderRepository salesOrderRepository,
                                  ConfiguratorQuotationRepository configuratorQuotationRepository,
                                  ConfiguratorQuotationItemRepository configuratorQuotationItemRepository,
                                  CompanyRepository companyRepository
                                ) {
        this.workOrderRepository = workOrderRepository;
        this.sequenceNumberingService = sequenceNumberingService;
        this.pdfServiceClient = pdfServiceClient;
        this.projectRepository = projectRepository;
        this.settingRepository = settingRepository;
        this.userRepository = userRepository;
        this.clientRepository = clientRepository;
        this.estimateRepository = estimateRepository;
        this.estimateItemRepository = estimateItemRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.configuratorQuotationRepository = configuratorQuotationRepository;
        this.configuratorQuotationItemRepository = configuratorQuotationItemRepository;
        this.companyRepository = companyRepository;
    }

    // ── Mappers ────────────────────────────────────────────────────────────────

    public Map<String, Object> toMap(WorkOrderEntity wo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",                        wo.getId());
        m.put("project_id",                wo.getProjectId());
        m.put("work_order_number",         wo.getWorkOrderNumber());
        m.put("production_traveler_number",wo.getProductionTravelerNumber());
        m.put("release_date",              wo.getReleaseDate());
        m.put("target_date",               wo.getTargetDate());
        m.put("prepared_by",               wo.getPreparedBy());
        m.put("approved_by",               wo.getApprovedBy());
        m.put("quality_requirements",      wo.getQualityRequirements() == null ? List.of() : wo.getQualityRequirements());
        m.put("special_instructions",      wo.getSpecialInstructions() == null ? List.of() : wo.getSpecialInstructions());
        m.put("job_ids",                   wo.getJobIds() == null ? List.of() : wo.getJobIds());
        m.put("job_requirements",          wo.getJobRequirements() == null ? Map.of() : wo.getJobRequirements());
        m.put("operations",                wo.getOperations() == null ? List.of() : wo.getOperations());
        m.put("production_forms",          wo.getProductionForms() == null ? List.of() : wo.getProductionForms());
        m.put("notes",                     wo.getNotes());
        m.put("status",                    wo.getStatus());
        m.put("revision",                  wo.getRevision());
        m.put("company_id",                wo.getCompanyId());
        m.put("created_at",                wo.getCreatedAt());
        m.put("updated_at",                wo.getUpdatedAt());
        return m;
    }

    // ── Queries ────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getByProjectId(UUID projectId) {
        return workOrderRepository.findAllByProjectIdOrderByCreatedAtAsc(projectId)
                .stream().map(this::toMap).toList();
    }

    public Map<String, Object> getById(UUID id) {
        return workOrderRepository.findById(id)
                .map(this::toMap)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Work order not found."));
    }

    // ── Create ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> createWorkOrder(Map<String, Object> body, UUID companyId) {
        UUID projectId = parseUuid(body.get("project_id"), "project_id");

        // If a work order already exists for this project, update and return it (upsert)
        Optional<WorkOrderEntity> existing = workOrderRepository.findByProjectId(projectId);
        if (existing.isPresent()) {
            return updateWorkOrder(existing.get().getId(), body);
        }

        WorkOrderEntity wo = new WorkOrderEntity();
        wo.setId(UUID.randomUUID());
        wo.setProjectId(projectId);
        wo.setCompanyId(companyId);
        wo.setWorkOrderNumber(sequenceNumberingService.generateNumber(
                SequenceNumberingService.WORK_ORDER_NUMBER, companyId));
        wo.setProductionTravelerNumber(sequenceNumberingService.generateNumber(
                SequenceNumberingService.PRODUCTION_TRAVELER_NUMBER, companyId));
        wo.setReleaseDate(Instant.now());
        wo.setStatus("pending");
        wo.setOperations(List.of());

        applyFields(wo, body);

        wo.setCreatedAt(Instant.now());
        wo.setUpdatedAt(Instant.now());
        return toMap(workOrderRepository.save(wo));
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> updateWorkOrder(UUID id, Map<String, Object> body) {
        WorkOrderEntity wo = workOrderRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Work order not found."));

        applyFields(wo, body);
        wo.setUpdatedAt(Instant.now());
        return toMap(workOrderRepository.save(wo));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private void applyFields(WorkOrderEntity wo, Map<String, Object> body) {
        if (body.containsKey("target_date")) {
            Object v = body.get("target_date");
            wo.setTargetDate(v == null ? null : parseInstant(v.toString()));
        }
        if (body.containsKey("prepared_by"))
            wo.setPreparedBy(body.get("prepared_by") == null ? null : body.get("prepared_by").toString());
        if (body.containsKey("approved_by"))
            wo.setApprovedBy(body.get("approved_by") == null ? null : body.get("approved_by").toString());
        if (body.containsKey("notes"))
            wo.setNotes(body.get("notes") == null ? null : body.get("notes").toString());
        if (body.containsKey("special_instructions"))
            wo.setSpecialInstructions((List<Map<String, Object>>) body.get("special_instructions"));
        if (body.containsKey("quality_requirements"))
            wo.setQualityRequirements((List<Map<String, Object>>) body.get("quality_requirements"));
        if (body.containsKey("job_ids"))
            wo.setJobIds((List<Integer>) body.get("job_ids"));
        if (body.containsKey("job_requirements"))
            wo.setJobRequirements((Map<String, Object>) body.get("job_requirements"));
    }

    private UUID parseUuid(Object value, String fieldName) {
        if (value == null) throw new ApiException(HttpStatus.BAD_REQUEST, fieldName + " is required.");
        try { return UUID.fromString(value.toString()); }
        catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid UUID for " + fieldName);
        }
    }

    /** Accepts both full ISO-8601 instants ("2026-05-28T00:00:00Z") and
     *  date-only strings ("2026-05-28") sent by the frontend. */
    private Instant parseInstant(String value) {
        if (value.length() == 10) {
            // date-only: treat as start-of-day UTC
            return LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC);
        }
        return Instant.parse(value);
    }

    // ── Create ─────────────────────────────────────────────────────────────────
    public Map<String, Object> generateWorkOrderPdf(UUID workOrderId, AuthenticatedUser user) {
        WorkOrderEntity wo = workOrderRepository.findById(workOrderId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Work order not found."));

        ProjectEntity project = projectRepository.findByIdAndDeletedAtIsNull(wo.getProjectId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found."));

        UUID companyId = wo.getCompanyId() != null ? wo.getCompanyId() : project.getCompanyId();

        // ── company settings ────────────────────────────────────────────────
        Map<String, Object> company = new LinkedHashMap<>();
        company.put("id", companyId.toString());
        company.put("company_code", "");
        settingRepository.findByKeyAndCompanyId("company_profile", companyId).ifPresent(s -> {
            Map<String, Object> v = s.getValue();
            if (v != null) v.forEach(company::putIfAbsent);
        });
        // Add logo_data from the companies table (base64 data-URL stored by Node.js backend)
        companyRepository.findById(companyId).ifPresent(c -> {
            if (c.getLogoData() != null && !c.getLogoData().isBlank())
                company.put("logo_data", c.getLogoData());
            if (c.getName() != null && !c.getName().isBlank())
                company.putIfAbsent("name", c.getName());
            if (c.getAddress() != null && !c.getAddress().isBlank())
                company.putIfAbsent("address", c.getAddress());
            if (c.getPhone() != null && !c.getPhone().isBlank())
                company.putIfAbsent("phone", c.getPhone());
            if (c.getWebsite() != null && !c.getWebsite().isBlank())
                company.putIfAbsent("website", c.getWebsite());
            if (c.getTaxId() != null && !c.getTaxId().isBlank())
                company.putIfAbsent("tax_id", c.getTaxId());
        });

        // ── current user ────────────────────────────────────────────────────
        Map<String, Object> userMap = new LinkedHashMap<>();
        userMap.put("id", user.id().toString());
        userMap.put("email", user.email());
        userRepository.findById(user.id()).ifPresent(u -> {
            userMap.put("name", u.getName());
            userMap.put("phone", u.getPhone());
            userMap.put("position", u.getPosition());
        });

        // ── client ──────────────────────────────────────────────────────────
        Map<String, Object> clientMap = new LinkedHashMap<>();
        if (project.getClientId() != null) {
            clientRepository.findById(project.getClientId()).ifPresent(c -> {
                clientMap.put("client_name", c.getClientName());
                clientMap.put("address", c.getAddress());
                clientMap.put("poc_name", c.getPocName());
                clientMap.put("poc_email", c.getPocEmail());
                clientMap.put("poc_phone", c.getPocPhone());
                clientMap.put("position", c.getPosition());
            });
        }

        // ── prepared-by user ────────────────────────────────────────────────
        Map<String, Object> preparedByMap = new LinkedHashMap<>();
        if (project.getPreparedBy() != null) {
            userRepository.findById(project.getPreparedBy()).ifPresent(u -> {
                preparedByMap.put("name",     u.getName());
                preparedByMap.put("email",    u.getEmail());
                preparedByMap.put("phone",    u.getPhone());
                preparedByMap.put("position", u.getPosition());
            });
        }

        // ── configurator quotation items → custom_parts for the work order table ──
        //
        // The workOrder.js generator renders parts from estimate.custom_parts.
        // These should be the actual component line items from the configurator
        // quotation, not pricing-module entries from the internal estimate engine.

        List<Map<String, Object>> customParts = new ArrayList<>();

        List<ConfiguratorQuotationEntity> quotations =
                configuratorQuotationRepository
                        .findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(project.getId());

        if (!quotations.isEmpty()) {
            // Use the most recently created (last) quotation's items
            ConfiguratorQuotationEntity latestQuotation = quotations.get(quotations.size() - 1);

            List<ConfiguratorQuotationItemEntity> qItems =
                    configuratorQuotationItemRepository
                            .findByQuotationIdOrderByLineNoAsc(latestQuotation.getId());

            for (ConfiguratorQuotationItemEntity item : qItems) {
                Map<String, Object> part = new LinkedHashMap<>();
                Map<String, Object> meta = item.getMeta() != null ? item.getMeta() : Collections.emptyMap();
                // Helper: extract a string from meta, falling back to empty string
                java.util.function.Function<String, String> metaStr =
                    k -> meta.get(k) instanceof String s ? s : (meta.get(k) != null ? meta.get(k).toString() : "");

                // Fields workOrder.js buildDescription() and table render consume:
                // job_description: use item description, fall back to meta part_name / category
                String jobDescription = item.getDescription() != null && !item.getDescription().isBlank()
                        ? item.getDescription()
                        : metaStr.apply("part_name").isBlank() ? metaStr.apply("job_name") : metaStr.apply("part_name");
                part.put("job_description",         jobDescription);
                part.put("part_name",               metaStr.apply("part_name"));
                part.put("drawing_part_no",         item.getPartNumber() != null ? item.getPartNumber() : metaStr.apply("drawing_part_no"));
                part.put("drawing_revision",        metaStr.apply("drawing_revision"));
                part.put("quantity",                item.getQuantity() == null ? null : item.getQuantity().doubleValue());
                part.put("unit",                    item.getUnit());
                part.put("unit_price",              item.getUnitPrice()  == null ? null : item.getUnitPrice().doubleValue());
                part.put("line_total",              item.getLineTotal()  == null ? null : item.getLineTotal().doubleValue());
                part.put("category",                item.getCategory());
                part.put("step_key",                item.getStepKey());
                // Material fields: from meta if available
                part.put("material",                metaStr.apply("material").isBlank() ? metaStr.apply("material_type") : metaStr.apply("material"));
                part.put("material_grade",          metaStr.apply("material_grade"));
                part.put("condition",               metaStr.apply("condition"));
                part.put("heat_number",             metaStr.apply("heat_number"));
                part.put("raw_material_dimension",  metaStr.apply("raw_material_dimension"));
                part.put("_source",                 "configurator");
                customParts.add(part);
            }
        }

        // ── estimates + items ───────────────────────────────────────────────
        List<EstimateEntity> estimates = estimateRepository.findByProjectIdOrderByRevisionAsc(project.getId());
        List<Map<String, Object>> estimateList = new ArrayList<>();
        for (EstimateEntity est : estimates) {
            Map<String, Object> em = new LinkedHashMap<>();
            em.put("id",           est.getId().toString());
            em.put("revision",     est.getRevision());
            em.put("is_approved",  est.getIsApproved());
            em.put("total_cost",   est.getTotalCost()  == null ? null : est.getTotalCost().doubleValue());
            em.put("final_price",  est.getFinalPrice() == null ? null : est.getFinalPrice().doubleValue());
            em.put("quotation",    est.getQuotation()   == null ? Collections.emptyMap()  : est.getQuotation());
            em.put("custom_parts", est.getCustomParts() == null ? Collections.emptyList() : est.getCustomParts());
            List<EstimateItemEntity> items = estimateItemRepository.findByEstimateIdOrderBySequenceOrderAsc(est.getId());
            List<Map<String, Object>> itemList = new ArrayList<>();
            for (EstimateItemEntity item : items) {
                Map<String, Object> im = new LinkedHashMap<>();
                im.put("id",             item.getId().toString());
                im.put("module_type",    item.getModuleType());
                im.put("input_json",     item.getInputJson()  == null ? Collections.emptyMap() : item.getInputJson());
                im.put("total_cost",     item.getTotalCost()  == null ? null : item.getTotalCost().doubleValue());
                im.put("sequence_order", item.getSequenceOrder());
                itemList.add(im);
            }
            em.put("items", itemList);
            estimateList.add(em);
        }

        // ── sales order ─────────────────────────────────────────────────────
        Map<String, Object> salesOrderMap = new LinkedHashMap<>();
        salesOrderRepository.findByProjectId(project.getId()).ifPresent(so -> {
            salesOrderMap.put("id",                 so.getId().toString());
            salesOrderMap.put("sales_order_number", so.getSalesOrderNumber());
            salesOrderMap.put("customer_po_number", so.getCustomerPoNumber());
            salesOrderMap.put("order_date",         so.getAcceptedDate() == null ? null : so.getAcceptedDate().toString());
        });

        // ── work order map (all fields including extras not in toMap()) ──────
        Map<String, Object> woMap = new LinkedHashMap<>();
        woMap.put("id",                         wo.getId().toString());
        woMap.put("work_order_number",          wo.getWorkOrderNumber());
        woMap.put("production_traveler_number", wo.getProductionTravelerNumber());
        woMap.put("release_date",               wo.getReleaseDate()  == null ? null : wo.getReleaseDate().toString());
        woMap.put("target_date",                wo.getTargetDate()   == null ? null : wo.getTargetDate().toString());
        woMap.put("prepared_by",                wo.getPreparedBy());
        woMap.put("approved_by",                wo.getApprovedBy());
        woMap.put("notes",                      wo.getNotes());
        woMap.put("status",                     wo.getStatus());
        woMap.put("revision",                   wo.getRevision());
        woMap.put("operations",                 wo.getOperations()           == null ? Collections.emptyList() : wo.getOperations());
        woMap.put("quality_requirements",       wo.getQualityRequirements()  == null ? Collections.emptyList() : wo.getQualityRequirements());
        woMap.put("special_instructions",       wo.getSpecialInstructions()  == null ? Collections.emptyList() : wo.getSpecialInstructions());
        woMap.put("job_ids",                    wo.getJobIds()               == null ? Collections.emptyList() : wo.getJobIds());
        woMap.put("job_requirements",           wo.getJobRequirements()      == null ? Collections.emptyMap()  : wo.getJobRequirements());
        woMap.put("production_forms",           wo.getProductionForms()      == null ? Collections.emptyList() : wo.getProductionForms());
        woMap.put("materials",                  wo.getMaterials()            == null ? Collections.emptyList() : wo.getMaterials());
        woMap.put("external_processes",         wo.getExternalProcesses()    == null ? Collections.emptyList() : wo.getExternalProcesses());
        woMap.put("dimensional_report",         wo.getDimensionalReport());

        // ── file name ────────────────────────────────────────────────────────
        String projectSegment = project.getProjectName() == null
                ? "project"
                : project.getProjectName().replaceAll("[^a-zA-Z0-9_-]+", "_");
        String stamp = java.time.LocalDateTime.now()
                .format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String fileName = projectSegment + "_work_order_" + stamp + ".pdf";

        // ── project map ──────────────────────────────────────────────────────────
        // If we have configurator items, inject them as custom_parts on a synthetic
        // estimate entry so workOrder.js finds them via estimate.custom_parts.
        List<Map<String, Object>> finalEstimateList;
        if (!customParts.isEmpty()) {
            Map<String, Object> syntheticEstimate = new LinkedHashMap<>();
            syntheticEstimate.put("id",           "configurator");
            syntheticEstimate.put("revision",     0);
            syntheticEstimate.put("is_approved",  true);
            syntheticEstimate.put("custom_parts", customParts);
            syntheticEstimate.put("items",        Collections.emptyList());
            syntheticEstimate.put("quotation",    Collections.emptyMap());
            finalEstimateList = List.of(syntheticEstimate);
        } else {
            finalEstimateList = estimateList;
        }

        // ── project map ──────────────────────────────────────────────────────
        Map<String, Object> projectMap = new LinkedHashMap<>();
        projectMap.put("id",                       project.getId().toString());
        projectMap.put("project_name",             project.getProjectName());
        projectMap.put("project_number",           project.getProjectNumber());
        projectMap.put("quotation_number",         project.getQuotationNumber());
        projectMap.put("selected_revision",        project.getSelectedRevision());
        projectMap.put("revision",                 project.getRevision());
        projectMap.put("material_type",            project.getMaterialType());
        projectMap.put("material_grade",           project.getMaterialGrade());
        projectMap.put("heat_number",              project.getHeatNumber());
        projectMap.put("quantity",                 project.getQuantity());
        projectMap.put("production_traveler_type", project.getProductionTravelerType());
        projectMap.put("packages_json",            project.getPackagesJson() == null ? Collections.emptyList() : project.getPackagesJson());
        projectMap.put("client",                   clientMap);
        projectMap.put("preparedBy",               preparedByMap);
        projectMap.put("estimate",                 finalEstimateList);
        projectMap.put("workOrder",                woMap);
        projectMap.put("salesOrder",               salesOrderMap);
        projectMap.put("qualityRecord",            Collections.emptyMap());

        // ── r2 context ───────────────────────────────────────────────────────
        Map<String, Object> r2Context = new LinkedHashMap<>();
        r2Context.put("companyId",     companyId.toString());
        r2Context.put("projectId",     project.getId().toString());
        r2Context.put("companyName",   (String) company.getOrDefault("name", "company"));
        r2Context.put("companyCode",   (String) company.getOrDefault("company_code", ""));
        r2Context.put("projectName",   project.getProjectName() == null ? "project" : project.getProjectName());
        r2Context.put("projectNumber", project.getProjectNumber() == null ? "" : project.getProjectNumber());

        // ── payload ──────────────────────────────────────────────────────────
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type",      "work_order");
        payload.put("fileName",  fileName);
        payload.put("company",   company);
        payload.put("project",   projectMap);
        payload.put("user",      userMap);
        payload.put("r2Context", r2Context);

        return pdfServiceClient.generatePdf(payload);
    }
}
