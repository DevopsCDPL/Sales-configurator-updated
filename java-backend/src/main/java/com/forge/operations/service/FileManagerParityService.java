package com.forge.operations.service;

import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.repository.CompanyRepository;
import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.FileManagerFolderEntity;
import com.forge.operations.repository.FileManagerFolderRepository;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class FileManagerParityService {
    private final FileManagerFolderRepository folderRepository;
    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;
    private final CompanyRepository companyRepository;
    private final FolderStructureService folderStructureService;
    private final DocumentLifecycleService documentLifecycleService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;
    private final R2StorageService r2StorageService;

    public FileManagerParityService(FileManagerFolderRepository folderRepository,
                                    DocumentRepository documentRepository,
                                    ProjectRepository projectRepository,
                                    CompanyRepository companyRepository,
                                    FolderStructureService folderStructureService,
                                    DocumentLifecycleService documentLifecycleService,
                                    OperationAccessPolicy accessPolicy,
                                    ParityMapper mapper,
                                    R2StorageService r2StorageService) {
        this.folderRepository = folderRepository;
        this.documentRepository = documentRepository;
        this.projectRepository = projectRepository;
        this.companyRepository = companyRepository;
        this.folderStructureService = folderStructureService;
        this.documentLifecycleService = documentLifecycleService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
        this.r2StorageService = r2StorageService;
    }

    public void ensureProjectFolders(UUID projectId, String projectName, UUID companyId) {
        folderStructureService.ensureProjectFolders(projectId, projectName, companyId);
    }

    public void ensureProcurementFolders(UUID referenceId, String folderName, UUID companyId) {
        folderStructureService.ensureProcurementFolders(referenceId, folderName, companyId);
    }

    public List<Map<String, Object>> getTree(AuthenticatedUser user) {
        folderStructureService.initializeRootFolders();

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<FileManagerFolderEntity> rows = new ArrayList<>();
        if (companyScope == null) {
            rows.addAll(folderRepository.findAll());
        } else {
            rows.addAll(folderRepository.findByCompanyIdIsNullOrderByPathAsc());
            rows.addAll(folderRepository.findByCompanyIdOrderByPathAsc(companyScope));
        }

        rows.sort((a, b) -> nullSafe(a.getPath()).compareToIgnoreCase(nullSafe(b.getPath())));
        return rows.stream().map(mapper::toFolderMap).toList();
    }

    public Map<String, Object> getFolderContents(UUID folderId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        FileManagerFolderEntity folder = folderRepository.findById(folderId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Folder not found"));

        if (folder.getCompanyId() != null && companyScope != null && !Objects.equals(folder.getCompanyId(), companyScope)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }

        List<FileManagerFolderEntity> children = folderRepository.findByParentIdOrderByNameAsc(folderId);
        if (companyScope != null) {
            children = children.stream()
                    .filter(c -> c.getCompanyId() == null || Objects.equals(c.getCompanyId(), companyScope))
                    .toList();
        }

        List<DocumentEntity> documents = documentRepository.findByFolderIdOrderByVersionDescCreatedAtDesc(folderId);
        if (companyScope != null) {
            documents = documents.stream().filter(d -> Objects.equals(d.getCompanyId(), companyScope)).toList();
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("folder", mapper.toFolderMap(folder));
        response.put("children", children.stream().map(mapper::toFolderMap).toList());
        response.put("documents", documents.stream().map(mapper::toDocumentMap).toList());
        return response;
    }

    public Map<String, Object> getFolderByPath(String folderPath, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        folderStructureService.initializeRootFolders();

        FileManagerFolderEntity folder = companyScope == null
                ? folderRepository.findByPathAndCompanyIdIsNull(folderPath)
                    .or(() -> folderRepository.findByPathAndCompanyId(folderPath, null))
                    .orElseGet(() -> folderRepository.findByPathAndCompanyId(folderPath, companyScope).orElse(null))
                : folderRepository.findByPathAndCompanyId(folderPath, companyScope)
                    .orElseGet(() -> folderRepository.findByPathAndCompanyIdIsNull(folderPath).orElse(null));

        if (folder == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Folder not found");
        }

        return getFolderContents(folder.getId(), user);
    }

    public List<Map<String, Object>> getDocuments(Map<String, String> query, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        List<DocumentEntity> rows = documentRepository.findForFileManager(
                trim(query.get("module_type")),
                asUuid(query.get("reference_id")),
                asUuid(query.get("project_id")),
                asUuid(query.get("folder_id")),
                trim(query.get("document_type")),
                asUuid(query.get("part_id")),
                trim(query.get("workflow_stage")),
                companyScope
        );

        return rows.stream().map(mapper::toDocumentMap).toList();
    }

    public DocumentEntity uploadFile(MultipartFile file, Map<String, Object> payload, AuthenticatedUser user) {
        DocumentEntity document = documentLifecycleService.uploadGenericDocument(file, payload, user);

        UUID folderId = asUuid(payload.get("folder_id"));
        if (folderId != null) {
            document.setFolderId(folderId);
            document.setUpdatedAt(java.time.Instant.now());
            document = documentRepository.save(document);
        }

        return document;
    }

    public DocumentEntity updateDocumentStatus(UUID documentId, String status, AuthenticatedUser user) {
        return documentLifecycleService.updateDocumentStatus(documentId, status, user);
    }

    public DocumentLifecycleService.DownloadPayload downloadFile(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.readDocument(documentId, user, false);
    }

    public DocumentLifecycleService.DownloadPayload viewFile(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.readDocument(documentId, user, true);
    }

    public DocumentLifecycleService.DownloadPayload viewFileByPath(String filePath, AuthenticatedUser user) {
        return documentLifecycleService.viewByPath(filePath, user);
    }

    public Map<String, Object> deleteFile(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.deleteDocument(documentId, user);
    }

    public List<Map<String, Object>> getPartMasterDocuments(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<DocumentEntity> rows = documentRepository.findForFileManager(
                "part_master", null, null, null, null, null, null, companyScope);
        return rows.stream().map(mapper::toDocumentMap).toList();
    }

    public List<Map<String, Object>> getInventoryDocuments(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<DocumentEntity> rows = documentRepository.findForFileManager(
                "inventory", null, null, null, null, null, null, companyScope);
        return rows.stream().map(mapper::toDocumentMap).toList();
    }

    public List<Map<String, Object>> getProjects(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        List<ProjectEntity> projects = projectRepository.findAll((root, query, cb) -> {
            var predicate = cb.isNull(root.get("deletedAt"));
            if (companyScope != null) {
                predicate = cb.and(predicate, cb.equal(root.get("companyId"), companyScope));
            }
            return predicate;
        });

        Map<UUID, Integer> fileCounts = new LinkedHashMap<>();
        for (ProjectEntity project : projects) {
            int count = documentRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()).size();
            fileCounts.put(project.getId(), count);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (ProjectEntity project : projects) {
            Map<String, Object> row = mapper.toProjectMap(project);
            row.put("file_count", fileCounts.getOrDefault(project.getId(), 0));
            row.put("last_activity", project.getUpdatedAt() != null ? project.getUpdatedAt() : project.getCreatedAt());
            data.add(row);
        }
        data.sort((a, b) -> nullSafe(String.valueOf(b.get("created_at"))).compareTo(nullSafe(String.valueOf(a.get("created_at")))));
        return data;
    }

    public R2StorageService.ListResult browseR2(String prefix, AuthenticatedUser user) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        String requested = trim(prefix);
        if (requested != null) {
            verifyR2Ownership(requested, companyScope);
            return r2StorageService.listPrefix(requested);
        }

        String effective = companyScope == null ? "" : companyPrefix(companyScope);
        return r2StorageService.listPrefix(effective);
    }

    public DocumentLifecycleService.DownloadPayload viewByR2Key(String key, AuthenticatedUser user, boolean inline) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        verifyR2Ownership(key, companyScope);

        try {
            R2StorageService.DownloadedObject payload = r2StorageService.download(key);
            String filename = key.contains("/") ? key.substring(key.lastIndexOf('/') + 1) : key;
            return new DocumentLifecycleService.DownloadPayload(payload.buffer(), payload.contentType(), filename, inline);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.NOT_FOUND, "File not found in R2");
        }
    }

    public Map<String, Object> deleteByR2Key(String key, AuthenticatedUser user) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        verifyR2Ownership(key, companyScope);

        r2StorageService.remove(key);
        documentRepository.findTopByR2Url(key).ifPresent(documentRepository::delete);
        return Map.of("message", "File deleted from R2");
    }

    public Map<String, Object> getSignedUrl(String key, AuthenticatedUser user, int expiresIn) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        verifyR2Ownership(key, companyScope);

        String url = r2StorageService.getSignedUrl(key, Math.max(1, expiresIn));
        return Map.of("url", url, "expiresIn", Math.max(1, expiresIn));
    }

    public Map<String, Object> r2Projects(AuthenticatedUser user) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        if (companyScope == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No company context");
        }

        CompanyEntity company = companyRepository.findById(companyScope)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Company not found"));

        String companyPrefix = companyPrefix(companyScope);

        List<ProjectEntity> projects = projectRepository.findAll((root, query, cb) -> cb.and(
                cb.isNull(root.get("deletedAt")),
                cb.equal(root.get("companyId"), companyScope)
        ));

        List<Map<String, Object>> result = new ArrayList<>();
        for (ProjectEntity project : projects) {
            String projectSegment = project.getProjectName();
            String suffix = project.getProjectNumber() == null
                    ? project.getId().toString()
                    : project.getProjectNumber();
            String projectFolder = r2StorageService.sanitiseFolderName(projectSegment + "_" + suffix);
            result.add(Map.of(
                    "name", project.getProjectName(),
                    "prefix", companyPrefix + projectFolder + "/",
                    "project_id", project.getId()
            ));
        }

        return Map.of(
                "companyPrefix", companyPrefix,
                "projects", result,
                "company", Map.of("id", company.getId(), "name", company.getName())
        );
    }

    public Map<String, Object> r2ProjectFiles(String projectPrefix, AuthenticatedUser user) {
        if (!r2StorageService.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2 storage not configured");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        verifyR2Ownership(projectPrefix, companyScope);

        R2StorageService.ListResult uploadedLower = r2StorageService.listPrefix(projectPrefix + "uploaded/");
        R2StorageService.ListResult generatedLower = r2StorageService.listPrefix(projectPrefix + "generated/");
        R2StorageService.ListResult uploadedUpper = r2StorageService.listPrefix(projectPrefix + "Uploaded/");
        R2StorageService.ListResult generatedUpper = r2StorageService.listPrefix(projectPrefix + "Generated/");

        List<R2StorageService.ListedObject> uploaded = dedup(
                uploadedLower.files(),
                uploadedUpper.files()
        );
        List<R2StorageService.ListedObject> generated = dedup(
                generatedLower.files(),
                generatedUpper.files()
        );

        return Map.of("uploaded", uploaded, "generated", generated);
    }

    private List<R2StorageService.ListedObject> dedup(List<R2StorageService.ListedObject> left,
                                                       List<R2StorageService.ListedObject> right) {
        Map<String, R2StorageService.ListedObject> map = new LinkedHashMap<>();
        if (left != null) {
            for (R2StorageService.ListedObject row : left) map.put(row.key(), row);
        }
        if (right != null) {
            for (R2StorageService.ListedObject row : right) map.put(row.key(), row);
        }
        return new ArrayList<>(map.values());
    }

    private void verifyR2Ownership(String key, UUID companyScope) {
        if (companyScope == null) {
            return;
        }
        String prefix = companyPrefix(companyScope);
        if (!key.startsWith(prefix)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied — file belongs to another company");
        }
    }

    private String companyPrefix(UUID companyId) {
        R2StorageService.ResolvedNames names = r2StorageService.resolveNames(companyId, null);
        String companyName = names.companyName();
        String companyCode = names.companyCode();

        String segment = companyName == null
                ? companyId.toString()
                : companyName + "_" + (companyCode == null ? companyId : companyCode);

        return r2StorageService.sanitiseFolderName(segment) + "/";
    }

    private String nullSafe(String value) {
        return value == null ? "" : value;
    }

    private String trim(String value) {
        if (value == null) return null;
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
}
