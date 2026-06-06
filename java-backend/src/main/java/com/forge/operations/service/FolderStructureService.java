package com.forge.operations.service;

import com.forge.operations.entity.FileManagerFolderEntity;
import com.forge.operations.repository.FileManagerFolderRepository;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class FolderStructureService {
    private static final List<RootFolderDef> ROOT_FOLDERS = List.of(
            new RootFolderDef("Project Documents", "project-documents", "project", "/Project Documents"),
            new RootFolderDef("Procurement Documents", "procurement-documents", "procurement", "/Procurement Documents"),
            new RootFolderDef("Part Master", "part-master", "part_master", "/Part Master"),
            new RootFolderDef("Inventory", "inventory", "inventory", "/Inventory")
    );

    private static final List<String> PROJECT_SUBFOLDERS = List.of(
            "Project Info",
            "Estimation",
            "Quotation",
            "RFQ",
            "PO from Client",
            "PO to Vendor",
            "Work Order",
            "Production",
            "Quality (COC)",
            "Logistics",
            "Invoice",
            "Documents",
            "Analytics",
            "Others"
    );

    private static final List<String> PROCUREMENT_SUBFOLDERS = List.of(
            "Sent RFQ",
            "Received Quotation",
            "Approved PO"
    );

    private static final Map<String, String> DOC_TYPE_TO_PROJECT_FOLDER = Map.ofEntries(
            Map.entry("rfq", "RFQ"),
            Map.entry("quotation", "Quotation"),
            Map.entry("purchase_order", "PO from Client"),
            Map.entry("po_client", "PO from Client"),
            Map.entry("sales_order", "PO from Client"),
            Map.entry("work_order", "Work Order"),
            Map.entry("production_traveller", "Production"),
            Map.entry("production", "Production"),
            Map.entry("coc", "Quality (COC)"),
            Map.entry("quality", "Quality (COC)"),
            Map.entry("inspection_report", "Quality (COC)"),
            Map.entry("material_cert", "Quality (COC)"),
            Map.entry("packing_list", "Logistics"),
            Map.entry("tracking_slip", "Logistics"),
            Map.entry("invoice", "Invoice"),
            Map.entry("vendor_po", "PO to Vendor"),
            Map.entry("vendor_po_quotation", "PO to Vendor"),
            Map.entry("drawing", "Estimation"),
            Map.entry("estimation", "Estimation"),
            Map.entry("project_info", "Project Info"),
            Map.entry("upload", "Documents"),
            Map.entry("other", "Documents")
    );

    private static final Map<String, String> DOC_TYPE_TO_PROCUREMENT_FOLDER = Map.of(
            "vendor_po", "Approved PO",
            "sent_rfq", "Sent RFQ",
            "received_quotation", "Received Quotation"
    );

    private final FileManagerFolderRepository folderRepository;
    private final ProjectRepository projectRepository;

    public FolderStructureService(FileManagerFolderRepository folderRepository,
                                  ProjectRepository projectRepository) {
        this.folderRepository = folderRepository;
        this.projectRepository = projectRepository;
    }

    public synchronized void initializeRootFolders() {
        for (RootFolderDef root : ROOT_FOLDERS) {
            Optional<FileManagerFolderEntity> existing = folderRepository.findByPathAndCompanyIdIsNull(root.path());
            if (existing.isPresent()) {
                continue;
            }
            FileManagerFolderEntity row = new FileManagerFolderEntity();
            row.setId(UUID.randomUUID());
            row.setName(root.name());
            row.setSlug(root.slug());
            row.setParentId(null);
            row.setFolderType("root");
            row.setModuleType(root.moduleType());
            row.setCompanyId(null);
            row.setPath(root.path());
            row.setCreatedAt(Instant.now());
            row.setUpdatedAt(Instant.now());
            folderRepository.save(row);
        }
    }

    public FileManagerFolderEntity ensureProjectFolders(UUID projectId, String projectName, UUID companyId) {
        initializeRootFolders();

        if (projectName == null && projectId != null) {
            projectName = projectRepository.findById(projectId).map(ProjectEntity::getProjectName).orElse(null);
        }
        if (projectName == null) {
            return null;
        }

        final String resolvedProjectName = projectName;

        FileManagerFolderEntity root = folderRepository.findByPathAndCompanyIdIsNull("/Project Documents").orElse(null);
        if (root == null) {
            return null;
        }

        String projectPath = "/Project Documents/" + resolvedProjectName;
        FileManagerFolderEntity projectFolder = folderRepository
                .findByPathAndCompanyId(projectPath, companyId)
                .orElseGet(() -> {
                    FileManagerFolderEntity row = new FileManagerFolderEntity();
                    row.setId(UUID.randomUUID());
                row.setName(resolvedProjectName);
                row.setSlug(slugify(resolvedProjectName));
                    row.setParentId(root.getId());
                    row.setFolderType("project");
                    row.setModuleType("project");
                    row.setProjectId(projectId);
                    row.setCompanyId(companyId);
                    row.setPath(projectPath);
                    row.setCreatedAt(Instant.now());
                    row.setUpdatedAt(Instant.now());
                    return folderRepository.save(row);
                });

        for (String sub : PROJECT_SUBFOLDERS) {
            String subPath = projectPath + "/" + sub;
            folderRepository.findByPathAndCompanyId(subPath, companyId).orElseGet(() -> {
                FileManagerFolderEntity row = new FileManagerFolderEntity();
                row.setId(UUID.randomUUID());
                row.setName(sub);
                row.setSlug(slugify(sub));
                row.setParentId(projectFolder.getId());
                row.setFolderType("subfolder");
                row.setModuleType("project");
                row.setProjectId(projectId);
                row.setCompanyId(companyId);
                row.setPath(subPath);
                row.setCreatedAt(Instant.now());
                row.setUpdatedAt(Instant.now());
                return folderRepository.save(row);
            });
        }

        return projectFolder;
    }

    public FileManagerFolderEntity ensureProcurementFolders(UUID referenceId, String folderName, UUID companyId) {
        initializeRootFolders();

        FileManagerFolderEntity root = folderRepository.findByPathAndCompanyIdIsNull("/Procurement Documents").orElse(null);
        if (root == null) {
            return null;
        }

        String path = "/Procurement Documents/" + folderName;
        FileManagerFolderEntity parent = folderRepository.findByPathAndCompanyId(path, companyId).orElseGet(() -> {
            FileManagerFolderEntity row = new FileManagerFolderEntity();
            row.setId(UUID.randomUUID());
            row.setName(folderName);
            row.setSlug(slugify(folderName));
            row.setParentId(root.getId());
            row.setFolderType("procurement");
            row.setModuleType("procurement");
            row.setReferenceId(referenceId);
            row.setCompanyId(companyId);
            row.setPath(path);
            row.setCreatedAt(Instant.now());
            row.setUpdatedAt(Instant.now());
            return folderRepository.save(row);
        });

        for (String sub : PROCUREMENT_SUBFOLDERS) {
            String subPath = path + "/" + sub;
            folderRepository.findByPathAndCompanyId(subPath, companyId).orElseGet(() -> {
                FileManagerFolderEntity row = new FileManagerFolderEntity();
                row.setId(UUID.randomUUID());
                row.setName(sub);
                row.setSlug(slugify(sub));
                row.setParentId(parent.getId());
                row.setFolderType("subfolder");
                row.setModuleType("procurement");
                row.setReferenceId(referenceId);
                row.setCompanyId(companyId);
                row.setPath(subPath);
                row.setCreatedAt(Instant.now());
                row.setUpdatedAt(Instant.now());
                return folderRepository.save(row);
            });
        }

        return parent;
    }

    public FileManagerFolderEntity resolveFolder(String documentType,
                                                 UUID projectId,
                                                 UUID partId,
                                                 UUID companyId,
                                                 String moduleType) {
        String normalized = documentType == null ? "" : documentType.toLowerCase(Locale.ROOT).trim();

        if ("drawing".equals(normalized) && partId != null) {
            return folderRepository.findByPathAndCompanyIdIsNull("/Part Master").orElse(null);
        }

        if (DOC_TYPE_TO_PROCUREMENT_FOLDER.containsKey(normalized)) {
            String folderName = DOC_TYPE_TO_PROCUREMENT_FOLDER.get(normalized);
            List<FileManagerFolderEntity> candidates = companyId == null
                    ? folderRepository.findByModuleTypeAndCompanyIdIsNullOrderByPathAsc("procurement")
                    : folderRepository.findByModuleTypeAndCompanyIdOrderByPathAsc("procurement", companyId);
            return candidates.stream().filter(x -> folderName.equals(x.getName())).findFirst().orElse(null);
        }

        if (projectId != null) {
            String targetFolder = DOC_TYPE_TO_PROJECT_FOLDER.getOrDefault(normalized, "Documents");
            List<FileManagerFolderEntity> folders = companyId == null
                    ? folderRepository.findByProjectIdAndFolderType(projectId, "subfolder")
                    : folderRepository.findByProjectIdAndFolderTypeAndCompanyId(projectId, "subfolder", companyId);

            FileManagerFolderEntity hit = folders.stream()
                    .filter(x -> targetFolder.equals(x.getName()))
                    .findFirst()
                    .orElse(null);
            if (hit != null) {
                return hit;
            }

            ensureProjectFolders(projectId, null, companyId);
            List<FileManagerFolderEntity> reloaded = companyId == null
                    ? folderRepository.findByProjectIdAndFolderType(projectId, "subfolder")
                    : folderRepository.findByProjectIdAndFolderTypeAndCompanyId(projectId, "subfolder", companyId);
            return reloaded.stream().filter(x -> targetFolder.equals(x.getName())).findFirst().orElse(null);
        }

        if ("inventory".equals(moduleType)) {
            return folderRepository.findByPathAndCompanyIdIsNull("/Inventory").orElse(null);
        }

        if ("part_master".equals(moduleType)) {
            return folderRepository.findByPathAndCompanyIdIsNull("/Part Master").orElse(null);
        }

        return null;
    }

    public String getFilePath(FileManagerFolderEntity folder, String fileName) {
        if (folder == null || folder.getPath() == null || folder.getPath().isBlank()) {
            return "documents/" + fileName;
        }
        String cleanPath = folder.getPath().replaceAll("^/+", "");
        return "documents/" + cleanPath + "/" + fileName;
    }

    public Map<String, String> projectDocFolderMap() {
        return new LinkedHashMap<>(DOC_TYPE_TO_PROJECT_FOLDER);
    }

    private String slugify(String text) {
        return text == null
                ? ""
                : text.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
    }

    private record RootFolderDef(String name, String slug, String moduleType, String path) {
    }
}
