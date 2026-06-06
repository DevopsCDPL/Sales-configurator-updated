package com.forge.operations.storage;

import com.forge.auth.entity.CompanyEntity;
import com.forge.auth.repository.CompanyRepository;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class R2StorageService {
    private final String bucket;
    private final boolean configured;
    private final S3Client s3;
    private final S3Presigner presigner;
    private final CompanyRepository companyRepository;
    private final ProjectRepository projectRepository;

    public R2StorageService(@Value("${CLOUDFLARE_ACCOUNT_ID:}") String accountId,
                            @Value("${R2_ACCESS_KEY_ID:}") String accessKey,
                            @Value("${R2_SECRET_ACCESS_KEY:}") String secretKey,
                            @Value("${R2_BUCKET_NAME:forge-files}") String bucket,
                            CompanyRepository companyRepository,
                            ProjectRepository projectRepository) {
        this.bucket = bucket;
        this.companyRepository = companyRepository;
        this.projectRepository = projectRepository;

        this.configured = !blank(accountId) && !blank(accessKey) && !blank(secretKey);
        if (!this.configured) {
            this.s3 = null;
            this.presigner = null;
            return;
        }

        URI endpoint = URI.create("https://" + accountId + ".r2.cloudflarestorage.com");
        AwsBasicCredentials creds = AwsBasicCredentials.create(accessKey, secretKey);
        StaticCredentialsProvider provider = StaticCredentialsProvider.create(creds);

        this.s3 = S3Client.builder()
                .region(Region.of("auto"))
                .endpointOverride(endpoint)
                .credentialsProvider(provider)
                .build();

        this.presigner = S3Presigner.builder()
                .region(Region.of("auto"))
                .endpointOverride(endpoint)
                .credentialsProvider(provider)
                .build();
    }

    public boolean isConfigured() {
        return configured;
    }

    public String upload(byte[] buffer, String key, String contentType) {
        if (!configured) {
            throw new IllegalStateException("R2 storage is not configured");
        }
        String normalizedKey = normaliseKey(key);
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(normalizedKey)
                .contentType(contentType == null ? mimeFromExt(normalizedKey) : contentType)
                .build();
        s3.putObject(request, RequestBody.fromBytes(buffer));
        return normalizedKey;
    }

    public DownloadedObject download(String key) {
        if (!configured) {
            throw new IllegalStateException("R2 storage is not configured");
        }
        String normalizedKey = normaliseKey(key);
        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(normalizedKey)
                .build();
        ResponseBytes<GetObjectResponse> response = s3.getObjectAsBytes(request);
        String contentType = response.response().contentType();
        if (blank(contentType)) {
            contentType = mimeFromExt(normalizedKey);
        }
        return new DownloadedObject(response.asByteArray(), contentType);
    }

    public void remove(String key) {
        if (!configured) {
            return;
        }
        String normalizedKey = normaliseKey(key);
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(normalizedKey).build());
    }

    public ListResult listPrefix(String prefix) {
        if (!configured) {
            return new ListResult(List.of(), List.of());
        }

        String normalizedPrefix = blank(prefix) ? "" : normaliseKey(prefix).replaceAll("/+$", "") + "/";
        ListObjectsV2Request request = ListObjectsV2Request.builder()
                .bucket(bucket)
                .prefix(blank(normalizedPrefix) ? null : normalizedPrefix)
                .delimiter("/")
                .maxKeys(1000)
                .build();

        ListObjectsV2Response response = s3.listObjectsV2(request);

        List<String> folders = response.commonPrefixes() == null
                ? List.of()
                : response.commonPrefixes().stream().map(cp -> cp.prefix()).toList();

        List<ListedObject> files = new ArrayList<>();
        if (response.contents() != null) {
            response.contents().forEach(obj -> {
                if (!Objects.equals(obj.key(), normalizedPrefix)) {
                    files.add(new ListedObject(obj.key(), obj.size(), obj.lastModified()));
                }
            });
        }

        return new ListResult(folders, files);
    }

    public String getSignedUrl(String key, int expiresSeconds) {
        if (!configured) {
            throw new IllegalStateException("R2 storage is not configured");
        }
        String normalizedKey = normaliseKey(key);
        GetObjectRequest get = GetObjectRequest.builder()
                .bucket(bucket)
                .key(normalizedKey)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(Math.max(1, expiresSeconds)))
                .getObjectRequest(get)
                .build();

        return presigner.presignGetObject(presignRequest).url().toString();
    }

    public String normaliseKey(String key) {
        if (key == null) {
            return "";
        }
        return key.replace('\\', '/').replaceAll("^/+", "");
    }

    public String keyFromDbPath(String dbPath) {
        if (blank(dbPath)) {
            return null;
        }
        String key = dbPath.replace('\\', '/');
        key = key.replaceAll("^/?(uploads/)+", "");
        int idx = key.indexOf("/uploads/");
        if (idx >= 0) {
            key = key.substring(idx + "/uploads/".length());
        }
        return normaliseKey(key);
    }

    public String sanitiseFolderName(String value) {
        if (blank(value)) {
            return "Unknown";
        }
        return value
                .replaceAll("[<>:\"/\\\\|?*]+", "_")
                .replaceAll("\\s+", "_")
                .trim();
    }

    public String mimeFromExt(String filename) {
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".doc")) return "application/msword";
        if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
        if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (lower.endsWith(".csv")) return "text/csv";
        return "application/octet-stream";
    }

    public ResolvedNames resolveNames(UUID companyId, UUID projectId) {
        String companyName = null;
        String companyCode = null;
        String projectName = null;
        String projectNumber = null;

        if (projectId != null) {
            Optional<ProjectEntity> project = projectRepository.findById(projectId);
            if (project.isPresent()) {
                ProjectEntity value = project.get();
                projectName = value.getProjectName();
                projectNumber = value.getProjectNumber();
                if (companyId == null) {
                    companyId = value.getCompanyId();
                }
            }
        }

        if (companyId != null) {
            Optional<CompanyEntity> company = companyRepository.findById(companyId);
            if (company.isPresent()) {
                companyName = company.get().getName();
                companyCode = company.get().getCompanyCode();
            }
        }

        return new ResolvedNames(companyName, companyCode, projectName, projectNumber);
    }

    public String buildR2Key(String companyName,
                             String projectName,
                             String section,
                             String filename,
                             UUID companyId,
                             String companyCode,
                             UUID projectId,
                             String projectNumber) {
        List<String> parts = new ArrayList<>();

        if (!blank(companyName)) {
            String companySuffix = !blank(companyCode)
                    ? companyCode
                    : (companyId == null ? "" : companyId.toString());
            String companySegment = blank(companySuffix)
                    ? companyName
                    : companyName + "_" + companySuffix;
            parts.add(sanitiseFolderName(companySegment));
        }

        if (!blank(projectName)) {
            String projectSuffix = !blank(projectNumber)
                    ? projectNumber
                    : (projectId == null ? "" : projectId.toString());
            String projectSegment = blank(projectSuffix)
                    ? projectName
                    : projectName + "_" + projectSuffix;
            parts.add(sanitiseFolderName(projectSegment));
        }

        if (!blank(section)) {
            parts.add(section);
        }

        parts.add(filename);
        return normaliseKey(String.join("/", parts));
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    public record DownloadedObject(byte[] buffer, String contentType) {
    }

    public record ListedObject(String key, long size, Instant lastModified) {
    }

    public record ListResult(List<String> folders, List<ListedObject> files) {
    }

    public record ResolvedNames(String companyName, String companyCode, String projectName, String projectNumber) {
    }
}
