package com.forge.operations.service;

import com.forge.operations.entity.RawMaterialEntity;
import com.forge.operations.entity.StockEntity;
import com.forge.operations.repository.RawMaterialRepository;
import com.forge.operations.repository.StockRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class StockParityService {

    private static final Logger log = LoggerFactory.getLogger(StockParityService.class);
    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                    Pattern.CASE_INSENSITIVE);

    private final StockRepository stockRepository;
    private final RawMaterialRepository rawMaterialRepository;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;
    private final SequenceNumberingService sequenceNumberingService;

    public StockParityService(StockRepository stockRepository,
                              RawMaterialRepository rawMaterialRepository,
                              OperationAccessPolicy accessPolicy,
                              ParityMapper mapper,
                              SequenceNumberingService sequenceNumberingService) {
        this.stockRepository = stockRepository;
        this.rawMaterialRepository = rawMaterialRepository;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
        this.sequenceNumberingService = sequenceNumberingService;
    }

    // ── Read ─────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getAllStock(Map<String, String> query, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        Specification<StockEntity> spec = (root, q, cb) -> cb.conjunction();
        if (companyScope != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        String search = query == null ? null : trim(query.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, q, cb) -> cb.or(
                    cb.like(cb.lower(root.get("partDescription")), pattern),
                    cb.like(cb.lower(root.get("materialGrade")), pattern),
                    cb.like(cb.lower(root.get("condition")), pattern),
                    cb.like(cb.lower(root.get("heatNumber")), pattern),
                    cb.like(cb.lower(root.get("stockId")), pattern)
            ));
        }

        return stockRepository.findAll(spec, Sort.by(Sort.Direction.DESC, "createdAt"))
                .stream().map(s -> enrichStock(mapper.toStockMap(s), s)).toList();
    }

    public Map<String, Object> getStockById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        StockEntity row = findStock(id, companyScope);
        return enrichStock(mapper.toStockMap(row), row);
    }

    public Map<String, Object> getByRawMaterialId(UUID rawMaterialId) {
        StockEntity row = stockRepository.findByRawMaterialId(rawMaterialId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Stock not found for the given raw_material_id"));
        return mapper.toStockMap(row);
    }

    public List<Map<String, Object>> getHeatNumbers(Map<String, String> query, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        UUID rawMaterialId = null;
        String rmIdStr = query == null ? null : query.get("raw_material_id");
        if (rmIdStr != null && UUID_PATTERN.matcher(rmIdStr.trim()).matches()) {
            rawMaterialId = UUID.fromString(rmIdStr.trim());
        }

        // If not provided, try resolving from parts_master_id (best-effort, skipped here — return all stock)
        List<StockEntity> stocks;
        if (rawMaterialId != null) {
            UUID rmId = rawMaterialId;
            if (companyScope != null) {
                stocks = stockRepository.findByRawMaterialIdAndQuantityGreaterThan(rmId, 0.0);
            } else {
                stocks = stockRepository.findByRawMaterialIdAndQuantityGreaterThan(rmId, 0.0);
            }
        } else {
            stocks = companyScope != null
                    ? stockRepository.findAllWithPositiveQuantityByCompanyId(companyScope)
                    : stockRepository.findAllWithPositiveQuantity();
        }

        // Deduplicate by heat_number, summing quantities
        Map<String, Map<String, Object>> heatMap = new LinkedHashMap<>();
        for (StockEntity s : stocks) {
            if (s.getHeatNumber() == null || s.getHeatNumber().isBlank()) continue;
            String key = s.getHeatNumber();
            if (heatMap.containsKey(key)) {
                Map<String, Object> entry = heatMap.get(key);
                entry.put("quantity", ((Number) entry.get("quantity")).doubleValue() + (s.getQuantity() != null ? s.getQuantity() : 0.0));
                if (entry.get("certificate_url") == null && s.getCertificateUrl() != null) {
                    entry.put("id", s.getId());
                    entry.put("stock_id", s.getStockId());
                    entry.put("certificate_url", s.getCertificateUrl());
                }
            } else {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", s.getId());
                entry.put("stock_id", s.getStockId());
                entry.put("heat_number", s.getHeatNumber());
                entry.put("quantity", s.getQuantity() != null ? s.getQuantity() : 0.0);
                entry.put("certificate_url", s.getCertificateUrl());
                heatMap.put(key, entry);
            }
        }

        return new ArrayList<>(heatMap.values());
    }

    // ── Write ────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> createStock(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        StockEntity row = buildFromPayload(payload, new StockEntity(), user);
        if (row.getPartDescription() == null || row.getPartDescription().isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST, "part_description is required");
        if (row.getMaterialGrade() == null || row.getMaterialGrade().isBlank())
            throw new ApiException(HttpStatus.BAD_REQUEST, "material_grade is required");

        row.setId(UUID.randomUUID());
        String stockId = generateStockId(user.companyId());
        row.setStockId(stockId);
        row.setCompanyId(user.companyId());
        row.setCreatedBy(user.id());
        Instant now = Instant.now();
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        // Auto-resolve raw_material_id if not provided
        if (row.getRawMaterialId() == null && row.getMaterialGrade() != null) {
            resolveRawMaterialId(row.getMaterialGrade(), user.companyId()).ifPresent(row::setRawMaterialId);
        }

        return enrichStock(mapper.toStockMap(stockRepository.save(row)), row);
    }

    @Transactional
    public List<Map<String, Object>> bulkCreateStock(List<Map<String, Object>> items, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        List<StockEntity> toSave = new ArrayList<>();
        Instant now = Instant.now();
        for (Map<String, Object> item : items) {
            StockEntity row = buildFromPayload(item, new StockEntity(), user);
            if (row.getPartDescription() == null || row.getMaterialGrade() == null)
                throw new ApiException(HttpStatus.BAD_REQUEST, "Each item requires part_description and material_grade");

            row.setId(UUID.randomUUID());
            row.setStockId(generateStockId(user.companyId()));
            row.setCompanyId(user.companyId());
            row.setCreatedBy(user.id());
            row.setCreatedAt(now);
            row.setUpdatedAt(now);

            if (row.getRawMaterialId() == null && row.getMaterialGrade() != null) {
                resolveRawMaterialId(row.getMaterialGrade(), user.companyId()).ifPresent(row::setRawMaterialId);
            }
            toSave.add(row);
        }

        return stockRepository.saveAll(toSave).stream()
                .map(s -> enrichStock(mapper.toStockMap(s), s)).toList();
    }

    @Transactional
    public Map<String, Object> updateStock(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        StockEntity row = findStock(id, companyScope);
        buildFromPayload(payload, row, user);
        row.setUpdatedAt(Instant.now());
        return enrichStock(mapper.toStockMap(stockRepository.save(row)), row);
    }

    @Transactional
    public Map<String, Object> deleteStock(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        StockEntity row = findStock(id, companyScope);
        stockRepository.delete(row);
        return Map.of("message", "Stock item deleted");
    }

    @Transactional
    public Map<String, Object> addUnused(String partDescription, String materialGrade,
                                         double unusedQty, AuthenticatedUser user) {
        UUID companyId = user.companyId();
        Optional<StockEntity> existing = companyId != null
                ? stockRepository.findFirstByPartDescriptionIgnoreCaseAndMaterialGradeIgnoreCaseAndCompanyId(partDescription, materialGrade, companyId)
                : Optional.empty();

        if (existing.isPresent()) {
            StockEntity row = existing.get();
            row.setQuantity((row.getQuantity() != null ? row.getQuantity() : 0.0) + unusedQty);
            row.setUpdatedAt(Instant.now());
            return mapper.toStockMap(stockRepository.save(row));
        }

        Instant now = Instant.now();
        StockEntity row = new StockEntity();
        row.setId(UUID.randomUUID());
        row.setStockId(generateStockId(companyId));
        row.setPartDescription(partDescription);
        row.setMaterialGrade(materialGrade);
        row.setDimension("");
        row.setQuantity(unusedQty);
        row.setCompanyId(companyId);
        row.setCreatedBy(user.id());
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        return mapper.toStockMap(stockRepository.save(row));
    }

    /** Update certificate_url on a stock item (called after file upload). */
    @Transactional
    public void updateCertificateUrl(UUID id, String certificateUrl) {
        StockEntity row = stockRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Stock not found"));
        row.setCertificateUrl(certificateUrl);
        row.setUpdatedAt(Instant.now());
        stockRepository.save(row);
    }

    public StockEntity getEntityById(UUID id) {
        return stockRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Stock not found"));
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private StockEntity findStock(UUID id, UUID companyScope) {
        StockEntity row = stockRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Stock item not found"));
        if (companyScope != null && !companyScope.equals(row.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return row;
    }

    private StockEntity buildFromPayload(Map<String, Object> data, StockEntity row, AuthenticatedUser user) {
        if (data.containsKey("part_description") && data.get("part_description") != null)
            row.setPartDescription(String.valueOf(data.get("part_description")).trim());
        if (data.containsKey("material_grade") && data.get("material_grade") != null)
            row.setMaterialGrade(String.valueOf(data.get("material_grade")).trim());
        if (data.containsKey("condition"))
            row.setCondition(trimOrNull(data.get("condition")));
        if (data.containsKey("shape"))
            row.setShape(trimOrNull(data.get("shape")));
        if (data.containsKey("dimension"))
            row.setDimension(trimOrNull(data.get("dimension")));
        if (data.containsKey("heat_number"))
            row.setHeatNumber(trimOrNull(data.get("heat_number")));
        if (data.containsKey("quantity") && data.get("quantity") != null && !String.valueOf(data.get("quantity")).isBlank()) {
            try { row.setQuantity(Double.parseDouble(String.valueOf(data.get("quantity")))); }
            catch (NumberFormatException ignored) { row.setQuantity(0.0); }
        }
        // Accept raw_material_id only if valid UUID
        if (data.containsKey("raw_material_id") && data.get("raw_material_id") != null) {
            String rmIdStr = String.valueOf(data.get("raw_material_id")).trim();
            if (UUID_PATTERN.matcher(rmIdStr).matches()) {
                row.setRawMaterialId(UUID.fromString(rmIdStr));
            }
        }
        return row;
    }

    private Map<String, Object> enrichStock(Map<String, Object> map, StockEntity row) {
        // Enrich with raw_material info if available
        if (row.getRawMaterialId() != null) {
            rawMaterialRepository.findById(row.getRawMaterialId()).ifPresent(rm -> {
                map.put("rawMaterial", Map.of("id", rm.getId(), "material_id", rm.getMaterialId() != null ? rm.getMaterialId() : ""));
            });
        }
        return map;
    }

    private Optional<UUID> resolveRawMaterialId(String materialGrade, UUID companyId) {
        Optional<RawMaterialEntity> rm = companyId != null
                ? rawMaterialRepository.findAll((root, q, cb) -> cb.and(
                        cb.equal(root.get("companyId"), companyId),
                        cb.equal(cb.lower(root.get("materialGrade")), materialGrade.toLowerCase(Locale.ROOT))
                  )).stream().findFirst()
                : Optional.empty();
        return rm.map(RawMaterialEntity::getId);
    }

    private String generateStockId(UUID companyId) {
        try {
            return sequenceNumberingService.generateNumber(SequenceNumberingService.MATERIAL_STOCK_ENTRY_ID, companyId);
        } catch (Exception e) {
            log.warn("Failed to generate stock_id: {}", e.getMessage());
            return null;
        }
    }

    private String trim(String value) {
        if (value == null) return null;
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }

    private String trimOrNull(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }
}
