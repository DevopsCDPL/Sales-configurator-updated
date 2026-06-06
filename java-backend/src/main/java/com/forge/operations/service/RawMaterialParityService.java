package com.forge.operations.service;

import com.forge.operations.entity.RawMaterialEntity;
import com.forge.operations.repository.RawMaterialRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class RawMaterialParityService {

    // ═══════════════════════════════════════════════════════════════════════
    // STATIC CATALOG DATA (mirrors rawMaterialService.js constants)
    // ═══════════════════════════════════════════════════════════════════════

    private static final Map<String, Map<String, List<String>>> CATALOG;
    private static final Map<String, Object> DENSITY_MAP;
    private static final Map<String, String> FORM_SHAPE_MAP;
    private static final List<String> FORM_OPTIONS;

    static {
        Map<String, Map<String, List<String>>> cat = new LinkedHashMap<>();
        cat.put("Stainless Steel", map(
                "17-4", List.of("Annealed", "H900", "H1025"),
                "316L", List.of("Annealed"),
                "304L", List.of("Annealed"),
                "303", List.of("Annealed"),
                "410", List.of("Annealed"),
                "420", List.of("Annealed"),
                "430", List.of("Annealed"),
                "Nitronic 50", List.of("Annealed"),
                "Nitronic 60", List.of("Annealed")
        ));
        cat.put("Carbon Steel", map(
                "1018", List.of("Cold Drawn", "Annealed"),
                "1020", List.of("Hot Rolled"),
                "1045", List.of("Normalized"),
                "A36", List.of("Hot Rolled")
        ));
        cat.put("Alloy Steel", map(
                "4140", List.of("Annealed", "Pre-Hardened", "Q&T"),
                "4340", List.of("Annealed", "Q&T"),
                "8620", List.of("Carburized")
        ));
        cat.put("Tool Steel", map(
                "D2", List.of("Annealed", "Hardened"),
                "A2", List.of("Annealed", "Hardened"),
                "H13", List.of("Annealed", "Hardened")
        ));
        cat.put("Aluminum", map(
                "6061", List.of("T6", "T651"),
                "7075", List.of("T6", "T651"),
                "2024", List.of("T4"),
                "5052", List.of("H32")
        ));
        cat.put("Copper", map(
                "C110", List.of("Annealed"),
                "C101", List.of("Annealed"),
                "C360", List.of("Free Machining"),
                "Beryllium Copper", List.of("Age Hardened")
        ));
        cat.put("Nickel Alloy", map(
                "Inconel 718", List.of("Annealed", "Age Hardened"),
                "Inconel 625", List.of("Annealed"),
                "Monel 400", List.of("Annealed"),
                "Hastelloy C276", List.of("Annealed")
        ));
        cat.put("Titanium", map(
                "Grade 2", List.of("Annealed"),
                "Grade 5", List.of("Annealed")
        ));
        cat.put("Brass", map(
                "C360", List.of("Free Machining"),
                "C260", List.of("Annealed")
        ));
        cat.put("Plastics", map(
                "Delrin", List.of("Natural"),
                "Nylon 6", List.of("General"),
                "PTFE", List.of("General"),
                "PEEK", List.of("General")
        ));
        CATALOG = Collections.unmodifiableMap(cat);

        // DENSITY_MAP — scalars per category, nested map for Plastics
        Map<String, Object> dm = new LinkedHashMap<>();
        dm.put("Carbon Steel", 7.85);
        dm.put("Alloy Steel", 7.85);
        dm.put("Tool Steel", 7.85);
        dm.put("Stainless Steel", 7.9);
        dm.put("Aluminum", 2.7);
        dm.put("Copper", 8.96);
        dm.put("Brass", 8.5);
        dm.put("Titanium", 4.5);
        dm.put("Nickel Alloy", 8.4);
        Map<String, Double> plasticDensities = new LinkedHashMap<>();
        plasticDensities.put("Delrin", 1.41);
        plasticDensities.put("Nylon 6", 1.15);
        plasticDensities.put("PTFE", 2.2);
        plasticDensities.put("PEEK", 1.32);
        dm.put("Plastics", plasticDensities);
        DENSITY_MAP = Collections.unmodifiableMap(dm);

        Map<String, String> fsm = new LinkedHashMap<>();
        fsm.put("Rod", "Round");
        fsm.put("Sheet", "Flat");
        fsm.put("Plate", "Flat");
        fsm.put("Pipe", "Hollow Round");
        fsm.put("Hex Bar", "Hex");
        fsm.put("Flat Bar", "Flat");
        fsm.put("Square Tube", "Hollow Square");
        fsm.put("Rectangular Tube", "Hollow Rectangle");
        FORM_SHAPE_MAP = Collections.unmodifiableMap(fsm);

        FORM_OPTIONS = List.of("Rod", "Plate", "Sheet", "Pipe", "Square Tube", "Rectangular Tube", "Flat Bar", "Hex Bar");
    }

    @SuppressWarnings("unchecked")
    private static <K, V> Map<K, V> map(Object... kvPairs) {
        Map<K, V> m = new LinkedHashMap<>();
        for (int i = 0; i < kvPairs.length; i += 2) {
            m.put((K) kvPairs[i], (V) kvPairs[i + 1]);
        }
        return m;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SERVICE FIELDS
    // ═══════════════════════════════════════════════════════════════════════

    private final RawMaterialRepository rawMaterialRepository;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;
    private final SequenceNumberingService sequenceNumberingService;

    public RawMaterialParityService(RawMaterialRepository rawMaterialRepository,
                                    OperationAccessPolicy accessPolicy,
                                    ParityMapper mapper,
                                    SequenceNumberingService sequenceNumberingService) {
        this.rawMaterialRepository = rawMaterialRepository;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
        this.sequenceNumberingService = sequenceNumberingService;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATIC LOOKUP METHODS
    // ═══════════════════════════════════════════════════════════════════════

    public List<String> getCategories() {
        return new ArrayList<>(CATALOG.keySet());
    }

    public List<String> getGradesForCategory(String category) {
        Map<String, List<String>> grades = CATALOG.get(category);
        return grades == null ? List.of() : new ArrayList<>(grades.keySet());
    }

    public List<String> getConditionsForGrade(String category, String grade) {
        Map<String, List<String>> grades = CATALOG.get(category);
        if (grades == null) return List.of();
        return grades.getOrDefault(grade, List.of());
    }

    public Double getDensity(String category, String grade) {
        Object d = DENSITY_MAP.get(category);
        if (d instanceof Double dbl) return dbl;
        if (d instanceof Map<?, ?> nested) {
            Object val = nested.get(grade);
            return val instanceof Double ? (Double) val : null;
        }
        return null;
    }

    public List<String> getFormOptions() {
        return FORM_OPTIONS;
    }

    public String getShapeForForm(String form) {
        return FORM_SHAPE_MAP.get(form);
    }

    public Map<String, Object> getCatalogAndDensityMap() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("catalog", CATALOG);
        result.put("densityMap", DENSITY_MAP);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD
    // ═══════════════════════════════════════════════════════════════════════

    public List<Map<String, Object>> getAll(Map<String, String> query, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        Specification<RawMaterialEntity> spec = (root, q, cb) -> cb.conjunction();
        if (companyScope != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        String search = query == null ? null : trim(query.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, q, cb) -> cb.or(
                    cb.like(cb.lower(root.get("materialId")), pattern),
                    cb.like(cb.lower(root.get("materialCategory")), pattern),
                    cb.like(cb.lower(root.get("materialGrade")), pattern),
                    cb.like(cb.lower(root.get("condition")), pattern)
            ));
        }

        if (query != null && query.get("category") != null && !"all".equals(query.get("category"))) {
            String cat = query.get("category");
            spec = spec.and((root, q, cb) -> cb.equal(root.get("materialCategory"), cat));
        }

        if (query != null) {
            String status = query.get("status");
            if ("active".equals(status)) {
                spec = spec.and((root, q, cb) -> cb.isTrue(root.get("isActive")));
            } else if ("inactive".equals(status)) {
                spec = spec.and((root, q, cb) -> cb.isFalse(root.get("isActive")));
            }
        }

        return rawMaterialRepository.findAll(spec, Sort.by(Sort.Direction.ASC, "materialId"))
                .stream().map(mapper::toRawMaterialMap).toList();
    }

    public Map<String, Object> getById(UUID id) {
        RawMaterialEntity row = rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Raw material not found"));
        return mapper.toRawMaterialMap(row);
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        String category = asString(payload.get("material_category"));
        String grade = asString(payload.get("material_grade"));
        String condition = asString(payload.get("condition"));

        validateCatalogEntry(category, grade, condition);

        Double density = getDensity(category, grade);
        if (density == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Could not determine density for this material");

        String form = trim(asString(payload.get("form")));
        String shape = form != null ? FORM_SHAPE_MAP.get(form) : null;

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        String materialId = sequenceNumberingService.generateNumber(SequenceNumberingService.RAW_MATERIAL_ID, companyId);

        Instant now = Instant.now();
        RawMaterialEntity row = new RawMaterialEntity();
        row.setId(UUID.randomUUID());
        row.setMaterialId(materialId);
        row.setMaterialCategory(category);
        row.setMaterialGrade(grade);
        row.setCondition(condition);
        row.setDensity(density);
        row.setForm(form);
        row.setShape(shape);
        row.setCostPerUnit(asDouble(payload.get("cost_per_unit"), 0.0));
        row.setCostUnit(asStringOr(payload.get("cost_unit"), "$/lb"));
        row.setDimensions(asMapObj(payload.get("dimensions")));
        row.setUnitSystem(asStringOr(payload.get("unit_system"), "imperial"));
        row.setNotes(trim(asString(payload.get("notes"))));
        row.setIsActive(true);
        row.setCompanyId(companyId);
        row.setCreatedBy(user.id());
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        return mapper.toRawMaterialMap(rawMaterialRepository.save(row));
    }

    @Transactional
    public Map<String, Object> update(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        RawMaterialEntity row = rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Raw material not found"));

        String category = payload.containsKey("material_category") ? asString(payload.get("material_category")) : row.getMaterialCategory();
        String grade = payload.containsKey("material_grade") ? asString(payload.get("material_grade")) : row.getMaterialGrade();
        String condition = payload.containsKey("condition") ? asString(payload.get("condition")) : row.getCondition();

        if (payload.containsKey("material_category") || payload.containsKey("material_grade") || payload.containsKey("condition")) {
            validateCatalogEntry(category, grade, condition);
        }

        Double density = getDensity(category, grade);
        String form = payload.containsKey("form") ? trim(asString(payload.get("form"))) : row.getForm();
        String shape = form != null ? FORM_SHAPE_MAP.getOrDefault(form, row.getShape()) : null;

        row.setMaterialCategory(category);
        row.setMaterialGrade(grade);
        row.setCondition(condition);
        row.setDensity(density != null ? density : row.getDensity());
        row.setForm(form);
        row.setShape(shape);
        if (payload.containsKey("cost_per_unit"))
            row.setCostPerUnit(asDouble(payload.get("cost_per_unit"), row.getCostPerUnit()));
        if (payload.containsKey("cost_unit"))
            row.setCostUnit(asStringOr(payload.get("cost_unit"), row.getCostUnit()));
        if (payload.containsKey("dimensions")) row.setDimensions(asMapObj(payload.get("dimensions")));
        if (payload.containsKey("unit_system"))
            row.setUnitSystem(asStringOr(payload.get("unit_system"), row.getUnitSystem()));
        if (payload.containsKey("notes")) row.setNotes(trim(asString(payload.get("notes"))));
        row.setUpdatedAt(Instant.now());

        return mapper.toRawMaterialMap(rawMaterialRepository.save(row));
    }

    @Transactional
    public Map<String, Object> delete(UUID id) {
        RawMaterialEntity row = rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Raw material not found"));
        rawMaterialRepository.delete(row);
        return Map.of("message", "Raw material deleted");
    }

    @Transactional
    public Map<String, Object> toggleStatus(UUID id) {
        RawMaterialEntity row = rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Raw material not found"));
        row.setIsActive(Boolean.FALSE.equals(row.getIsActive()));
        row.setUpdatedAt(Instant.now());
        return mapper.toRawMaterialMap(rawMaterialRepository.save(row));
    }

    @Transactional
    public Map<String, Object> bulkDelete(List<UUID> ids) {
        int deleted = rawMaterialRepository.deleteByIdIn(ids);
        return Map.of("message", "Deleted " + deleted + " raw material(s)", "count", deleted);
    }

    @Transactional
    public Map<String, Object> duplicate(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        RawMaterialEntity original = rawMaterialRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Raw material not found"));

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        String materialId = sequenceNumberingService.generateNumber(SequenceNumberingService.RAW_MATERIAL_ID, companyId);

        Instant now = Instant.now();
        RawMaterialEntity copy = new RawMaterialEntity();
        copy.setId(UUID.randomUUID());
        copy.setMaterialId(materialId);
        copy.setMaterialCategory(original.getMaterialCategory());
        copy.setMaterialGrade(original.getMaterialGrade());
        copy.setCondition(original.getCondition());
        copy.setDensity(original.getDensity());
        copy.setForm(original.getForm());
        copy.setShape(original.getShape());
        copy.setCostPerUnit(original.getCostPerUnit());
        copy.setCostUnit(original.getCostUnit());
        copy.setDimensions(original.getDimensions());
        copy.setUnitSystem(original.getUnitSystem());
        copy.setNotes(original.getNotes() != null ? "(Copy) " + original.getNotes() : "(Copy)");
        copy.setIsActive(true);
        copy.setCompanyId(companyId);
        copy.setCreatedBy(user.id());
        copy.setCreatedAt(now);
        copy.setUpdatedAt(now);

        return mapper.toRawMaterialMap(rawMaterialRepository.save(copy));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private void validateCatalogEntry(String category, String grade, String condition) {
        if (!CATALOG.containsKey(category)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid material category: " + category);
        }
        Map<String, List<String>> grades = CATALOG.get(category);
        if (!grades.containsKey(grade)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid grade \"" + grade + "\" for category \"" + category + "\"");
        }
        if (!grades.get(grade).contains(condition)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid condition \"" + condition + "\" for grade \"" + grade + "\"");
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trim(String value) {
        if (value == null) return null;
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }

    private String asStringOr(Object value, String fallback) {
        if (value == null) return fallback;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? fallback : s;
    }

    private Double asDouble(Object value, Double fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(value)); } catch (Exception e) { return fallback; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMapObj(Object value) {
        if (value instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return null;
    }
}
