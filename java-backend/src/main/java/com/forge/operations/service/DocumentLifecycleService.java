package com.forge.operations.service;

import com.forge.auth.entity.SettingEntity;
import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.SettingRepository;
import com.forge.auth.repository.UserRepository;
import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.EstimateEntity;
import com.forge.operations.entity.EstimateItemEntity;
import com.forge.operations.entity.FileManagerFolderEntity;
import com.forge.operations.entity.QualityRecordEntity;
import com.forge.operations.entity.SalesOrderEntity;
import com.forge.operations.entity.WorkOrderEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.EstimateItemRepository;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.QualityRecordRepository;
import com.forge.operations.repository.SalesOrderRepository;
import com.forge.operations.repository.WorkOrderRepository;
import com.forge.operations.storage.LocalStorageService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class DocumentLifecycleService {
    private static final Logger log = LoggerFactory.getLogger(DocumentLifecycleService.class);
    private static final DateTimeFormatter FILE_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;
    private final FolderStructureService folderStructureService;
    private final LocalStorageService localStorageService;
    private final R2StorageService r2StorageService;
    private final OperationAccessPolicy accessPolicy;
    private final PdfServiceClient pdfServiceClient;
    private final SettingRepository settingRepository;
    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final EstimateRepository estimateRepository;
    private final EstimateItemRepository estimateItemRepository;
    private final WorkOrderRepository workOrderRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final QualityRecordRepository qualityRecordRepository;
    private final CompanyRepository companyRepository;

    public DocumentLifecycleService(DocumentRepository documentRepository,
                                    ProjectRepository projectRepository,
                                    FolderStructureService folderStructureService,
                                    LocalStorageService localStorageService,
                                    R2StorageService r2StorageService,
                                    OperationAccessPolicy accessPolicy,
                                    PdfServiceClient pdfServiceClient,
                                    SettingRepository settingRepository,
                                    UserRepository userRepository,
                                    ClientRepository clientRepository,
                                    EstimateRepository estimateRepository,
                                    EstimateItemRepository estimateItemRepository,
                                    WorkOrderRepository workOrderRepository,
                                    SalesOrderRepository salesOrderRepository,
                                    QualityRecordRepository qualityRecordRepository,
                                    CompanyRepository companyRepository
                                ) {
        this.documentRepository = documentRepository;
        this.projectRepository = projectRepository;
        this.folderStructureService = folderStructureService;
        this.localStorageService = localStorageService;
        this.r2StorageService = r2StorageService;
        this.accessPolicy = accessPolicy;
        this.pdfServiceClient = pdfServiceClient;
        this.settingRepository = settingRepository;
        this.userRepository = userRepository;
        this.clientRepository = clientRepository;
        this.estimateRepository = estimateRepository;
        this.estimateItemRepository = estimateItemRepository;
        this.workOrderRepository = workOrderRepository;
        this.salesOrderRepository = salesOrderRepository;
        this.qualityRecordRepository = qualityRecordRepository;
        this.companyRepository = companyRepository;
    }

    public List<DocumentEntity> getProjectDocuments(UUID projectId, Map<String, String> filters, AuthenticatedUser user) {
        ProjectEntity project = requireProject(projectId, user);

        String documentType = trim(filters == null ? null : filters.get("document_type"));
        UUID partId = asUuid(filters == null ? null : filters.get("part_id"));
        String workflowStage = trim(filters == null ? null : filters.get("workflow_stage"));

        return documentRepository.findForFileManager(
                "project",
                projectId,
                projectId,
                null,
                documentType,
                partId,
                workflowStage,
                project.getCompanyId()
        );
    }

    public DocumentEntity getDocumentById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        DocumentEntity row = (companyScope == null
                ? documentRepository.findById(id)
                : documentRepository.findByIdAndCompanyId(id, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Document not found"));

        if (companyScope != null && !Objects.equals(companyScope, row.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return row;
    }

    public DocumentEntity generateProjectDocument(UUID projectId, String documentType, AuthenticatedUser user) {
        return generateProjectDocument(projectId, documentType, null, user);
    }

    public DocumentEntity generateProjectDocument(UUID projectId, String documentType, java.util.Map<String, Object> extraData, AuthenticatedUser user) {
        ProjectEntity project = requireProject(projectId, user);
        String normalizedType = normalizeDocumentType(documentType);
        String fileName = generatedFileName(normalizedType, project);

        // Build payload for pdf-service (includes all needed data)
        Map<String, Object> pdfPayload = buildPdfPayload(project, normalizedType, fileName, user);
        if (extraData != null) {
            pdfPayload.putAll(extraData);
        }

        // Call pdf-service – it generates the PDF, uploads to R2, returns the key
        Map<String, Object> pdfResult = pdfServiceClient.generatePdf(pdfPayload);

        String r2Url = (String) pdfResult.get("r2_url");
        String returnedFileName = (String) pdfResult.getOrDefault("file_name", fileName);
        Object sizeObj = pdfResult.get("size");
        long pdfSize = sizeObj instanceof Number ? ((Number) sizeObj).longValue() : 0L;

        FileManagerFolderEntity folder = folderStructureService.resolveFolder(
                normalizedType,
                projectId,
                null,
                project.getCompanyId(),
                "project"
        );

        String relativePath = folderStructureService.getFilePath(folder, returnedFileName).replace('\\', '/');

        int version = nextDocumentVersion("project", projectId, projectId, normalizedType);
        markPreviousVersionsDraft("project", projectId, projectId, normalizedType);

        DocumentEntity row = new DocumentEntity();
        row.setId(UUID.randomUUID());
        row.setProjectId(projectId);
        row.setFolderId(folder == null ? null : folder.getId());
        row.setModuleType("project");
        row.setReferenceId(projectId);
        row.setDocumentType(normalizedType);
        row.setDescription("Generated " + normalizedType.replace('_', ' '));
        row.setSize((int) pdfSize);
        row.setVersion(version);
        row.setFilePath(relativePath);
        row.setFileName(returnedFileName);
        row.setStatus("draft");
        row.setFileType("generated");
        row.setUploadedBy(null);
        row.setGeneratedBy(user.id());
        row.setGeneratedAt(Instant.now());
        row.setCompanyId(project.getCompanyId());
        row.setWorkflowStage(normalizedType);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        row.setR2Url(r2Url);

        return documentRepository.save(row);
    }

    /**
     * Build the full payload sent to pdf-service. All data is fetched here so that
     * pdf-service remains database-free.
     */
    private Map<String, Object> buildPdfPayload(ProjectEntity project, String type, String fileName,
                                                AuthenticatedUser user) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", type);
        payload.put("fileName", fileName);

        // ── Company / settings ────────────────────────────────────────────────
        Map<String, Object> company = new LinkedHashMap<>();
        company.put("id", safeStr(project.getCompanyId()));
        company.put("company_code", "");
        settingRepository.findByKeyAndCompanyId("company_profile", project.getCompanyId()).ifPresent(setting -> {
            Map<String, Object> v = setting.getValue();
            if (v != null) {
                v.forEach(company::putIfAbsent);
            }
        });
        companyRepository.findById(project.getCompanyId()).ifPresent(c -> {
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
        payload.put("company", company);

        // ── User ──────────────────────────────────────────────────────────────
        Map<String, Object> userMap = new LinkedHashMap<>();
        userMap.put("id", safeStr(user.id()));
        userMap.put("email", user.email());
        userRepository.findById(user.id()).ifPresent(u -> {
            userMap.put("name",     u.getName());
            userMap.put("phone",    u.getPhone());
            userMap.put("position", u.getPosition());
        });
        payload.put("user", userMap);

        // ── Client ────────────────────────────────────────────────────────────
        Map<String, Object> clientMap = new LinkedHashMap<>();
        if (project.getClientId() != null) {
            clientRepository.findById(project.getClientId()).ifPresent(c -> {
                clientMap.put("client_name", c.getClientName());
                clientMap.put("address",     c.getAddress());
                clientMap.put("poc_name",    c.getPocName());
                clientMap.put("poc_email",   c.getPocEmail());
                clientMap.put("poc_phone",   c.getPocPhone());
                clientMap.put("position",    c.getPosition());
            });
        }

        // ── Prepared by user ─────────────────────────────────────────────────
        Map<String, Object> preparedBy = new LinkedHashMap<>();
        if (project.getPreparedBy() != null) {
            userRepository.findById(project.getPreparedBy()).ifPresent(u -> {
                preparedBy.put("name",     u.getName());
                preparedBy.put("email",    u.getEmail());
                preparedBy.put("phone",    u.getPhone());
                preparedBy.put("position", u.getPosition());
            });
        }

        // ── Estimates ─────────────────────────────────────────────────────────
        List<EstimateEntity> estimates = estimateRepository.findByProjectIdOrderByRevisionAsc(project.getId());
        List<Map<String, Object>> estimateList = new ArrayList<>();
        for (EstimateEntity est : estimates) {
            Map<String, Object> em = new LinkedHashMap<>();
            em.put("id",             safeStr(est.getId()));
            em.put("revision",       est.getRevision());
            em.put("is_approved",    est.getIsApproved());
            em.put("total_cost",     est.getTotalCost() == null ? null : est.getTotalCost().doubleValue());
            em.put("final_price",    est.getFinalPrice() == null ? null : est.getFinalPrice().doubleValue());
            em.put("quotation",      est.getQuotation() == null ? Collections.emptyMap() : est.getQuotation());
            em.put("custom_parts",   est.getCustomParts() == null ? Collections.emptyList() : est.getCustomParts());

            // estimate items
            List<EstimateItemEntity> items = estimateItemRepository.findByEstimateIdOrderBySequenceOrderAsc(est.getId());
            List<Map<String, Object>> itemList = new ArrayList<>();
            for (EstimateItemEntity item : items) {
                Map<String, Object> im = new LinkedHashMap<>();
                im.put("id",             safeStr(item.getId()));
                im.put("module_type",    item.getModuleType());
                im.put("input_json",     item.getInputJson() == null ? Collections.emptyMap() : item.getInputJson());
                im.put("total_cost",     item.getTotalCost() == null ? null : item.getTotalCost().doubleValue());
                im.put("sequence_order", item.getSequenceOrder());
                itemList.add(im);
            }
            em.put("items", itemList);
            estimateList.add(em);
        }

        // ── Work order ────────────────────────────────────────────────────────
        Map<String, Object> workOrderMap = new LinkedHashMap<>();
        workOrderRepository.findByProjectId(project.getId()).ifPresent(wo -> {
            workOrderMap.put("id",                         safeStr(wo.getId()));
            workOrderMap.put("work_order_number",          wo.getWorkOrderNumber());
            workOrderMap.put("production_traveler_number", wo.getProductionTravelerNumber());
            workOrderMap.put("release_date",               wo.getReleaseDate() == null ? null : wo.getReleaseDate().toString());
            workOrderMap.put("target_date",                wo.getTargetDate() == null ? null : wo.getTargetDate().toString());
            workOrderMap.put("approved_by",                wo.getApprovedBy());
            workOrderMap.put("prepared_by",                wo.getPreparedBy());
            workOrderMap.put("notes",                      wo.getNotes());
            workOrderMap.put("operations",                 wo.getOperations() == null ? Collections.emptyList() : wo.getOperations());
            workOrderMap.put("quality_requirements",       wo.getQualityRequirements() == null ? Collections.emptyList() : wo.getQualityRequirements());
            workOrderMap.put("job_ids",                    wo.getJobIds() == null ? Collections.emptyList() : wo.getJobIds());
        });

        // ── Sales order ───────────────────────────────────────────────────────
        Map<String, Object> salesOrderMap = new LinkedHashMap<>();
        salesOrderRepository.findByProjectId(project.getId()).ifPresent(so -> {
            salesOrderMap.put("id",                   safeStr(so.getId()));
            salesOrderMap.put("sales_order_number",   so.getSalesOrderNumber());
            salesOrderMap.put("customer_po_number",   so.getCustomerPoNumber());
            salesOrderMap.put("order_date",           so.getAcceptedDate() == null ? null : so.getAcceptedDate().toString());
            salesOrderMap.put("created_at",           so.getCreatedAt() == null ? null : so.getCreatedAt().toString());
        });

        // ── Quality record ────────────────────────────────────────────────────
        Map<String, Object> qualityRecordMap = new LinkedHashMap<>();
        qualityRecordRepository.findByProjectId(project.getId()).ifPresent(qr -> {
            qualityRecordMap.put("id",                        safeStr(qr.getId()));
            qualityRecordMap.put("dimensional_verification",  qr.getDimensionalVerification());
            qualityRecordMap.put("visual_inspection",         qr.getVisualInspection());
            qualityRecordMap.put("hardness_testing",          qr.getHardnessTesting());
            qualityRecordMap.put("ndt_testing",               qr.getNdtTesting());
            qualityRecordMap.put("pressure_testing",          qr.getPressureTesting());
            qualityRecordMap.put("mtr_verification",          qr.getMtrVerification());
            qualityRecordMap.put("inspection_date",           qr.getInspectionDate() == null ? null : qr.getInspectionDate().toString());
            qualityRecordMap.put("inspector_notes",           qr.getInspectorNotes());
            qualityRecordMap.put("notes",                     qr.getNotes());
            qualityRecordMap.put("inspection_data_json",      qr.getInspectionDataJson() == null ? Collections.emptyMap() : qr.getInspectionDataJson());
            qualityRecordMap.put("inspection_checklist",   qr.getInspectionChecklist()  == null ? Collections.emptyList() : qr.getInspectionChecklist());
            qualityRecordMap.put("overall_result",         qr.getOverallResult());
            qualityRecordMap.put("inspector_name",         qr.getInspectorName());
            qualityRecordMap.put("job_quality_forms",      qr.getJobQualityForms()       == null ? Collections.emptyList() : qr.getJobQualityForms());
        });

        // ── Project ───────────────────────────────────────────────────────────
        Map<String, Object> projectMap = new LinkedHashMap<>();
        projectMap.put("id",                      safeStr(project.getId()));
        projectMap.put("project_name",            project.getProjectName());
        projectMap.put("project_number",          project.getProjectNumber());
        projectMap.put("quotation_number",        project.getQuotationNumber());
        projectMap.put("selected_revision",       project.getSelectedRevision());
        projectMap.put("revision",                project.getRevision());
        projectMap.put("material_type",           project.getMaterialType());
        projectMap.put("material_grade",          project.getMaterialGrade());
        projectMap.put("heat_number",             project.getHeatNumber());
        projectMap.put("material_supplied_by",    project.getMaterialSuppliedBy());
        projectMap.put("quantity",                project.getQuantity());
        projectMap.put("production_traveler_type",project.getProductionTravelerType());
        projectMap.put("packages_json",           project.getPackagesJson() == null ? Collections.emptyList() : project.getPackagesJson());
        projectMap.put("client",                  clientMap);
        projectMap.put("preparedBy",              preparedBy);
        projectMap.put("estimate",                estimateList);
        projectMap.put("workOrder",               workOrderMap);
        projectMap.put("salesOrder",              salesOrderMap);
        projectMap.put("qualityRecord",           qualityRecordMap);

        payload.put("project", projectMap);

        // ── R2 context ────────────────────────────────────────────────────────
        Map<String, Object> r2Context = new LinkedHashMap<>();
        r2Context.put("companyId",     safeStr(project.getCompanyId()));
        r2Context.put("projectId",     safeStr(project.getId()));
        r2Context.put("companyName",   (String) company.getOrDefault("name", "company"));
        r2Context.put("companyCode",   (String) company.getOrDefault("company_code", ""));
        r2Context.put("projectName",   project.getProjectName() == null ? "project" : project.getProjectName());
        r2Context.put("projectNumber", project.getProjectNumber() == null ? "" : project.getProjectNumber());
        payload.put("r2Context", r2Context);

        return payload;
    }

    private String safeStr(UUID uuid) {
        return uuid == null ? null : uuid.toString();
    }

    public DocumentEntity uploadProjectDocument(UUID projectId,
                                                MultipartFile file,
                                                String type,
                                                String description,
                                                UUID partId,
                                                AuthenticatedUser user) {
        ProjectEntity project = requireProject(projectId, user);
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }

        String normalizedType = normalizeDocumentType(type == null ? "other" : type);
        String fileName = uploadedFileName(file.getOriginalFilename());

        FileManagerFolderEntity folder = folderStructureService.resolveFolder(
                normalizedType,
                projectId,
                partId,
                project.getCompanyId(),
                "project"
        );

        byte[] bytes = readMultipartBytes(file);
        String relativePath = folderStructureService.getFilePath(folder, fileName).replace('\\', '/');
        writeLocal(relativePath, bytes);

        int version = nextDocumentVersion("project", projectId, projectId, normalizedType);
        markPreviousVersionsDraft("project", projectId, projectId, normalizedType);

        DocumentEntity row = new DocumentEntity();
        row.setId(UUID.randomUUID());
        row.setProjectId(projectId);
        row.setFolderId(folder == null ? null : folder.getId());
        row.setModuleType("project");
        row.setReferenceId(projectId);
        row.setDocumentType(normalizedType);
        row.setDescription(trim(description) == null ? file.getOriginalFilename() : trim(description));
        row.setSize(bytes.length);
        row.setVersion(version);
        row.setFilePath(relativePath);
        row.setFileName(fileName);
        row.setStatus("final");
        row.setFileType("uploaded");
        row.setUploadedBy(user.id());
        row.setGeneratedBy(null);
        row.setGeneratedAt(null);
        row.setCompanyId(project.getCompanyId());
        row.setPartId(partId);
        row.setWorkflowStage(normalizedType);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        row.setR2Url(uploadToR2(relativePath, fileName, bytes, false, project.getCompanyId(), projectId));

        return documentRepository.save(row);
    }

    public DocumentEntity uploadGenericDocument(MultipartFile file,
                                                Map<String, Object> payload,
                                                AuthenticatedUser user) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No file provided");
        }

        String moduleType = trim(asString(payload.get("module_type")));
        if (moduleType == null) {
            moduleType = "project";
        }

        String section = normalizeDocumentType(asString(payload.get("section")));
        if (section == null) {
            section = normalizeDocumentType(asString(payload.get("document_type")));
        }
        if (section == null) {
            section = "upload";
        }

        UUID referenceId = asUuid(payload.get("reference_id"));
        UUID projectId = asUuid(payload.get("project_id"));
        UUID partId = asUuid(payload.get("part_id"));
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        UUID companyId = companyScope != null ? companyScope : user.companyId();

        if ("project".equals(moduleType)) {
            UUID effectiveProjectId = projectId != null ? projectId : referenceId;
            if (effectiveProjectId != null) {
                ProjectEntity project = requireProject(effectiveProjectId, user);
                projectId = effectiveProjectId;
                referenceId = referenceId == null ? effectiveProjectId : referenceId;
                companyId = project.getCompanyId();
            }
        }

        FileManagerFolderEntity folder = folderStructureService.resolveFolder(section, projectId, partId, companyId, moduleType);
        byte[] bytes = readMultipartBytes(file);
        String fileName = uploadedFileName(file.getOriginalFilename());
        String relativePath = folderStructureService.getFilePath(folder, fileName).replace('\\', '/');
        writeLocal(relativePath, bytes);

        int version = nextDocumentVersion(moduleType, projectId, referenceId, section);
        markPreviousVersionsDraft(moduleType, projectId, referenceId, section);

        DocumentEntity row = new DocumentEntity();
        row.setId(UUID.randomUUID());
        row.setProjectId(projectId);
        row.setFolderId(folder == null ? null : folder.getId());
        row.setModuleType(moduleType);
        row.setReferenceId(referenceId);
        row.setPartId(partId);
        row.setDocumentType(section);
        row.setDescription(trim(asString(payload.get("description"))) == null ? file.getOriginalFilename() : trim(asString(payload.get("description"))));
        row.setSize(bytes.length);
        row.setVersion(version);
        row.setFilePath(relativePath);
        row.setFileName(fileName);
        row.setStatus("latest");
        row.setFileType("uploaded");
        row.setUploadedBy(user.id());
        row.setGeneratedBy(null);
        row.setGeneratedAt(null);
        row.setCompanyId(companyId);
        row.setWorkflowStage(section);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        row.setR2Url(uploadToR2(relativePath, fileName, bytes, false, companyId, projectId));

        return documentRepository.save(row);
    }

    public DocumentEntity finalizeDocument(UUID documentId, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "admin");
        DocumentEntity row = getDocumentById(documentId, user);
        row.setStatus("final");
        row.setUpdatedAt(Instant.now());
        return documentRepository.save(row);
    }

    public DocumentEntity updateDocumentStatus(UUID documentId, String status, AuthenticatedUser user) {
        if (!List.of("draft", "approved", "latest", "final").contains(status)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid status");
        }
        DocumentEntity row = getDocumentById(documentId, user);
        row.setStatus(status);
        row.setUpdatedAt(Instant.now());
        return documentRepository.save(row);
    }

    public DownloadPayload readDocument(UUID documentId, AuthenticatedUser user, boolean inline) {
        DocumentEntity row = getDocumentById(documentId, user);
        StoredBinary payload = loadBinary(row);
        return new DownloadPayload(payload.bytes(), payload.contentType(), row.getFileName(), inline);
    }

    public DownloadPayload viewByPath(String filePath, AuthenticatedUser user) {
        if (filePath == null || filePath.isBlank() || filePath.contains("..")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid file path");
        }

        String normalized = filePath.replace('\\', '/').replaceAll("^/+", "");
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        DocumentEntity row = documentRepository.findTopByFilePathOrderByCreatedAtDesc(normalized)
                .orElseGet(() -> documentRepository.findTopByFilePathOrderByCreatedAtDesc("uploads/" + normalized).orElse(null));

        if (row != null && companyScope != null && !Objects.equals(companyScope, row.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }

        Path resolved = localStorageService.resolve(normalized);
        if (Files.exists(resolved)) {
            try {
                byte[] bytes = Files.readAllBytes(resolved);
                String contentType = localStorageService.mimeFromExt(resolved.getFileName().toString());
                return new DownloadPayload(bytes, contentType, resolved.getFileName().toString(), true);
            } catch (IOException ex) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
            }
        }

        if (row != null) {
            StoredBinary payload = loadBinary(row);
            return new DownloadPayload(payload.bytes(), payload.contentType(), row.getFileName(), true);
        }

        throw new ApiException(HttpStatus.NOT_FOUND, "File not found on disk");
    }

    public Map<String, Object> deleteDocument(UUID documentId, AuthenticatedUser user) {
        DocumentEntity row = getDocumentById(documentId, user);

        try {
            localStorageService.deleteIfExists(row.getFilePath());
        } catch (IOException ignored) {
            // Physical deletion is best-effort, parity with Node implementation.
        }

        if (row.getR2Url() != null && r2StorageService.isConfigured()) {
            try {
                r2StorageService.remove(row.getR2Url());
            } catch (Exception ignored) {
                // R2 deletion is also best-effort.
            }
        }

        documentRepository.delete(row);
        return Map.of("message", "Document deleted");
    }

    public MergeResult mergeDocuments(List<UUID> documentIds, AuthenticatedUser user) {
        if (documentIds == null || documentIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "documentIds array is required.");
        }

        List<String> skipped = new ArrayList<>();
        List<Map<String, Object>> missingDocs = new ArrayList<>();
        int merged = 0;
        int totalPages = 0;

        PDFMergerUtility merger = new PDFMergerUtility();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        merger.setDestinationStream(output);

        for (UUID id : documentIds) {
            DocumentEntity row;
            try {
                row = getDocumentById(id, user);
            } catch (ApiException ex) {
                missingDocs.add(Map.of("id", id, "name", "Document " + id, "reason", ex.getMessage()));
                continue;
            }

            StoredBinary payload;
            try {
                payload = loadBinary(row);
            } catch (ApiException ex) {
                missingDocs.add(Map.of("id", id, "name", row.getFileName(), "reason", ex.getMessage()));
                continue;
            }

            if (!isPdf(row.getFileName(), payload.contentType(), payload.bytes())) {
                skipped.add(row.getFileName() + " (unsupported format)");
                continue;
            }

            try (PDDocument src = Loader.loadPDF(payload.bytes())) {
                totalPages += src.getNumberOfPages();
                merger.addSource(new RandomAccessReadBuffer(payload.bytes()));
                merged++;
            } catch (Exception ex) {
                skipped.add(row.getFileName() + " (corrupt or unsupported PDF)");
            }
        }

        if (merged == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "None of the selected documents could be merged.");
        }

        try {
            merger.mergeDocuments(null);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to merge documents");
        }

        return new MergeResult(output.toByteArray(), merged, skipped, totalPages, missingDocs);
    }

    private StoredBinary loadBinary(DocumentEntity row) {
        try {
            if (row.getFilePath() != null && localStorageService.exists(row.getFilePath())) {
                byte[] bytes = localStorageService.readBytes(row.getFilePath());
                return new StoredBinary(bytes, localStorageService.mimeFromExt(row.getFileName()));
            }

            if (r2StorageService.isConfigured()) {
                String key = row.getR2Url();
                if (key == null || key.isBlank()) {
                    key = r2StorageService.keyFromDbPath(row.getFilePath());
                }
                if (key != null && !key.isBlank()) {
                    R2StorageService.DownloadedObject remote = r2StorageService.download(key);
                    if (row.getFilePath() != null && !row.getFilePath().isBlank()) {
                        writeLocal(row.getFilePath(), remote.buffer());
                    }
                    if (row.getR2Url() == null || !row.getR2Url().equals(key)) {
                        row.setR2Url(key);
                        row.setUpdatedAt(Instant.now());
                        documentRepository.save(row);
                    }
                    return new StoredBinary(remote.buffer(), remote.contentType());
                }
            }
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Document file not found");
        }

        throw new ApiException(HttpStatus.NOT_FOUND, "Document file not found");
    }

    private ProjectEntity requireProject(UUID projectId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = (companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(projectId)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Project not found"));

        if (companyScope != null && !Objects.equals(companyScope, project.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return project;
    }

    private int nextDocumentVersion(String moduleType, UUID projectId, UUID referenceId, String documentType) {
        List<DocumentEntity> existing = documentRepository.findForFileManager(
                moduleType,
                referenceId,
                projectId,
                null,
                documentType,
                null,
                null,
                null
        );
        int max = 0;
        for (DocumentEntity row : existing) {
            if (row.getVersion() != null) {
                max = Math.max(max, row.getVersion());
            }
        }
        return max + 1;
    }

    private void markPreviousVersionsDraft(String moduleType, UUID projectId, UUID referenceId, String documentType) {
        List<DocumentEntity> existing = documentRepository.findForFileManager(
                moduleType,
                referenceId,
                projectId,
                null,
                documentType,
                null,
                null,
                null
        );
        for (DocumentEntity row : existing) {
            row.setStatus("draft");
            row.setUpdatedAt(Instant.now());
        }
        if (!existing.isEmpty()) {
            documentRepository.saveAll(existing);
        }
    }

    private String uploadToR2(String relativePath,
                              String fileName,
                              byte[] content,
                              boolean generated,
                              UUID companyId,
                              UUID projectId) {
        if (!r2StorageService.isConfigured()) {
            return null;
        }

        try {
            R2StorageService.ResolvedNames names = r2StorageService.resolveNames(companyId, projectId);
            String key = r2StorageService.buildR2Key(
                    names.companyName(),
                    names.projectName(),
                    generated ? "generated" : "uploaded",
                    fileName,
                    companyId,
                    names.companyCode(),
                    projectId,
                    names.projectNumber()
            );
            return r2StorageService.upload(content, key, localStorageService.mimeFromExt(fileName));
        } catch (Exception ex) {
            return null;
        }
    }

    private String normalizeDocumentType(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        return normalized.isBlank() ? null : normalized;
    }

    private String generatedFileName(String type, ProjectEntity project) {
        String projectSegment = project.getProjectName() == null
                ? "project"
                : project.getProjectName().replaceAll("[^a-zA-Z0-9_-]+", "_");
        String stamp = LocalDateTime.now().format(FILE_TS);
        return projectSegment + "_" + type + "_" + stamp + ".pdf";
    }

    private String uploadedFileName(String originalName) {
        String fallback = "file";
        if (originalName == null || originalName.isBlank()) {
            return System.currentTimeMillis() + "-" + fallback;
        }

        int dot = originalName.lastIndexOf('.');
        String ext = dot >= 0 ? originalName.substring(dot) : "";
        String base = dot >= 0 ? originalName.substring(0, dot) : originalName;
        String safe = base.replaceAll("[^a-zA-Z0-9_-]+", "_");
        return System.currentTimeMillis() + "-" + safe + ext;
    }

    private byte[] renderSimplePdf(ProjectEntity project, String type, AuthenticatedUser user) {
        try (PDDocument document = new PDDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);

            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 16);
                stream.newLineAtOffset(50, 780);
                stream.showText("FORGE DOCUMENT");
                stream.endText();

                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                stream.newLineAtOffset(50, 740);
                stream.showText("Type: " + type);
                stream.newLineAtOffset(0, -20);
                stream.showText("Project: " + (project.getProjectName() == null ? "" : project.getProjectName()));
                stream.newLineAtOffset(0, -20);
                stream.showText("Project Number: " + (project.getProjectNumber() == null ? "" : project.getProjectNumber()));
                stream.newLineAtOffset(0, -20);
                stream.showText("Generated By: " + (user.email() == null ? "" : user.email()));
                stream.newLineAtOffset(0, -20);
                stream.showText("Generated At: " + Instant.now());
                stream.endText();
            }

            document.save(out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to generate document");
        }
    }

    private byte[] readMultipartBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to read upload file");
        }
    }

    private void writeLocal(String relativePath, byte[] bytes) {
        try {
            localStorageService.writeBytes(relativePath, bytes);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store document locally");
        }
    }

    private boolean isPdf(String fileName, String contentType, byte[] bytes) {
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).contains("pdf")) {
            return true;
        }
        if (fileName != null && fileName.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            return true;
        }
        return bytes != null && bytes.length >= 4
                && bytes[0] == '%'
                && bytes[1] == 'P'
                && bytes[2] == 'D'
                && bytes[3] == 'F';
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

    public record DownloadPayload(byte[] bytes, String contentType, String fileName, boolean inline) {
    }

    public record MergeResult(byte[] buffer, int merged, List<String> skipped, int totalPages, List<Map<String, Object>> missingDocs) {
    }

    private record StoredBinary(byte[] bytes, String contentType) {
    }
}


