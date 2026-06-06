package com.forge.operations.service;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.QualityRecordEntity;
import com.forge.operations.repository.QualityRecordRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.*;

/**
 * Java parity of Node.js qualityService.js.
 *
 * Mirrors the data-layer logic for:
 *  GET    /api/quality/inspection-types
 *  GET    /api/quality/project/{projectId}
 *  POST   /api/quality/project/{projectId}
 *  POST   /api/quality/project/{projectId}/reports
 *  DELETE /api/quality/project/{projectId}/reports/{fileIndex}
 *  POST   /api/quality/project/{projectId}/complete
 *  PATCH  /api/quality/project/{projectId}/job-forms
 *  POST   /api/quality/project/{projectId}/job/{jobIndex}/complete
 *  POST   /api/quality/project/{projectId}/job/{jobIndex}/upload-doc/{itemIndex}
 */
@Service
public class QualityParityService {

    private final QualityRecordRepository qualityRecordRepository;
    private final ProjectRepository projectRepository;
    private final OperationAccessPolicy accessPolicy;
    private final DocumentLifecycleService documentLifecycleService;

    public QualityParityService(QualityRecordRepository qualityRecordRepository,
                                ProjectRepository projectRepository,
                                OperationAccessPolicy accessPolicy,
                                DocumentLifecycleService documentLifecycleService) {
        this.qualityRecordRepository = qualityRecordRepository;
        this.projectRepository = projectRepository;
        this.accessPolicy = accessPolicy;
        this.documentLifecycleService = documentLifecycleService;
    }

    // ── Mapper ────────────────────────────────────────────────────────────────

    public Map<String, Object> toMap(QualityRecordEntity r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",                     r.getId());
        m.put("project_id",             r.getProjectId());
        m.put("dimensional_verification", r.getDimensionalVerification());
        m.put("visual_inspection",      r.getVisualInspection());
        m.put("hardness_testing",       r.getHardnessTesting());
        m.put("ndt_testing",            r.getNdtTesting());
        m.put("pressure_testing",       r.getPressureTesting());
        m.put("mtr_verification",       r.getMtrVerification());
        m.put("inspection_data_json",   r.getInspectionDataJson()   == null ? Map.of()  : r.getInspectionDataJson());
        m.put("inspection_checklist",   r.getInspectionChecklist()  == null ? List.of() : r.getInspectionChecklist());
        m.put("inspector_name",         r.getInspectorName());
        m.put("inspector_notes",        r.getInspectorNotes());
        m.put("overall_result",         r.getOverallResult());
        m.put("is_finalized",           r.getIsFinalized());
        m.put("report_files",           r.getReportFiles()          == null ? List.of() : r.getReportFiles());
        m.put("coc_generated",          r.getCocGenerated());
        m.put("inspection_date",        r.getInspectionDate());
        m.put("notes",                  r.getNotes());
        m.put("job_quality_forms",      r.getJobQualityForms()      == null ? List.of() : r.getJobQualityForms());
        m.put("company_id",             r.getCompanyId());
        m.put("created_at",             r.getCreatedAt());
        m.put("updated_at",             r.getUpdatedAt());
        return m;
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    public Map<String, Object> getByProjectId(UUID projectId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        resolveProject(projectId, companyScope);
        return qualityRecordRepository.findByProjectId(projectId)
                .map(this::toMap)
                .orElse(null);
    }

    // ── Create / Update ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> createOrUpdate(UUID projectId, Map<String, Object> body, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        List<String> validStatuses = List.of("in_production", "inspected", "shipped");
        if (!validStatuses.contains(project.getStatus())) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Project must be in_production or later to create a quality record");
        }

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId).orElse(null);
        if (record == null) {
            record = newRecord(projectId, project.getCompanyId());
        }

        applyFields(record, body);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Upload report ─────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> uploadReport(UUID projectId, MultipartFile file, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        documentLifecycleService.uploadProjectDocument(
                projectId, file, "inspection_report",
                "Quality Report - " + file.getOriginalFilename(), null, user);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseGet(() -> newRecord(projectId, project.getCompanyId()));

        List<Map<String, Object>> files = new ArrayList<>(
                record.getReportFiles() == null ? List.of() : record.getReportFiles());
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("name", file.getOriginalFilename());
        entry.put("path", file.getOriginalFilename());
        entry.put("uploaded_at", Instant.now().toString());
        files.add(entry);

        record.setReportFiles(files);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Remove report ─────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> removeReport(UUID projectId, int fileIndex, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        resolveProject(projectId, companyScope);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quality record not found"));

        List<Map<String, Object>> files = new ArrayList<>(
                record.getReportFiles() == null ? List.of() : record.getReportFiles());
        if (fileIndex >= 0 && fileIndex < files.size()) {
            files.remove(fileIndex);
        }
        record.setReportFiles(files);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Mark inspection complete ──────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> markInspectionComplete(UUID projectId, Map<String, Object> body, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseGet(() -> newRecord(projectId, project.getCompanyId()));

        if (body.containsKey("inspection_checklist"))
            record.setInspectionChecklist((List<Map<String, Object>>) body.get("inspection_checklist"));
        if (body.containsKey("inspector_notes") && body.get("inspector_notes") != null)
            record.setInspectorNotes(body.get("inspector_notes").toString());
        record.setOverallResult(body.get("overall_result") != null ? body.get("overall_result").toString() : "pending");
        record.setIsFinalized(true);
        record.setInspectionDate(Instant.now());
        record.setUpdatedAt(Instant.now());
        qualityRecordRepository.save(record);

        // Advance project status to inspected
        project.setStatus("inspected");
        project.setUpdatedAt(Instant.now());
        projectRepository.save(project);

        return toMap(record);
    }

    // ── Save job forms (draft) ────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> saveJobForms(UUID projectId, List<Map<String, Object>> jobForms, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseGet(() -> newRecord(projectId, project.getCompanyId()));

        record.setJobQualityForms(jobForms);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Complete single job inspection ────────────────────────────────────────

    @Transactional
    public Map<String, Object> completeJobInspection(UUID projectId, int jobIndex, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        resolveProject(projectId, companyScope);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quality record not found"));

        List<Map<String, Object>> jobForms = new ArrayList<>(
                record.getJobQualityForms() == null ? List.of() : record.getJobQualityForms());

        int idx = findJobFormIndex(jobForms, jobIndex);
        if (idx == -1) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Job form not found for jobIndex " + jobIndex);
        }

        Map<String, Object> form = new LinkedHashMap<>(jobForms.get(idx));
        form.put("isFinalized", true);
        form.put("completeDate", Instant.now().toString());
        jobForms.set(idx, form);

        record.setJobQualityForms(jobForms);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Upload document for a checklist item in a job ─────────────────────────

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> uploadJobItemDoc(UUID projectId, int jobIndex, int itemIndex,
                                                MultipartFile file, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        documentLifecycleService.uploadProjectDocument(
                projectId, file, "inspection_report",
                "Quality Doc - Job " + jobIndex + " Item " + itemIndex + " - " + file.getOriginalFilename(),
                null, user);

        QualityRecordEntity record = qualityRecordRepository.findByProjectId(projectId)
                .orElseGet(() -> newRecord(projectId, project.getCompanyId()));

        List<Map<String, Object>> jobForms = new ArrayList<>(
                record.getJobQualityForms() == null ? List.of() : record.getJobQualityForms());

        int idx = findJobFormIndex(jobForms, jobIndex);
        if (idx == -1) {
            // Auto-create the job form entry
            Map<String, Object> newForm = new LinkedHashMap<>();
            newForm.put("jobIndex", jobIndex);
            newForm.put("checklist", makeDefaultChecklist());
            newForm.put("inspectorNotes", "");
            newForm.put("isFinalized", false);
            jobForms.add(newForm);
            idx = jobForms.size() - 1;
        }

        Map<String, Object> form = new LinkedHashMap<>(jobForms.get(idx));
        List<Map<String, Object>> checklist = new ArrayList<>(
                form.get("checklist") instanceof List
                        ? (List<Map<String, Object>>) form.get("checklist")
                        : List.of());

        if (itemIndex >= 0 && itemIndex < checklist.size()) {
            Map<String, Object> item = new LinkedHashMap<>(checklist.get(itemIndex));
            item.put("documentPath", file.getOriginalFilename());
            item.put("documentName", file.getOriginalFilename());
            checklist.set(itemIndex, item);
        }

        form.put("checklist", checklist);
        jobForms.set(idx, form);
        record.setJobQualityForms(jobForms);
        record.setUpdatedAt(Instant.now());
        return toMap(qualityRecordRepository.save(record));
    }

    // ── Inspection types (static) ─────────────────────────────────────────────

    public List<Map<String, Object>> getInspectionTypes() {
        return List.of(
                Map.of("key", "dimensional_verification", "label", "Dimensional Verification"),
                Map.of("key", "visual_inspection",        "label", "Visual Inspection"),
                Map.of("key", "hardness_testing",         "label", "Hardness Testing"),
                Map.of("key", "ndt_testing",              "label", "NDT Testing"),
                Map.of("key", "pressure_testing",         "label", "Pressure Testing"),
                Map.of("key", "mtr_verification",         "label", "MTR Verification")
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private void applyFields(QualityRecordEntity r, Map<String, Object> body) {
        if (body.containsKey("dimensional_verification")) r.setDimensionalVerification(parseBool(body.get("dimensional_verification")));
        if (body.containsKey("visual_inspection"))        r.setVisualInspection(parseBool(body.get("visual_inspection")));
        if (body.containsKey("hardness_testing"))         r.setHardnessTesting(parseBool(body.get("hardness_testing")));
        if (body.containsKey("ndt_testing"))              r.setNdtTesting(parseBool(body.get("ndt_testing")));
        if (body.containsKey("pressure_testing"))         r.setPressureTesting(parseBool(body.get("pressure_testing")));
        if (body.containsKey("mtr_verification"))         r.setMtrVerification(parseBool(body.get("mtr_verification")));
        if (body.containsKey("inspection_data_json"))
            r.setInspectionDataJson((Map<String, Object>) body.get("inspection_data_json"));
        if (body.containsKey("inspection_checklist"))
            r.setInspectionChecklist((List<Map<String, Object>>) body.get("inspection_checklist"));
        if (body.containsKey("inspector_name") && body.get("inspector_name") != null)
            r.setInspectorName(body.get("inspector_name").toString());
        if (body.containsKey("inspector_notes") && body.get("inspector_notes") != null)
            r.setInspectorNotes(body.get("inspector_notes").toString());
        if (body.containsKey("notes") && body.get("notes") != null)
            r.setNotes(body.get("notes").toString());
    }

    private boolean parseBool(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(v.toString());
    }

    private int findJobFormIndex(List<Map<String, Object>> jobForms, int jobIndex) {
        for (int i = 0; i < jobForms.size(); i++) {
            Object ji = jobForms.get(i).get("jobIndex");
            if (ji != null && Integer.parseInt(ji.toString()) == jobIndex) return i;
        }
        return -1;
    }

    private List<Map<String, Object>> makeDefaultChecklist() {
        return new ArrayList<>(List.of(
                checklistItem("Dimensional Accuracy", "Verify all dimensions per drawing specifications"),
                checklistItem("Surface Finish",        "Check surface roughness requirements"),
                checklistItem("Material Certificate",  "Verify material test certificate matches specs"),
                checklistItem("Heat Treatment",        "Verify heat treatment certificate if applicable"),
                checklistItem("Visual Inspection",     "Check for cracks, porosity, surface defects"),
                checklistItem("Thread Gauging",        "Verify thread specifications if applicable"),
                checklistItem("Hardness Test",         "Verify hardness requirements if specified"),
                checklistItem("NDT/NDE",               "Non-destructive testing if required")
        ));
    }

    private Map<String, Object> checklistItem(String name, String description) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name",        name);
        m.put("description", description);
        m.put("included",    false);
        m.put("notes",       "");
        return m;
    }

    private QualityRecordEntity newRecord(UUID projectId, UUID companyId) {
        QualityRecordEntity r = new QualityRecordEntity();
        r.setId(UUID.randomUUID());
        r.setProjectId(projectId);
        r.setCompanyId(companyId);
        r.setInspectionDate(Instant.now());
        r.setCreatedAt(Instant.now());
        r.setUpdatedAt(Instant.now());
        return r;
    }

    private ProjectEntity resolveProject(UUID projectId, UUID companyScope) {
        ProjectEntity project = companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(projectId).orElse(null)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyScope).orElse(null);
        if (project == null) throw new ApiException(HttpStatus.NOT_FOUND, "Project not found");
        return project;
    }
    public com.forge.configurator.entity.DocumentEntity generateCoCPdf(UUID projectId, AuthenticatedUser user) {
        return documentLifecycleService.generateProjectDocument(projectId, "coc", user);
    }
    
    public com.forge.configurator.entity.DocumentEntity generateJobCoCPdf(UUID projectId, int jobIndex, AuthenticatedUser user) {
        return documentLifecycleService.generateProjectDocument(projectId, "job_coc", java.util.Map.of("jobIndex", jobIndex), user);
    }
    
    public com.forge.operations.service.DocumentLifecycleService.DownloadPayload readDocument(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.readDocument(documentId, user, false);
    }
}


