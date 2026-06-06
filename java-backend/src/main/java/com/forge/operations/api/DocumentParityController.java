package com.forge.operations.api;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.operations.service.DocumentLifecycleService;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.ParityMapper;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/documents")
public class DocumentParityController {
    private static final Map<String, String> FRIENDLY_NAMES = buildFriendlyNames();

    private final DocumentLifecycleService documentLifecycleService;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public DocumentParityController(DocumentLifecycleService documentLifecycleService,
                                    OperationAccessPolicy accessPolicy,
                                    ParityMapper mapper) {
        this.documentLifecycleService = documentLifecycleService;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProjectId(@PathVariable("projectId") UUID projectId,
                                            @RequestParam Map<String, String> query,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<DocumentEntity> rows = documentLifecycleService.getProjectDocuments(projectId, query, user);
        List<Map<String, Object>> data = rows.stream().map(mapper::toDocumentMap).toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable("id") UUID id,
                                     Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity row = documentLifecycleService.getDocumentById(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    @GetMapping("/{id}/view")
    public ResponseEntity<?> viewDocument(@PathVariable("id") UUID id,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity row = documentLifecycleService.getDocumentById(id, user);
        DocumentLifecycleService.DownloadPayload payload = documentLifecycleService.readDocument(id, user, true);
        String fileName = friendlyFilename(row);
        return binaryResponse(payload.bytes(), payload.contentType(), fileName, true);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<?> downloadDocument(@PathVariable("id") UUID id,
                                              Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity row = documentLifecycleService.getDocumentById(id, user);
        DocumentLifecycleService.DownloadPayload payload = documentLifecycleService.readDocument(id, user, false);
        String fileName = friendlyFilename(row);
        return binaryResponse(payload.bytes(), payload.contentType(), fileName, false);
    }

    @PostMapping("/project/{projectId}/quotation")
    public ResponseEntity<?> generateQuotation(@PathVariable("projectId") UUID projectId,
                                               Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "user");
        return generated(projectId, "quotation", user);
    }

    @PostMapping("/project/{projectId}/work-order")
    public ResponseEntity<?> generateWorkOrder(@PathVariable("projectId") UUID projectId,
                                               Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "production");
        return generated(projectId, "work_order", user);
    }

    @PostMapping("/project/{projectId}/traveller")
    public ResponseEntity<?> generateTraveller(@PathVariable("projectId") UUID projectId,
                                               Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "production");
        return generated(projectId, "production_traveller", user);
    }

    @PostMapping("/project/{projectId}/coc")
    public ResponseEntity<?> generateCoC(@PathVariable("projectId") UUID projectId,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        return generated(projectId, "coc", user);
    }

    @PostMapping("/project/{projectId}/packing-list")
    public ResponseEntity<?> generatePackingList(@PathVariable("projectId") UUID projectId,
                                                 Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "logistics");
        return generated(projectId, "packing_list", user);
    }

    @PostMapping(value = "/project/{projectId}/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadDocument(@PathVariable("projectId") UUID projectId,
                                            @RequestParam("file") MultipartFile file,
                                            @RequestParam(value = "type", required = false) String type,
                                            @RequestParam(value = "description", required = false) String description,
                                            @RequestParam(value = "part_id", required = false) String partId,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity row = documentLifecycleService.uploadProjectDocument(projectId, file, type, description, asUuid(partId), user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    @PatchMapping("/{id}/finalize")
    public ResponseEntity<?> finalizeDocument(@PathVariable("id") UUID id,
                                              Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        DocumentEntity row = documentLifecycleService.finalizeDocument(id, user);
        return ResponseEntity.ok(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    @PostMapping("/merge")
    public ResponseEntity<?> mergeDocuments(@RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        List<UUID> ids = parseIds(body.get("documentIds"));
        String projectName = text(body.get("projectName"));

        DocumentLifecycleService.MergeResult merged = documentLifecycleService.mergeDocuments(ids, user);
        String safeName = (projectName == null || projectName.isBlank())
                ? "Project"
                : projectName.replaceAll("[^a-zA-Z0-9_-]", "_");
        String fileName = safeName + "_MergedDocuments.pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment().filename(fileName).build());
        headers.add("Access-Control-Expose-Headers", "X-Merge-Count, X-Merge-Pages, X-Merge-Skipped, X-Merge-Missing-Count, X-Merge-Missing");
        headers.add("X-Merge-Count", String.valueOf(merged.merged()));
        headers.add("X-Merge-Pages", String.valueOf(merged.totalPages()));
        if (!merged.skipped().isEmpty()) {
            headers.add("X-Merge-Skipped", String.join(", ", merged.skipped()));
        }
        if (!merged.missingDocs().isEmpty()) {
            headers.add("X-Merge-Missing-Count", String.valueOf(merged.missingDocs().size()));
            String compact = URLEncoder.encode(String.valueOf(merged.missingDocs()), StandardCharsets.UTF_8);
            headers.add("X-Merge-Missing", compact);
        }

        return new ResponseEntity<>(merged.buffer(), headers, HttpStatus.OK);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteDocument(@PathVariable("id") UUID id,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        Map<String, Object> result = documentLifecycleService.deleteDocument(id, user);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", result.get("message"));
        return ResponseEntity.ok(response);
    }

    private ResponseEntity<byte[]> binaryResponse(byte[] bytes,
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

    private ResponseEntity<?> generated(UUID projectId, String documentType, AuthenticatedUser user) {
        DocumentEntity row = documentLifecycleService.generateProjectDocument(projectId, documentType, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(mapper.toDocumentMap(row)));
    }

    private String friendlyFilename(DocumentEntity row) {
        String original = row.getFileName() == null ? "document" : row.getFileName();
        String ext = ".pdf";
        int dot = original.lastIndexOf('.');
        if (dot > -1) {
            ext = original.substring(dot);
        }

        String key = row.getDocumentType() == null ? "" : row.getDocumentType().toLowerCase(Locale.ROOT);
        String friendly = FRIENDLY_NAMES.get(key);
        if (friendly == null) {
            return original;
        }
        return friendly + ext;
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private UUID asUuid(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid UUID");
        }
    }

    private List<UUID> parseIds(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "documentIds array is required.");
        }

        List<UUID> ids = new ArrayList<>();
        for (Object row : list) {
            if (row instanceof UUID uuid) {
                ids.add(uuid);
                continue;
            }
            try {
                ids.add(UUID.fromString(String.valueOf(row)));
            } catch (Exception ex) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid document id in documentIds");
            }
        }
        return ids;
    }

    private static Map<String, String> buildFriendlyNames() {
        Map<String, String> names = new LinkedHashMap<>();
        names.put("quotation", "Quotation");
        names.put("rfq", "RFQ");
        names.put("rfq_quotation", "RFQ");
        names.put("purchase_order", "PO_from_Client");
        names.put("vendor_po", "PO_to_Vendor");
        names.put("vendor_po_quotation", "Vendor_Quotation");
        names.put("invoice", "Invoice");
        names.put("proforma_invoice", "Proforma_Invoice");
        names.put("commercial_invoice", "Commercial_Invoice");
        names.put("work_order", "Work_Order");
        names.put("coc", "COC");
        names.put("certificate_of_conformance", "COC");
        names.put("packing_list", "Packing_List");
        names.put("tracking_slip", "Tracking_Slip");
        names.put("inspection_report", "Inspection_Report");
        names.put("quality_report", "Quality_Report");
        names.put("drawing", "Drawing");
        names.put("estimate", "Estimate");
        return names;
    }
}
