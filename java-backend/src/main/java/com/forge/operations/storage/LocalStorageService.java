package com.forge.operations.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Locale;

@Service
public class LocalStorageService {
    private final Path root;

    public LocalStorageService(@Value("${app.storage.local-root:java-backend/generated}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    public Path root() {
        return root;
    }

    public Path resolve(String filePath) {
        if (filePath == null || filePath.isBlank()) {
            return root;
        }
        Path candidate = Path.of(filePath);
        if (candidate.isAbsolute()) {
            return candidate.normalize();
        }
        return root.resolve(candidate).normalize();
    }

    public Path writeBytes(String relativePath, byte[] content) throws IOException {
        Path file = resolve(relativePath);
        Files.createDirectories(file.getParent());
        Files.write(file, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
        return file;
    }

    public byte[] readBytes(String filePath) throws IOException {
        return Files.readAllBytes(resolve(filePath));
    }

    public boolean exists(String filePath) {
        return Files.exists(resolve(filePath));
    }

    public void deleteIfExists(String filePath) throws IOException {
        Files.deleteIfExists(resolve(filePath));
    }

    public String mimeFromExt(String filename) {
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".doc")) return "application/msword";
        if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
        if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (lower.endsWith(".csv")) return "text/csv";
        if (lower.endsWith(".dwg")) return "application/acad";
        if (lower.endsWith(".dxf")) return "application/dxf";
        if (lower.endsWith(".step") || lower.endsWith(".stp")) return "application/step";
        return "application/octet-stream";
    }
}
