package com.forge.operations.api;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.operations.service.DocumentLifecycleService;
import com.forge.operations.service.FileManagerParityService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.ParityMapper;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/file-manager")
public class FileManagerParityController {
    private final FileManagerParityService fileManagerParityService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public FileManagerParityController(FileManagerParityService fileManagerParityService,
                                       OperationAccessPolicy accessPolicy,
                                       ParityMapper mapper) {
        this.fileManagerParityService = fileManagerParityService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    @GetMapping("/tree")
    public ResponseEntity<?> getTree(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getTree(user)));
    }

    @GetMapping("/browse")
    public ResponseEntity<?> browse(@RequestParam(value = "prefix", required = false) String prefix,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        R2StorageService.ListResult result = fileManagerParityService.browseR2(prefix, user);
        return ResponseEntity.ok(ApiEnvelope.success(result));
    }

    @GetMapping("/r2/projects")
    public ResponseEntity<?> r2Projects(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.r2Projects(user)));
    }

    @GetMapping("/r2/project-files")
    public ResponseEntity<?> r2ProjectFiles(@RequestParam("projectPrefix") String projectPrefix,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.r2ProjectFiles(projectPrefix, user)));
    }

    @GetMapping("/r2/view")
    public ResponseEntity<?> viewByKey(@RequestParam("key") String key,
                                       Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentLifecycleService.DownloadPayload payload = fileManagerParityService.viewByR2Key(key, user, true);
        return binary(payload.bytes(), payload.contentType(), payload.fileName(), true);
    }

    @GetMapping("/r2/download")
    public ResponseEntity<?> downloadByKey(@RequestParam("key") String key,
                                           Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentLifecycleService.DownloadPayload payload = fileManagerParityService.viewByR2Key(key, user, false);
        return binary(payload.bytes(), payload.contentType(), payload.fileName(), false);
    }

    @GetMapping("/r2/signed-url")
    public ResponseEntity<?> getSignedUrl(@RequestParam("key") String key,
                                          @RequestParam(value = "expiresIn", defaultValue = "3600") Integer expiresIn,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getSignedUrl(key, user, expiresIn)));
    }

    @DeleteMapping("/r2/file")
    public ResponseEntity<?> deleteByKey(@RequestParam("key") String key,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = fileManagerParityService.deleteByR2Key(key, user);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", result.get("message"));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/folders/by-path")
    public ResponseEntity<?> getFolderByPath(@RequestParam("path") String path,
                                             Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getFolderByPath(path, user)));
    }

    @GetMapping("/folders/{id}")
    public ResponseEntity<?> getFolderContents(@PathVariable("id") UUID id,
                                               Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getFolderContents(id, user)));
    }

    @GetMapping("/documents")
    public ResponseEntity<?> getDocuments(@RequestParam Map<String, String> query,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getDocuments(query, user)));
    }

    @GetMapping("/parts")
    public ResponseEntity<?> getPartMasterDocuments(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getPartMasterDocuments(user)));
    }

    @GetMapping("/inventory")
    public ResponseEntity<?> getInventoryDocuments(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getInventoryDocuments(user)));
    }

    @GetMapping("/projects")
    public ResponseEntity<?> getProjects(Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(fileManagerParityService.getProjects(user)));
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file,
                                    @RequestParam Map<String, String> params,
                                    Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> payload = new LinkedHashMap<>(params);
        DocumentEntity row = fileManagerParityService.uploadFile(file, payload, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    @PostMapping("/ensure-project-folders")
    public ResponseEntity<?> ensureProjectFolders(@RequestBody Map<String, Object> body,
                                                  Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);

        UUID projectId = asUuid(body.get("project_id"));
        String projectName = text(body.get("project_name"));
        UUID companyId = asUuid(body.get("company_id"));

        if (projectId == null || projectName == null || projectName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "project_id and project_name required");
        }

        fileManagerParityService.ensureProjectFolders(projectId, projectName, companyId);
        return ResponseEntity.ok(Map.of("success", true, "message", "Project folders ensured"));
    }

    @PostMapping("/ensure-procurement-folders")
    public ResponseEntity<?> ensureProcurementFolders(@RequestBody Map<String, Object> body,
                                                      Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);

        UUID referenceId = asUuid(body.get("reference_id"));
        String folderName = text(body.get("folder_name"));
        UUID companyId = asUuid(body.get("company_id"));

        if (referenceId == null || folderName == null || folderName.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "reference_id and folder_name required");
        }

        fileManagerParityService.ensureProcurementFolders(referenceId, folderName, companyId);
        return ResponseEntity.ok(Map.of("success", true, "message", "Procurement folders ensured"));
    }

    @PatchMapping("/documents/{id}/status")
    public ResponseEntity<?> updateDocumentStatus(@PathVariable("id") UUID id,
                                                  @RequestBody Map<String, Object> body,
                                                  Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        String status = text(body.get("status"));
        DocumentEntity row = fileManagerParityService.updateDocumentStatus(id, status, user);
        return ResponseEntity.ok(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    @GetMapping("/documents/{id}/download")
    public ResponseEntity<?> downloadDocument(@PathVariable("id") UUID id,
                                              Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentLifecycleService.DownloadPayload payload = fileManagerParityService.downloadFile(id, user);
        return binary(payload.bytes(), payload.contentType(), payload.fileName(), false);
    }

    @GetMapping("/documents/{id}/view")
    public ResponseEntity<?> viewDocument(@PathVariable("id") UUID id,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentLifecycleService.DownloadPayload payload = fileManagerParityService.viewFile(id, user);
        return binary(payload.bytes(), payload.contentType(), payload.fileName(), true);
    }

    @GetMapping("/view-by-path")
    public ResponseEntity<?> viewByPath(@RequestParam("file") String file,
                                        Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentLifecycleService.DownloadPayload payload = fileManagerParityService.viewFileByPath(file, user);
        return binary(payload.bytes(), payload.contentType(), payload.fileName(), true);
    }

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<?> deleteDocument(@PathVariable("id") UUID id,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = fileManagerParityService.deleteFile(id, user);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", result.get("message"));
        return ResponseEntity.ok(response);
    }

    private ResponseEntity<byte[]> binary(byte[] bytes,
                                          String contentType,
                                          String fileName,
                                          boolean inline) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType));
        headers.setContentDisposition(inline
                ? ContentDisposition.inline().filename(fileName).build()
                : ContentDisposition.attachment().filename(fileName).build());
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
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

    private String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
