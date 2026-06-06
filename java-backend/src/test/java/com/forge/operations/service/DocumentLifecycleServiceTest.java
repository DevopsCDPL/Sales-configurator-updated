package com.forge.operations.service;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.FileManagerFolderEntity;
import com.forge.operations.storage.LocalStorageService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.security.AuthenticatedUser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentLifecycleServiceTest {

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private FolderStructureService folderStructureService;

    @Mock
    private LocalStorageService localStorageService;

    @Mock
    private R2StorageService r2StorageService;

    @Mock
    private OperationAccessPolicy accessPolicy;

    @InjectMocks
    private DocumentLifecycleService service;

    private UUID companyId;
    private UUID projectId;
    private AuthenticatedUser user;

    @BeforeEach
    void setup() {
        companyId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        user = new AuthenticatedUser(UUID.randomUUID(), "admin@forge.test", "admin", companyId, "Forge", Map.of());
    }

    @Test
    void uploadProjectDocumentPersistsVersionedRowAndDraftsPrevious() throws Exception {
        ProjectEntity project = new ProjectEntity();
        project.setId(projectId);
        project.setCompanyId(companyId);
        project.setProjectName("Alpha Project");

        FileManagerFolderEntity folder = new FileManagerFolderEntity();
        folder.setId(UUID.randomUUID());
        folder.setPath("/Project Documents/Alpha Project/Documents");

        DocumentEntity previous = new DocumentEntity();
        previous.setId(UUID.randomUUID());
        previous.setVersion(2);
        previous.setStatus("final");

        MultipartFile file = new MockMultipartFile(
                "file",
                "existing.pdf",
                "application/pdf",
                "hello world".getBytes()
        );

        when(accessPolicy.resolveCompanyScope(user)).thenReturn(companyId);
        when(projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyId)).thenReturn(Optional.of(project));
        when(folderStructureService.resolveFolder(eq("quotation"), eq(projectId), eq(null), eq(companyId), eq("project"))).thenReturn(folder);
        when(folderStructureService.getFilePath(eq(folder), anyString())).thenReturn("documents/Project Documents/Alpha Project/Documents/existing.pdf");
        when(documentRepository.findForFileManager(any(), any(), any(), any(), any(), any(), any(), any()))
            .thenAnswer(invocation -> List.of(previous));
        when(documentRepository.save(any(DocumentEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(r2StorageService.isConfigured()).thenReturn(false);

        DocumentEntity saved = service.uploadProjectDocument(projectId, file, "quotation", "Q PDF", null, user);

        assertEquals("project", saved.getModuleType());
        assertEquals("quotation", saved.getDocumentType());
        assertEquals(3, saved.getVersion());
        assertEquals("final", saved.getStatus());
        assertEquals("uploaded", saved.getFileType());

        verify(localStorageService).writeBytes(eq("documents/Project Documents/Alpha Project/Documents/existing.pdf"), any(byte[].class));
        verify(documentRepository).saveAll(anyList());
        assertEquals("draft", previous.getStatus());
    }

    @Test
    void readDocumentLoadsFromLocalStorageWhenPresent() throws Exception {
        UUID docId = UUID.randomUUID();

        DocumentEntity row = new DocumentEntity();
        row.setId(docId);
        row.setCompanyId(companyId);
        row.setFilePath("documents/x.pdf");
        row.setFileName("x.pdf");

        byte[] payload = "pdf-data".getBytes();

        when(accessPolicy.resolveCompanyScope(user)).thenReturn(companyId);
        when(documentRepository.findByIdAndCompanyId(docId, companyId)).thenReturn(Optional.of(row));
        when(localStorageService.exists("documents/x.pdf")).thenReturn(true);
        when(localStorageService.readBytes("documents/x.pdf")).thenReturn(payload);
        when(localStorageService.mimeFromExt("x.pdf")).thenReturn("application/pdf");

        DocumentLifecycleService.DownloadPayload loaded = service.readDocument(docId, user, false);

        assertArrayEquals(payload, loaded.bytes());
        assertEquals("application/pdf", loaded.contentType());
        assertEquals("x.pdf", loaded.fileName());
    }

    @Test
    void mergeDocumentsMergesPdfAndSkipsUnsupportedFiles() throws Exception {
        UUID pdfId = UUID.randomUUID();
        UUID txtId = UUID.randomUUID();

        DocumentEntity pdfDoc = new DocumentEntity();
        pdfDoc.setId(pdfId);
        pdfDoc.setCompanyId(companyId);
        pdfDoc.setFilePath("documents/a.pdf");
        pdfDoc.setFileName("a.pdf");
        pdfDoc.setCreatedAt(Instant.now());

        DocumentEntity txtDoc = new DocumentEntity();
        txtDoc.setId(txtId);
        txtDoc.setCompanyId(companyId);
        txtDoc.setFilePath("documents/b.txt");
        txtDoc.setFileName("b.txt");
        txtDoc.setCreatedAt(Instant.now());

        byte[] pdfBytes = createPdfBytes();
        byte[] txtBytes = "plain text".getBytes();

        when(accessPolicy.resolveCompanyScope(user)).thenReturn(companyId);
        when(documentRepository.findByIdAndCompanyId(pdfId, companyId)).thenReturn(Optional.of(pdfDoc));
        when(documentRepository.findByIdAndCompanyId(txtId, companyId)).thenReturn(Optional.of(txtDoc));

        when(localStorageService.exists("documents/a.pdf")).thenReturn(true);
        when(localStorageService.exists("documents/b.txt")).thenReturn(true);

        when(localStorageService.readBytes("documents/a.pdf")).thenReturn(pdfBytes);
        when(localStorageService.readBytes("documents/b.txt")).thenReturn(txtBytes);

        when(localStorageService.mimeFromExt("a.pdf")).thenReturn("application/pdf");
        when(localStorageService.mimeFromExt("b.txt")).thenReturn("text/plain");

        DocumentLifecycleService.MergeResult result = service.mergeDocuments(List.of(pdfId, txtId), user);

        assertEquals(1, result.merged());
        assertEquals(1, result.totalPages());
        assertFalse(result.skipped().isEmpty());
        assertTrue(result.buffer().length > 0);
    }

    private byte[] createPdfBytes() throws Exception {
        try (PDDocument document = new PDDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }
}
