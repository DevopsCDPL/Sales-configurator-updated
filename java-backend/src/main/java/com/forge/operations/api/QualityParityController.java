package com.forge.operations.api;

import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.QualityParityService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.security.AuthenticatedUser;
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

import org.springframework.http.HttpHeaders;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Java parity of Node.js qualityRoutes.js.
 *
 * GET    /api/quality/inspection-types
 * GET    /api/quality/project/{projectId}
 * POST   /api/quality/project/{projectId}
 * POST   /api/quality/project/{projectId}/reports              (multipart)
 * DELETE /api/quality/project/{projectId}/reports/{fileIndex}
 * POST   /api/quality/project/{projectId}/complete
 * POST   /api/quality/project/{projectId}/coc                  (stub – PDF via Node.js)
 * PATCH  /api/quality/project/{projectId}/job-forms
 * POST   /api/quality/project/{projectId}/job/{jobIndex}/complete
 * POST   /api/quality/project/{projectId}/job/{jobIndex}/coc   (stub – PDF via Node.js)
 * POST   /api/quality/project/{projectId}/job/{jobIndex}/upload-doc/{itemIndex} (multipart)
 */
@RestController
@RequestMapping("/api/quality")
public class QualityParityController {

    private final QualityParityService qualityParityService;
    private final OperationAccessPolicy accessPolicy;

    public QualityParityController(QualityParityService qualityParityService,
                                   OperationAccessPolicy accessPolicy) {
        this.qualityParityService = qualityParityService;
        this.accessPolicy = accessPolicy;
    }

    // ── GET /api/quality/inspection-types ─────────────────────────────────────

    @GetMapping("/inspection-types")
    public ResponseEntity<?> getInspectionTypes(Authentication authentication) {
        accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(qualityParityService.getInspectionTypes()));
    }

    // ── GET /api/quality/project/{projectId} ──────────────────────────────────

    @GetMapping("/project/{projectId}")
    public ResponseEntity<?> getByProjectId(@PathVariable UUID projectId,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        return ResponseEntity.ok(ApiEnvelope.success(qualityParityService.getByProjectId(projectId, user)));
    }

    // ── POST /api/quality/project/{projectId} ─────────────────────────────────

    @PostMapping("/project/{projectId}")
    public ResponseEntity<?> createOrUpdate(@PathVariable UUID projectId,
                                            @RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.createOrUpdate(projectId, body, user)));
    }

    // ── POST /api/quality/project/{projectId}/reports  (multipart) ────────────

    @PostMapping(value = "/project/{projectId}/reports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadReport(@PathVariable UUID projectId,
                                          @RequestParam("file") MultipartFile file,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("No file uploaded"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.uploadReport(projectId, file, user)));
    }

    // ── DELETE /api/quality/project/{projectId}/reports/{fileIndex} ───────────

    @DeleteMapping("/project/{projectId}/reports/{fileIndex}")
    public ResponseEntity<?> removeReport(@PathVariable UUID projectId,
                                          @PathVariable int fileIndex,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.removeReport(projectId, fileIndex, user)));
    }

    // ── POST /api/quality/project/{projectId}/complete ────────────────────────

    @PostMapping("/project/{projectId}/complete")
    public ResponseEntity<?> markComplete(@PathVariable UUID projectId,
                                          @RequestBody Map<String, Object> body,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.markInspectionComplete(projectId, body, user)));
    }

    // ── POST /api/quality/project/{projectId}/coc  (PDF stub) ────────────────

    @PostMapping("/project/{projectId}/coc")
    public ResponseEntity<?> generateCoC(@PathVariable UUID projectId,
                                         Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        com.forge.configurator.entity.DocumentEntity doc = qualityParityService.generateCoCPdf(projectId, user);
        com.forge.operations.service.DocumentLifecycleService.DownloadPayload payload = qualityParityService.readDocument(doc.getId(), user);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(payload.contentType() == null ? MediaType.APPLICATION_PDF_VALUE : payload.contentType()));
        headers.setContentDisposition(ContentDisposition.attachment().filename(payload.fileName()).build());
        return new ResponseEntity<>(payload.bytes(), headers, HttpStatus.OK);
    }

    // ── PATCH /api/quality/project/{projectId}/job-forms ─────────────────────

    @PatchMapping("/project/{projectId}/job-forms")
    public ResponseEntity<?> saveJobForms(@PathVariable UUID projectId,
                                          @RequestBody Map<String, Object> body,
                                          Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> jobForms = (List<Map<String, Object>>) body.get("jobForms");
        if (jobForms == null) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("jobForms must be an array"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.saveJobForms(projectId, jobForms, user)));
    }

    // ── POST /api/quality/project/{projectId}/job/{jobIndex}/complete ─────────

    @PostMapping("/project/{projectId}/job/{jobIndex}/complete")
    public ResponseEntity<?> completeJobInspection(@PathVariable UUID projectId,
                                                   @PathVariable int jobIndex,
                                                   Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.completeJobInspection(projectId, jobIndex, user)));
    }

    // ── POST /api/quality/project/{projectId}/job/{jobIndex}/coc  (PDF stub) ──

    @PostMapping("/project/{projectId}/job/{jobIndex}/coc")
    public ResponseEntity<?> generateJobCoC(@PathVariable UUID projectId,
                                            @PathVariable int jobIndex,
                                            Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        com.forge.configurator.entity.DocumentEntity doc = qualityParityService.generateJobCoCPdf(projectId, jobIndex, user);
        com.forge.operations.service.DocumentLifecycleService.DownloadPayload payload = qualityParityService.readDocument(doc.getId(), user);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(payload.contentType() == null ? MediaType.APPLICATION_PDF_VALUE : payload.contentType()));
        headers.setContentDisposition(ContentDisposition.attachment().filename(payload.fileName()).build());
        return new ResponseEntity<>(payload.bytes(), headers, HttpStatus.OK);
    }


    // ── POST /api/quality/project/{projectId}/job/{jobIndex}/upload-doc/{itemIndex} ──

    @PostMapping(value = "/project/{projectId}/job/{jobIndex}/upload-doc/{itemIndex}",
                 consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> uploadJobItemDoc(@PathVariable UUID projectId,
                                              @PathVariable int jobIndex,
                                              @PathVariable int itemIndex,
                                              @RequestParam("file") MultipartFile file,
                                              Authentication authentication) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(authentication);
        accessPolicy.requireNodeAuthorize(user, "admin", "quality");
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiEnvelope.error("No file uploaded"));
        }
        return ResponseEntity.ok(ApiEnvelope.success(
                qualityParityService.uploadJobItemDoc(projectId, jobIndex, itemIndex, file, user)));
    }
}

