package com.forge.operations.api;

import com.forge.operations.entity.StockEntity;
import com.forge.operations.service.OperationAccessPolicy;
import com.forge.operations.service.StockParityService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/stocks")
public class StockParityController {

    private final StockParityService stockService;
    private final OperationAccessPolicy accessPolicy;
    private final R2StorageService r2;

    public StockParityController(StockParityService stockService,
                                 OperationAccessPolicy accessPolicy,
                                 R2StorageService r2) {
        this.stockService = stockService;
        this.accessPolicy = accessPolicy;
        this.r2 = r2;
    }

    // ── List / Read ──────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) Map<String, String> query,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.getAllStock(query, user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id,
                                                                     Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.getStockById(id, user)));
    }

    @GetMapping("/raw-material/{rawMaterialId}")
    public ResponseEntity<?> getByRawMaterial(@PathVariable UUID rawMaterialId,
                                                                              Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.getByRawMaterialId(rawMaterialId)));
    }

    @GetMapping("/heat-numbers")
    public ResponseEntity<?> getHeatNumbers(
            @RequestParam(required = false) Map<String, String> query,
            Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.getHeatNumbers(query, user)));
    }

    // ── Write ────────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> payload,
                                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.createStock(payload, user)));
    }

    @PostMapping("/bulk")
    public ResponseEntity<?> bulkCreate(@RequestBody Map<String, Object> body,
                                                                              Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        if (items == null) throw new ApiException(HttpStatus.BAD_REQUEST, "items array is required");
        return ResponseEntity.ok(ApiEnvelope.success(stockService.bulkCreateStock(items, user)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable UUID id,
                                                                    @RequestBody Map<String, Object> payload,
                                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.updateStock(id, payload, user)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable UUID id,
                                                                    Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        return ResponseEntity.ok(ApiEnvelope.success(stockService.deleteStock(id, user)));
    }

    @PostMapping("/add-unused")
    public ResponseEntity<?> addUnused(@RequestBody Map<String, Object> body,
                                                                       Authentication auth) {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        String partDescription = String.valueOf(body.get("part_description"));
        String materialGrade = String.valueOf(body.get("material_grade"));
        double quantity = body.get("quantity") instanceof Number n ? n.doubleValue() : 0.0;
        return ResponseEntity.ok(ApiEnvelope.success(stockService.addUnused(partDescription, materialGrade, quantity, user)));
    }

    // ── Certificate Upload / Download ─────────────────────────────────────

    @PostMapping("/{id}/upload-certificate")
    public ResponseEntity<?> uploadCertificate(
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file,
            Authentication auth) throws IOException {
        accessPolicy.requirePrincipal(auth);
        if (!r2.isConfigured()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Storage is not configured");
        }
        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "certificate";
        String key = "stock-certificates/" + id + "/" + originalFilename;
        String storedKey = r2.upload(file.getBytes(), key, file.getContentType());
        stockService.updateCertificateUrl(id, storedKey);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("certificate_url", storedKey)));
    }

    @GetMapping("/{id}/certificate")
    public ResponseEntity<byte[]> downloadCertificate(@PathVariable UUID id, Authentication auth) {
        accessPolicy.requirePrincipal(auth);
        StockEntity stock = stockService.getEntityById(id);
        if (stock.getCertificateUrl() == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No certificate for this stock item");
        }
        R2StorageService.DownloadedObject obj = r2.download(stock.getCertificateUrl());
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(obj.contentType()));
        return new ResponseEntity<>(obj.buffer(), headers, HttpStatus.OK);
    }

    // ── Import (CSV or Excel) ─────────────────────────────────────────────

    @PostMapping("/import")
    public ResponseEntity<?> importStock(
            @RequestParam("file") MultipartFile file,
            Authentication auth) throws IOException {
        AuthenticatedUser user = accessPolicy.requirePrincipal(auth);
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        List<Map<String, Object>> rows;

        if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
            rows = parseExcel(file);
        } else {
            rows = parseCsv(file);
        }

        if (rows.isEmpty()) {
            return ResponseEntity.ok(ApiEnvelope.success(Map.of("imported", 0, "message", "No valid rows found")));
        }

        List<Map<String, Object>> created = stockService.bulkCreateStock(rows, user);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("imported", created.size(), "items", created)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private List<Map<String, Object>> parseExcel(MultipartFile file) throws IOException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (Workbook wb = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = wb.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) return result;

            List<String> headers = new ArrayList<>();
            for (Cell c : headerRow) {
                headers.add(c.getStringCellValue().trim().toLowerCase().replace(' ', '_'));
            }

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                Map<String, Object> item = new LinkedHashMap<>();
                for (int j = 0; j < headers.size(); j++) {
                    Cell cell = row.getCell(j);
                    if (cell == null) { item.put(headers.get(j), null); continue; }
                    switch (cell.getCellType()) {
                        case NUMERIC -> item.put(headers.get(j), cell.getNumericCellValue());
                        case BOOLEAN -> item.put(headers.get(j), cell.getBooleanCellValue());
                        default -> item.put(headers.get(j), cell.getStringCellValue());
                    }
                }
                if (item.get("part_description") != null && item.get("material_grade") != null) {
                    result.add(item);
                }
            }
        }
        return result;
    }

    private List<Map<String, Object>> parseCsv(MultipartFile file) throws IOException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) return result;
            String[] headers = headerLine.split(",", -1);
            for (int i = 0; i < headers.length; i++) {
                headers[i] = headers[i].trim().toLowerCase().replace(' ', '_');
            }
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(",", -1);
                Map<String, Object> item = new LinkedHashMap<>();
                for (int j = 0; j < headers.length; j++) {
                    item.put(headers[j], j < parts.length ? parts[j].trim() : null);
                }
                if (item.get("part_description") != null && item.get("material_grade") != null) {
                    result.add(item);
                }
            }
        }
        return result;
    }
}
