package com.forge.operations.service;

import com.forge.operations.entity.MaterialEntity;
import com.forge.operations.entity.MaterialStockEntity;
import com.forge.operations.entity.MaterialVendorMappingEntity;
import com.forge.operations.entity.VendorEntity;
import com.forge.operations.repository.MaterialRepository;
import com.forge.operations.repository.MaterialStockRepository;
import com.forge.operations.repository.MaterialVendorMappingRepository;
import com.forge.operations.repository.VendorRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class MaterialParityService {

    private final MaterialRepository materialRepository;
    private final MaterialVendorMappingRepository mappingRepository;
    private final MaterialStockRepository stockRepository;
    private final VendorRepository vendorRepository;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public MaterialParityService(MaterialRepository materialRepository,
                                 MaterialVendorMappingRepository mappingRepository,
                                 MaterialStockRepository stockRepository,
                                 VendorRepository vendorRepository,
                                 OperationAccessPolicy accessPolicy,
                                 ParityMapper mapper) {
        this.materialRepository = materialRepository;
        this.mappingRepository = mappingRepository;
        this.stockRepository = stockRepository;
        this.vendorRepository = vendorRepository;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    // ── Material queries ──────────────────────────────────────────────────

    public List<Map<String, Object>> getAllMaterials(Map<String, String> query, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        Specification<MaterialEntity> spec = (root, q, cb) -> cb.conjunction();
        if (companyScope != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        String search = query == null ? null : trim(query.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, q, cb) -> cb.or(
                    cb.like(cb.lower(root.get("materialName")), pattern),
                    cb.like(cb.lower(root.get("grade")), pattern),
                    cb.like(cb.lower(root.get("form")), pattern)
            ));
        }

        if (query != null && query.get("category") != null) {
            String cat = query.get("category");
            spec = spec.and((root, q, cb) -> cb.equal(root.get("category"), cat));
        }

        if (query != null) {
            String status = query.get("status");
            if ("active".equals(status)) {
                spec = spec.and((root, q, cb) -> cb.isTrue(root.get("isActive")));
            } else if ("inactive".equals(status)) {
                spec = spec.and((root, q, cb) -> cb.isFalse(root.get("isActive")));
            }
        }

        List<MaterialEntity> rows = materialRepository.findAll(spec, Sort.by(Sort.Direction.DESC, "createdAt"));
        return rows.stream().map(this::toMaterialWithMappings).toList();
    }

    public Map<String, Object> getMaterialById(UUID id, AuthenticatedUser user) {
        MaterialEntity row = findMaterial(id, user);
        return toMaterialWithMappings(row);
    }

    public List<Map<String, Object>> getVendorMappings(UUID materialId, AuthenticatedUser user) {
        findMaterial(materialId, user); // access check
        List<MaterialVendorMappingEntity> mappings =
                mappingRepository.findByMaterialIdOrderByIsDefaultDescCreatedAtAsc(materialId);
        return mappings.stream().map(m -> {
            Map<String, Object> mMap = new LinkedHashMap<>(mapper.toMaterialVendorMappingMap(m));
            Optional<VendorEntity> vendor = vendorRepository.findByIdAndDeletedAtIsNull(m.getVendorId());
            vendor.ifPresent(v -> mMap.put("vendor", Map.of("id", v.getId(), "vendor_name", v.getVendorName())));
            return mMap;
        }).toList();
    }

    @Transactional
    public Map<String, Object> createMaterial(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        String materialName = trim(asString(payload.get("material_name")));
        if (materialName == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "material_name is required");
        }

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        Instant now = Instant.now();

        MaterialEntity row = new MaterialEntity();
        row.setId(UUID.randomUUID());
        row.setMaterialName(materialName);
        row.setCategory(asStringOr(payload.get("category"), "raw_material"));
        row.setGrade(trim(asString(payload.get("grade"))));
        row.setForm(trim(asString(payload.get("form"))));
        row.setShape(trim(asString(payload.get("shape"))));
        row.setUnit(asStringOr(payload.get("unit"), "Kg"));
        row.setDensity(asDouble(payload.get("density")));
        row.setDefaultCost(asDoubleObj(payload.get("default_cost")));
        row.setDescription(trim(asString(payload.get("description"))));
        row.setCompanyId(companyId);
        row.setCreatedBy(user.id());
        row.setIsActive(true);
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        row = materialRepository.save(row);
        saveVendorMappings(row.getId(), payload.get("vendors"));
        return toMaterialWithMappings(row);
    }

    @Transactional
    public Map<String, Object> updateMaterial(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        MaterialEntity row = findMaterial(id, user);

        if (payload.containsKey("material_name")) {
            String name = trim(asString(payload.get("material_name")));
            if (name != null) row.setMaterialName(name);
        }
        if (payload.containsKey("category") && payload.get("category") != null)
            row.setCategory(String.valueOf(payload.get("category")));
        if (payload.containsKey("grade")) row.setGrade(trim(asString(payload.get("grade"))));
        if (payload.containsKey("form")) row.setForm(trim(asString(payload.get("form"))));
        if (payload.containsKey("shape")) row.setShape(trim(asString(payload.get("shape"))));
        if (payload.containsKey("unit") && payload.get("unit") != null)
            row.setUnit(String.valueOf(payload.get("unit")));
        if (payload.containsKey("density")) row.setDensity(asDouble(payload.get("density")));
        if (payload.containsKey("default_cost"))
            row.setDefaultCost(asDoubleObj(payload.get("default_cost")));
        if (payload.containsKey("description")) row.setDescription(trim(asString(payload.get("description"))));
        row.setUpdatedAt(Instant.now());

        row = materialRepository.save(row);

        if (payload.containsKey("vendors")) {
            mappingRepository.deleteByMaterialId(id);
            saveVendorMappings(id, payload.get("vendors"));
        }

        return toMaterialWithMappings(row);
    }

    @Transactional
    public Map<String, Object> deleteMaterial(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        MaterialEntity row = findMaterial(id, user);
        mappingRepository.deleteByMaterialId(id);
        materialRepository.delete(row);
        return Map.of("message", "Material deleted");
    }

    @Transactional
    public Map<String, Object> toggleStatus(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        MaterialEntity row = findMaterial(id, user);
        row.setIsActive(Boolean.FALSE.equals(row.getIsActive()));
        row.setUpdatedAt(Instant.now());
        row = materialRepository.save(row);
        return toMaterialWithMappings(row);
    }

    // ── Stock queries ─────────────────────────────────────────────────────

    public List<Map<String, Object>> getAllStock(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<MaterialStockEntity> stocks = companyScope != null
                ? stockRepository.findByCompanyIdOrderByLastUpdatedDesc(companyScope)
                : stockRepository.findAllByOrderByLastUpdatedDesc();
        return stocks.stream().map(mapper::toMaterialStockMap).toList();
    }

    @Transactional
    public Map<String, Object> upsertStock(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        UUID materialId = asUuid(payload.get("material_id"));
        if (materialId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "material_id is required");
        }

        UUID companyId = accessPolicy.resolveCompanyScope(user);
        if (companyId == null) {
            companyId = asUuid(payload.get("company_id"));
        }

        Instant now = Instant.now();
        MaterialStockEntity stock = stockRepository.findByMaterialId(materialId)
                .orElseGet(() -> {
                    MaterialStockEntity s = new MaterialStockEntity();
                    s.setId(UUID.randomUUID());
                    s.setMaterialId(materialId);
                    s.setCreatedAt(now);
                    return s;
                });

        BigDecimal qty = asBigDecimal(payload.get("current_quantity"), BigDecimal.ZERO);
        stock.setCurrentQuantity(qty);
        stock.setUnit(asStringOr(payload.get("unit"), stock.getUnit() != null ? stock.getUnit() : "Kg"));
        stock.setCompanyId(companyId);
        stock.setLastUpdated(now);
        stock.setUpdatedAt(now);

        stock = stockRepository.save(stock);
        return mapper.toMaterialStockMap(stock);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private MaterialEntity findMaterial(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        Optional<MaterialEntity> opt = companyScope != null
                ? materialRepository.findByIdAndCompanyId(id, companyScope)
                : materialRepository.findById(id);
        return opt.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Material not found"));
    }

    private Map<String, Object> toMaterialWithMappings(MaterialEntity row) {
        Map<String, Object> data = new LinkedHashMap<>(mapper.toMaterialMap(row));
        List<MaterialVendorMappingEntity> mappings =
                mappingRepository.findByMaterialIdOrderByIsDefaultDescCreatedAtAsc(row.getId());
        List<Map<String, Object>> vendorMappings = mappings.stream().map(m -> {
            Map<String, Object> mMap = new LinkedHashMap<>(mapper.toMaterialVendorMappingMap(m));
            vendorRepository.findByIdAndDeletedAtIsNull(m.getVendorId()).ifPresent(v ->
                    mMap.put("vendor", Map.of("id", v.getId(), "vendor_name", v.getVendorName())));
            return mMap;
        }).toList();
        data.put("vendorMappings", vendorMappings);
        return data;
    }

    private void saveVendorMappings(UUID materialId, Object vendorsValue) {
        if (!(vendorsValue instanceof List<?> vendors) || vendors.isEmpty()) {
            return;
        }
        Instant now = Instant.now();
        List<MaterialVendorMappingEntity> rows = new ArrayList<>();
        for (Object raw : vendors) {
            if (!(raw instanceof Map<?, ?> mapAny)) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> vm = (Map<String, Object>) mapAny;
            UUID vendorId = asUuid(vm.get("vendor_id"));
            if (vendorId == null) continue;

            MaterialVendorMappingEntity entity = new MaterialVendorMappingEntity();
            entity.setId(UUID.randomUUID());
            entity.setMaterialId(materialId);
            entity.setVendorId(vendorId);
            entity.setPricePerUnit(asDoubleObj(vm.get("price_per_unit")));
            entity.setLeadTime(asInteger(vm.get("lead_time")));
            entity.setIsDefault(asBoolean(vm.get("is_default")));
            entity.setCreatedAt(now);
            entity.setUpdatedAt(now);
            rows.add(entity);
        }
        if (!rows.isEmpty()) {
            mappingRepository.saveAll(rows);
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trim(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String asStringOr(Object value, String fallback) {
        if (value == null) return fallback;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? fallback : s;
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

    private Double asDouble(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private Double asDoubleObj(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private BigDecimal asBigDecimal(Object value, BigDecimal fallback) {
        if (value == null) return fallback;
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private Integer asInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private boolean asBoolean(Object value) {
        if (value == null) return false;
        if (value instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(value));
    }
}
