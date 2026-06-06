package com.forge.configurator.api;

import com.forge.configurator.dto.CompileQuotationRequest;
import com.forge.configurator.dto.ConfiguratorComponentPayload;
import com.forge.configurator.dto.ConfiguratorConfigurationPayload;
import com.forge.configurator.dto.DrawingCreateRequest;
import com.forge.configurator.dto.PreviewQuotationRequest;
import com.forge.configurator.entity.*;
import com.forge.configurator.repository.*;
import com.forge.configurator.service.ConfiguratorCategoryUtils;
import com.forge.configurator.service.ConfiguratorQuotationService;
import com.forge.configurator.service.DrawingGenerationService;
import com.forge.configurator.service.MarketDataService;
import com.forge.operations.storage.R2StorageService;
import com.forge.shared.api.ApiEnvelope;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import com.forge.shared.tenant.TenantContext;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

@RestController
public class ConfiguratorController {
    private static final Set<String> ADMIN_ROLES = Set.of("main_admin", "platform_admin", "super_admin");

    private final ConfiguratorComponentRepository componentRepository;
    private final ConfiguratorComponentCategoryRepository categoryRepository;
    private final ConfiguratorConfigurationRepository configurationRepository;
    private final ConfiguratorQuotationRepository quotationRepository;
    private final ConfiguratorQuotationItemRepository quotationItemRepository;
    private final ConfiguratorQuotationService quotationService;
    private final MarketDataService marketDataService;
    private final DrawingGenerationService drawingGenerationService;
    private final DocumentRepository documentRepository;
    private final R2StorageService r2StorageService;

    public ConfiguratorController(ConfiguratorComponentRepository componentRepository,
                                  ConfiguratorComponentCategoryRepository categoryRepository,
                                  ConfiguratorConfigurationRepository configurationRepository,
                                  ConfiguratorQuotationRepository quotationRepository,
                                  ConfiguratorQuotationItemRepository quotationItemRepository,
                                  ConfiguratorQuotationService quotationService,
                                  MarketDataService marketDataService,
                                  DrawingGenerationService drawingGenerationService,
                                  DocumentRepository documentRepository,
                                  R2StorageService r2StorageService) {
        this.componentRepository = componentRepository;
        this.categoryRepository = categoryRepository;
        this.configurationRepository = configurationRepository;
        this.quotationRepository = quotationRepository;
        this.quotationItemRepository = quotationItemRepository;
        this.quotationService = quotationService;
        this.marketDataService = marketDataService;
        this.drawingGenerationService = drawingGenerationService;
        this.documentRepository = documentRepository;
        this.r2StorageService = r2StorageService;
    }

    @GetMapping({"/api/quotation/health"})
    public ResponseEntity<?> quotationHealth() {
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("status", "ok")));
    }

    @GetMapping({"/api/configurator/components", "/api/components"})
    public ResponseEntity<?> listComponents(@RequestParam(value = "skip", defaultValue = "0") int skip,
                                            @RequestParam(value = "limit", defaultValue = "100") int limit,
                                            @RequestParam(value = "subcategory", required = false) String subcategory,
                                            @RequestParam(value = "q", required = false) String q,
                                            @RequestParam(value = "category", required = false) String category,
                                            @RequestParam(value = "is_active", required = false) Boolean isActive,
                                            Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        Specification<ConfiguratorComponentEntity> spec = (root, query, cb) -> cb.conjunction();
        spec = spec.and((root, query, cb) -> cb.isNull(root.get("deletedAt")));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (subcategory != null && !subcategory.isBlank()) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("subcategory"), subcategory));
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.or(
                    cb.like(cb.lower(root.get("name")), pattern),
                    cb.like(cb.lower(root.get("partNumber")), pattern),
                    cb.like(cb.lower(root.get("description")), pattern)
            ));
        }
        if (category != null && !category.isBlank()) {
            List<String> variants = ConfiguratorCategoryUtils.expandCategory(category).stream()
                    .map(s -> s.toLowerCase(Locale.ROOT))
                    .toList();
            spec = spec.and((root, query, cb) -> cb.lower(root.get("category")).in(variants));
        }
        if (isActive != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("isActive"), isActive));
        }

        List<ConfiguratorComponentEntity> all = componentRepository.findAll(spec, Sort.by(Sort.Direction.ASC, "name"));
        Slice<ConfiguratorComponentEntity> slice = slice(all, skip, Math.min(Math.max(limit, 1), 500));

        Map<String, Object> body = ApiEnvelope.success(slice.items().stream().map(this::toComponentMap).toList());
        body.put("total", slice.total());
        return ResponseEntity.ok(body);
    }

    @GetMapping({"/api/configurator/components/stats/category-counts"})
    public ResponseEntity<?> componentCategoryCounts(Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        Specification<ConfiguratorComponentEntity> spec = (root, query, cb) -> cb.conjunction();
        spec = spec.and((root, query, cb) -> cb.isNull(root.get("deletedAt")));
        spec = spec.and((root, query, cb) -> cb.isTrue(root.get("isActive")));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        List<ConfiguratorComponentEntity> rows = componentRepository.findAll(spec);
        Map<String, Long> grouped = new TreeMap<>();
        for (ConfiguratorComponentEntity row : rows) {
            String key = row.getCategory() == null ? "" : row.getCategory();
            grouped.put(key, grouped.getOrDefault(key, 0L) + 1L);
        }

        List<Map<String, Object>> data = grouped.entrySet().stream()
                .map(e -> Map.<String, Object>of("category", e.getKey(), "count", e.getValue()))
                .toList();
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping({"/api/configurator/components/category/{category}", "/api/components/category/{category}"})
    public ResponseEntity<?> listComponentsByCategory(@PathVariable("category") String category,
                                                      @RequestParam(value = "skip", defaultValue = "0") int skip,
                                                      @RequestParam(value = "limit", defaultValue = "100") int limit,
                                                      Authentication authentication) {
        return listComponents(skip, limit, null, null, category, null, authentication);
    }

    @GetMapping({"/api/configurator/components/{id}", "/api/components/{id}"})
    public ResponseEntity<?> getComponent(@PathVariable("id") UUID id,
                                          Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);
        ConfiguratorComponentEntity row = findComponent(id, companyScope);
        return ResponseEntity.ok(ApiEnvelope.success(toComponentMap(row)));
    }

    @PostMapping({"/api/configurator/components", "/api/components"})
    public ResponseEntity<?> createComponent(@RequestBody ConfiguratorComponentPayload body,
                                             Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);

        UUID companyScope = resolveWriteCompanyScope(user);
        Instant now = Instant.now();

        ConfiguratorComponentEntity row = new ConfiguratorComponentEntity();
        row.setId(UUID.randomUUID());
        row.setPartNumber(body.partNumber());
        row.setName(body.name());
        row.setCategory(ConfiguratorCategoryUtils.canonicalDisplay(text(body.category(), "")));
        row.setSubcategory(body.subcategory());
        row.setType(body.type());
        row.setComponentType(body.componentType());
        row.setDescription(body.description());
        row.setPrice(body.price());
        row.setMaterialCost(body.materialCost());
        row.setLaborCost(body.laborCost());
        row.setMatCost(body.matCost());
        row.setLbrCu(body.lbrCu());
        row.setLbrAsm(body.lbrAsm());
        row.setLbrCnt(body.lbrCnt());
        row.setLbrQc(body.lbrQc());
        row.setLbrTst(body.lbrTst());
        row.setLbrEng(body.lbrEng());
        row.setLbrCad(body.lbrCad());
        row.setSpecifications(body.specifications() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(body.specifications()));
        row.setImageUrl(body.imageUrl());
        row.setExcelDate(body.excelDate());
        row.setComments(body.comments());
        row.setIsActive(body.isActive() == null ? true : body.isActive());
        row.setCompanyId(companyScope);
        row.setCreatedBy(user.id());
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        row = componentRepository.save(row);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(toComponentMap(row)));
    }

    @PostMapping({"/api/configurator/components/bulk"})
    public ResponseEntity<?> bulkCreateComponents(@RequestBody Object body,
                                                  Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);
        UUID companyScope = resolveWriteCompanyScope(user);

        List<Map<String, Object>> items = new ArrayList<>();
        if (body instanceof List<?> list) {
            for (Object obj : list) {
                if (obj instanceof Map<?, ?> mapAny) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> map = (Map<String, Object>) mapAny;
                    items.add(map);
                }
            }
        } else if (body instanceof Map<?, ?> mapAny) {
            Object rawItems = mapAny.get("items");
            if (rawItems instanceof List<?> list) {
                for (Object obj : list) {
                    if (obj instanceof Map<?, ?> itemMapAny) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = (Map<String, Object>) itemMapAny;
                        items.add(map);
                    }
                }
            }
        }

        if (items.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "Body must be an array (or { items: [...] })");
        }

        Instant now = Instant.now();
        List<Map<String, Object>> created = new ArrayList<>();
        for (Map<String, Object> item : items) {
            ConfiguratorComponentEntity row = new ConfiguratorComponentEntity();
            row.setId(UUID.randomUUID());
            row.setPartNumber(text(item.get("part_number"), null));
            row.setName(text(item.get("name"), null));
            row.setCategory(ConfiguratorCategoryUtils.canonicalDisplay(text(item.get("category"), "")));
            row.setSubcategory(text(item.get("subcategory"), null));
            row.setType(text(item.get("type"), null));
            row.setComponentType(text(item.get("component_type"), null));
            row.setDescription(text(item.get("description"), null));
            row.setPrice(decimal(item.get("price")));
            row.setMaterialCost(decimal(item.get("material_cost")));
            row.setLaborCost(decimal(item.get("labor_cost")));
            row.setMatCost(decimal(item.get("mat_cost")));
            row.setLbrCu(decimal(item.get("lbr_cu")));
            row.setLbrAsm(decimal(item.get("lbr_asm")));
            row.setLbrCnt(decimal(item.get("lbr_cnt")));
            row.setLbrQc(decimal(item.get("lbr_qc")));
            row.setLbrTst(decimal(item.get("lbr_tst")));
            row.setLbrEng(decimal(item.get("lbr_eng")));
            row.setLbrCad(decimal(item.get("lbr_cad")));
            row.setSpecifications(map(item.get("specifications")));
            row.setImageUrl(text(item.get("image_url"), null));
            row.setExcelDate(text(item.get("excel_date"), null));
            row.setComments(text(item.get("comments"), null));
            row.setIsActive(item.containsKey("is_active") ? bool(item.get("is_active"), true) : true);
            row.setCompanyId(companyScope);
            row.setCreatedBy(user.id());
            row.setCreatedAt(now);
            row.setUpdatedAt(now);
            created.add(toComponentMap(componentRepository.save(row)));
        }

        Map<String, Object> response = ApiEnvelope.success(created);
        response.put("count", created.size());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping({"/api/configurator/components/{id}", "/api/components/{id}"})
    public ResponseEntity<?> updateComponent(@PathVariable("id") UUID id,
                                             @RequestBody Map<String, Object> body,
                                             Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorComponentEntity row = findComponent(id, companyScope);
        if (body.containsKey("part_number")) row.setPartNumber(text(body.get("part_number"), null));
        if (body.containsKey("name")) row.setName(text(body.get("name"), null));
        if (body.containsKey("category")) row.setCategory(ConfiguratorCategoryUtils.canonicalDisplay(text(body.get("category"), "")));
        if (body.containsKey("subcategory")) row.setSubcategory(text(body.get("subcategory"), null));
        if (body.containsKey("type")) row.setType(text(body.get("type"), null));
        if (body.containsKey("component_type")) row.setComponentType(text(body.get("component_type"), null));
        if (body.containsKey("description")) row.setDescription(text(body.get("description"), null));
        if (body.containsKey("price")) row.setPrice(decimal(body.get("price")));
        if (body.containsKey("material_cost")) row.setMaterialCost(decimal(body.get("material_cost")));
        if (body.containsKey("labor_cost")) row.setLaborCost(decimal(body.get("labor_cost")));
        if (body.containsKey("mat_cost")) row.setMatCost(decimal(body.get("mat_cost")));
        if (body.containsKey("lbr_cu")) row.setLbrCu(decimal(body.get("lbr_cu")));
        if (body.containsKey("lbr_asm")) row.setLbrAsm(decimal(body.get("lbr_asm")));
        if (body.containsKey("lbr_cnt")) row.setLbrCnt(decimal(body.get("lbr_cnt")));
        if (body.containsKey("lbr_qc")) row.setLbrQc(decimal(body.get("lbr_qc")));
        if (body.containsKey("lbr_tst")) row.setLbrTst(decimal(body.get("lbr_tst")));
        if (body.containsKey("lbr_eng")) row.setLbrEng(decimal(body.get("lbr_eng")));
        if (body.containsKey("lbr_cad")) row.setLbrCad(decimal(body.get("lbr_cad")));
        if (body.containsKey("specifications")) row.setSpecifications(map(body.get("specifications")));
        if (body.containsKey("image_url")) row.setImageUrl(text(body.get("image_url"), null));
        if (body.containsKey("excel_date")) row.setExcelDate(text(body.get("excel_date"), null));
        if (body.containsKey("comments")) row.setComments(text(body.get("comments"), null));
        if (body.containsKey("is_active")) row.setIsActive(bool(body.get("is_active"), true));
        row.setUpdatedAt(Instant.now());

        row = componentRepository.save(row);
        return ResponseEntity.ok(ApiEnvelope.success(toComponentMap(row)));
    }

    @DeleteMapping({"/api/configurator/components/{id}", "/api/components/{id}"})
    public ResponseEntity<?> deleteComponent(@PathVariable("id") UUID id,
                                             Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorComponentEntity row = findComponent(id, companyScope);
        row.setDeletedAt(Instant.now());
        row.setDeletedBy(user.id());
        row.setUpdatedAt(Instant.now());
        componentRepository.save(row);

        return ResponseEntity.ok(ApiEnvelope.success(Map.of("id", id, "deleted", true)));
    }

    @GetMapping({"/api/configurator/categories", "/api/categories"})
    public ResponseEntity<?> listCategories(Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        List<ConfiguratorComponentCategoryEntity> rows;
        if (companyScope == null) {
            rows = categoryRepository.findAll(Sort.by(Sort.Direction.ASC, "name"));
        } else {
            rows = categoryRepository.findByCompanyIdOrderByNameAsc(companyScope);
        }

        List<Map<String, Object>> data = rows.stream()
                .filter(row -> row.getDeletedAt() == null)
                .map(this::toCategoryMap)
                .toList();

        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PostMapping({"/api/configurator/categories/upsert", "/api/categories/upsert"})
    public ResponseEntity<?> upsertCategory(@RequestBody Map<String, Object> body,
                                            Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);
        UUID companyScope = resolveWriteCompanyScope(user);

        String name = ConfiguratorCategoryUtils.canonicalDisplay(text(body.get("name"), ""));
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "name is required");
        }

        String normalized = name.toLowerCase(Locale.ROOT).trim();
        ConfiguratorComponentCategoryEntity row = categoryRepository.findByNormalizedNameAndCompanyId(normalized, companyScope)
                .orElseGet(() -> {
                    ConfiguratorComponentCategoryEntity created = new ConfiguratorComponentCategoryEntity();
                    created.setId(UUID.randomUUID());
                    created.setName(name);
                    created.setNormalizedName(normalized);
                    created.setDisplayOrder(integer(body.get("display_order"), 0));
                    created.setIsActive(true);
                    created.setCompanyId(companyScope);
                    created.setCreatedBy(user.id());
                    created.setCreatedAt(Instant.now());
                    return created;
                });

        row.setUpdatedAt(Instant.now());
        row = categoryRepository.save(row);
        return ResponseEntity.ok(ApiEnvelope.success(toCategoryMap(row)));
    }

    @PostMapping({"/api/configurator/categories/rebuild", "/api/categories/rebuild"})
    public ResponseEntity<?> rebuildCategories(Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        requireAdmin(user);
        UUID companyScope = resolveWriteCompanyScope(user);

        Specification<ConfiguratorComponentEntity> spec = (root, query, cb) -> cb.conjunction();
        spec = spec.and((root, query, cb) -> cb.isNull(root.get("deletedAt")));
        spec = spec.and((root, query, cb) -> cb.isNotNull(root.get("category")));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        List<ConfiguratorComponentEntity> distinct = componentRepository.findAll(spec);
        Set<String> categoryNames = new LinkedHashSet<>();
        for (ConfiguratorComponentEntity row : distinct) {
            String normalized = ConfiguratorCategoryUtils.canonicalDisplay(row.getCategory());
            if (!normalized.isBlank()) {
                categoryNames.add(normalized);
            }
        }

        int created = 0;
        for (String category : categoryNames) {
            String normalized = category.toLowerCase(Locale.ROOT).trim();
            if (categoryRepository.findByNormalizedNameAndCompanyId(normalized, companyScope).isPresent()) {
                continue;
            }
            ConfiguratorComponentCategoryEntity row = new ConfiguratorComponentCategoryEntity();
            row.setId(UUID.randomUUID());
            row.setName(category);
            row.setNormalizedName(normalized);
            row.setDisplayOrder(0);
            row.setIsActive(true);
            row.setCompanyId(companyScope);
            row.setCreatedBy(user.id());
            row.setCreatedAt(Instant.now());
            row.setUpdatedAt(Instant.now());
            categoryRepository.save(row);
            created++;
        }

        return ResponseEntity.ok(ApiEnvelope.success(Map.of("rebuilt", categoryNames.size(), "created", created)));
    }

    @GetMapping({"/api/configurator/configurations", "/api/configs"})
    public ResponseEntity<?> listConfigurations(@RequestParam(value = "skip", defaultValue = "0") int skip,
                                                @RequestParam(value = "limit", defaultValue = "50") int limit,
                                                @RequestParam(value = "project_id", required = false) UUID projectId,
                                                @RequestParam(value = "q", required = false) String q,
                                                Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        Specification<ConfiguratorConfigurationEntity> spec = (root, query, cb) -> cb.conjunction();
        spec = spec.and((root, query, cb) -> cb.isNull(root.get("deletedAt")));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (projectId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("projectId"), projectId));
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("name")), pattern));
        }

        List<ConfiguratorConfigurationEntity> all = configurationRepository.findAll(
                spec,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );
        Slice<ConfiguratorConfigurationEntity> slice = slice(all, skip, Math.min(Math.max(limit, 1), 500));

        Map<String, Object> body = ApiEnvelope.success(slice.items().stream().map(this::toConfigurationMap).toList());
        body.put("total", slice.total());
        return ResponseEntity.ok(body);
    }

    @GetMapping({"/api/configurator/configurations/{id}", "/api/configs/{id}"})
    public ResponseEntity<?> getConfiguration(@PathVariable("id") UUID id,
                                              Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);
        ConfiguratorConfigurationEntity row = findConfiguration(id, companyScope);
        return ResponseEntity.ok(ApiEnvelope.success(toConfigurationMap(row)));
    }

    @PostMapping({"/api/configurator/configurations", "/api/configs"})
    public ResponseEntity<?> createConfiguration(@RequestBody ConfiguratorConfigurationPayload body,
                                                 Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);

        String name = text(body.name(), "");
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "name is required");
        }

        Instant now = Instant.now();
        ConfiguratorConfigurationEntity row = new ConfiguratorConfigurationEntity();
        row.setId(UUID.randomUUID());
        row.setCode(text(body.code(), defaultConfigurationCode()));
        row.setName(name);
        row.setDescription(text(body.description(), null));
        row.setProjectId(body.projectId());
        row.setUserId(user.id());
        row.setConfigData(body.configData() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(body.configData()));
        row.setActiveStep(text(body.activeStep(), "system_design"));
        row.setProgressPct(body.progressPct() == null ? 0 : body.progressPct());
        row.setIsTemplate(body.isTemplate() != null && body.isTemplate());
        row.setIsDraft(body.isDraft() == null ? true : body.isDraft());
        row.setCompanyId(companyScope);
        row.setCreatedBy(user.id());
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        row = configurationRepository.save(row);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(toConfigurationMap(row)));
    }

    @PutMapping({"/api/configurator/configurations/{id}", "/api/configs/{id}"})
    public ResponseEntity<?> updateConfiguration(@PathVariable("id") UUID id,
                                                 @RequestBody Map<String, Object> body,
                                                 Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorConfigurationEntity row = findConfiguration(id, companyScope);
        if (body.containsKey("name")) row.setName(text(body.get("name"), row.getName()));
        if (body.containsKey("description")) row.setDescription(text(body.get("description"), null));
        if (body.containsKey("project_id")) row.setProjectId(uuid(body.get("project_id")));
        if (body.containsKey("config_data")) row.setConfigData(map(body.get("config_data")));
        if (body.containsKey("active_step")) row.setActiveStep(text(body.get("active_step"), row.getActiveStep()));
        if (body.containsKey("progress_pct")) row.setProgressPct(integer(body.get("progress_pct"), row.getProgressPct() == null ? 0 : row.getProgressPct()));
        if (body.containsKey("is_template")) row.setIsTemplate(bool(body.get("is_template"), false));
        if (body.containsKey("is_draft")) row.setIsDraft(bool(body.get("is_draft"), true));
        row.setUpdatedAt(Instant.now());

        row = configurationRepository.save(row);
        return ResponseEntity.ok(ApiEnvelope.success(toConfigurationMap(row)));
    }

    @DeleteMapping({"/api/configurator/configurations/{id}", "/api/configs/{id}"})
    public ResponseEntity<?> deleteConfiguration(@PathVariable("id") UUID id,
                                                 Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorConfigurationEntity row = findConfiguration(id, companyScope);
        row.setDeletedAt(Instant.now());
        row.setDeletedBy(user.id());
        row.setUpdatedAt(Instant.now());
        configurationRepository.save(row);

        return ResponseEntity.ok(ApiEnvelope.success(Map.of("id", id, "deleted", true)));
    }

    @PostMapping({"/api/configurator/preview", "/api/configurator/configurations/{id}/preview", "/api/quotation/preview"})
    public ResponseEntity<?> previewQuotation(@PathVariable(value = "id", required = false) UUID pathId,
                                              @RequestBody(required = false) PreviewQuotationRequest request,
                                              Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        UUID configurationId = pathId;
        Map<String, Object> overrides = Map.of();
        if (request != null) {
            if (request.configurationId() != null) {
                configurationId = request.configurationId();
            }
            if (request.overrides() != null) {
                overrides = request.overrides();
            }
        }

        if (configurationId == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "configuration_id is required");
        }

        Map<String, Object> compiled = quotationService.previewQuotation(configurationId, overrides, companyScope);
        return ResponseEntity.ok(ApiEnvelope.success(compiled));
    }

    @PostMapping({"/api/configurator/compile", "/api/configurator/configurations/{id}/compile", "/api/quotation/compile"})
    public ResponseEntity<?> compileQuotation(@PathVariable(value = "id", required = false) UUID pathId,
                                              @RequestBody(required = false) CompileQuotationRequest request,
                                              Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        UUID configurationId = pathId;
        Map<String, Object> overrides = Map.of();
        boolean generatePdf = true;
        String customer = null;

        if (request != null) {
            if (request.configurationId() != null) {
                configurationId = request.configurationId();
            }
            if (request.overrides() != null) {
                overrides = request.overrides();
            }
            if (request.generatePdf() != null) {
                generatePdf = request.generatePdf();
            }
            customer = request.customer();
        }

        if (configurationId == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "configuration_id is required");
        }

        ConfiguratorQuotationService.CompilePersistResult result = quotationService.compileAndPersistQuotation(
                configurationId,
                overrides,
                companyScope,
                user.id(),
                generatePdf,
                customer
        );

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("quotation", result.quotation());
        data.put("items", result.items());
        data.put("bom_items", result.bomItems());
        data.put("labour_lines", result.labourLines());
        data.put("pdf", result.pdf());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiEnvelope.success(data));
    }

    @GetMapping({"/api/configurator/quotations", "/api/quotation"})
    public ResponseEntity<?> listQuotations(@RequestParam(value = "skip", defaultValue = "0") int skip,
                                            @RequestParam(value = "limit", defaultValue = "100") int limit,
                                            @RequestParam(value = "q", required = false) String q,
                                            @RequestParam(value = "year", required = false) Integer year,
                                            @RequestParam(value = "customer", required = false) String customer,
                                            @RequestParam(value = "sold", required = false) Boolean sold,
                                            @RequestParam(value = "configuration_id", required = false) UUID configurationId,
                                            @RequestParam(value = "project_id", required = false) UUID projectId,
                                            Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        Specification<ConfiguratorQuotationEntity> spec = (root, query, cb) -> cb.conjunction();
        spec = spec.and((root, query, cb) -> cb.isNull(root.get("deletedAt")));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (configurationId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("configurationId"), configurationId));
        }
        if (projectId != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("projectId"), projectId));
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.or(
                    cb.like(cb.lower(root.get("customerName")), pattern),
                    cb.like(cb.lower(root.get("quotationNumber")), pattern)
            ));
        }
        if (year != null) {
            Instant start = LocalDate.of(year, 1, 1).atStartOfDay().toInstant(ZoneOffset.UTC);
            Instant end = LocalDate.of(year + 1, 1, 1).atStartOfDay().toInstant(ZoneOffset.UTC);
            spec = spec.and((root, query, cb) -> cb.and(
                    cb.greaterThanOrEqualTo(root.get("createdAt"), start),
                    cb.lessThan(root.get("createdAt"), end)
            ));
        }
        if (customer != null && !customer.isBlank()) {
            String pattern = "%" + customer.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("customerName")), pattern));
        }
        if (sold != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("sold"), sold));
        }

        List<ConfiguratorQuotationEntity> all = quotationRepository.findAll(spec, Sort.by(Sort.Direction.DESC, "createdAt"));
        Slice<ConfiguratorQuotationEntity> slice = slice(all, skip, Math.min(Math.max(limit, 1), 500));

        Map<String, Object> body = ApiEnvelope.success(slice.items().stream().map(this::toQuotationMap).toList());
        body.put("total", slice.total());
        return ResponseEntity.ok(body);
    }

    @GetMapping({"/api/configurator/quotations/{id}", "/api/quotation/{id}"})
    public ResponseEntity<?> getQuotation(@PathVariable("id") UUID id,
                                          Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorQuotationEntity quotation = findQuotation(id, companyScope);
        List<Map<String, Object>> items = quotationItemRepository.findByQuotationIdOrderByLineNoAsc(id)
                .stream()
                .map(this::toQuotationItemMap)
                .toList();

        Map<String, Object> payload = toQuotationMap(quotation);
        payload.put("items", items);
        return ResponseEntity.ok(ApiEnvelope.success(payload));
    }

    @DeleteMapping({"/api/configurator/quotations/{id}", "/api/quotation/{id}"})
    public ResponseEntity<?> deleteQuotation(@PathVariable("id") UUID id,
                                             Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorQuotationEntity quotation = findQuotation(id, companyScope);
        quotation.setDeletedAt(Instant.now());
        quotation.setDeletedBy(user.id());
        quotation.setUpdatedAt(Instant.now());
        quotationRepository.save(quotation);
        return ResponseEntity.ok(ApiEnvelope.success(Map.of("id", id, "deleted", true)));
    }

    @PostMapping({"/api/configurator/quotations/{id}/mark-sold", "/api/quotation/{id}/mark-sold"})
    public ResponseEntity<?> markQuotationSold(@PathVariable("id") UUID id,
                                               Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);
        return ResponseEntity.ok(ApiEnvelope.success(quotationService.markQuotationSold(id, companyScope)));
    }

    @GetMapping({"/api/configurator/quotations/{id}/pdf", "/api/quotation/{id}/pdf"})
    public ResponseEntity<?> getQuotationPdf(@PathVariable("id") UUID id,
                                             Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);

        ConfiguratorQuotationEntity quotation = findQuotation(id, companyScope);
        if (quotation.getPdfDocumentId() == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No PDF generated yet — POST to /pdf to create one");
        }

        DocumentEntity document = documentRepository.findById(quotation.getPdfDocumentId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PDF document missing"));

        String safeFileName = document.getFileName() == null ? "quotation.pdf" : document.getFileName();

        // Prefer local file if it exists
        if (document.getFilePath() != null) {
            try {
                Path file = Path.of(document.getFilePath());
                if (Files.exists(file)) {
                    byte[] bytes = Files.readAllBytes(file);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CONTENT_DISPOSITION,
                                    ContentDisposition.attachment().filename(safeFileName).build().toString())
                            .contentType(MediaType.APPLICATION_PDF)
                            .body(bytes);
                }
            } catch (Exception ignored) {
            }
        }

        // Fall back to R2 download
        if (document.getR2Url() != null && r2StorageService.isConfigured()) {
            try {
                R2StorageService.DownloadedObject obj = r2StorageService.download(document.getR2Url());
                return ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_DISPOSITION,
                                ContentDisposition.attachment().filename(safeFileName).build().toString())
                        .contentType(MediaType.APPLICATION_PDF)
                        .body(obj.buffer());
            } catch (Exception ex) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "Failed to retrieve PDF from storage: " + ex.getMessage());
            }
        }

        return ResponseEntity.ok(ApiEnvelope.success(toDocumentMap(document)));
    }

    @PostMapping({"/api/configurator/quotations/{id}/pdf", "/api/quotation/{id}/pdf"})
    public ResponseEntity<?> regeneratePdf(@PathVariable("id") UUID id,
                                           Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveCompanyScope(user);
        return ResponseEntity.ok(ApiEnvelope.success(quotationService.regenerateQuotationPdf(id, companyScope, user.id())));
    }

    @GetMapping({"/api/configurator/system-parameters", "/api/quotation/system-parameters"})
    public ResponseEntity<?> getSystemParameters(Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);
        Map<String, Object> data = quotationService.getOrCreateSystemParameters(user.id(), companyScope);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PutMapping({"/api/configurator/system-parameters", "/api/quotation/system-parameters"})
    public ResponseEntity<?> setSystemParameters(@RequestBody Map<String, Object> body,
                                                 Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);
        Map<String, Object> data = quotationService.setSystemParameters(user.id(), companyScope, body);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping({"/api/configurator/system-sections/{n}", "/api/quotation/system-sections/{n}"})
    public ResponseEntity<?> getSystemSection(@PathVariable("n") Integer n,
                                              Authentication authentication) {
        if (n == null || n < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "n must be >= 1");
        }
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);
        Map<String, Object> data = quotationService.getSystemSection(user.id(), companyScope, n);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @PutMapping({"/api/configurator/system-sections/{n}", "/api/quotation/system-sections/{n}"})
    public ResponseEntity<?> setSystemSection(@PathVariable("n") Integer n,
                                              @RequestBody Map<String, Object> body,
                                              Authentication authentication) {
        if (n == null || n < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "n must be >= 1");
        }
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);
        Map<String, Object> data = quotationService.setSystemSection(user.id(), companyScope, n, body);
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping({"/api/configurator/market/copper", "/api/market/copper"})
    public ResponseEntity<?> getCopperPrice(@RequestParam(value = "date", required = false) String date,
                                            Authentication authentication) {
        AuthenticatedUser user = requirePrincipal(authentication);
        UUID companyScope = resolveWriteCompanyScope(user);

        Map<String, Object> data;
        if (date != null && !date.isBlank()) {
            data = marketDataService.getCopperPriceForDate(date, companyScope);
            if (data == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "No snapshot for " + date);
            }
        } else {
            data = marketDataService.getCopperPrice(companyScope);
        }
        return ResponseEntity.ok(ApiEnvelope.success(data));
    }

    @GetMapping({"/api/configurator/drawing-generation/health", "/api/solidworks/health"})
    public ResponseEntity<?> drawingHealth(Authentication authentication) {
        requirePrincipal(authentication);
        DrawingGenerationService.DrawingResponse response = drawingGenerationService.health();
        return drawingResponse(response);
    }

    @PostMapping({"/api/configurator/drawing-generation/create", "/api/solidworks/create"})
    public ResponseEntity<?> drawingCreate(@Valid @RequestBody DrawingCreateRequest request,
                                           Authentication authentication) {
        requirePrincipal(authentication);
        DrawingGenerationService.DrawingResponse response = drawingGenerationService.createDrawing(
                request.folderName(),
                request.panelCount(),
                request.circuitBreakerBrand()
        );
        return drawingResponse(response);
    }

    @GetMapping({"/api/configurator/drawing-generation/jobs", "/api/solidworks/jobs"})
    public ResponseEntity<?> drawingListJobs(Authentication authentication) {
        requirePrincipal(authentication);
        return drawingResponse(drawingGenerationService.listJobs());
    }

    @GetMapping({"/api/configurator/drawing-generation/jobs/{jobId}", "/api/solidworks/jobs/{jobId}"})
    public ResponseEntity<?> drawingGetJob(@PathVariable("jobId") String jobId,
                                           Authentication authentication) {
        requirePrincipal(authentication);
        return drawingResponse(drawingGenerationService.getJob(jobId));
    }

    @GetMapping({"/api/configurator/drawing-generation/jobs/{jobId}/files", "/api/solidworks/jobs/{jobId}/files"})
    public ResponseEntity<?> drawingListFiles(@PathVariable("jobId") String jobId,
                                              Authentication authentication) {
        requirePrincipal(authentication);
        return drawingResponse(drawingGenerationService.listJobFiles(jobId));
    }

    @GetMapping({"/api/configurator/drawing-generation/jobs/{jobId}/download", "/api/solidworks/jobs/{jobId}/download"})
    public ResponseEntity<?> drawingDownload(@PathVariable("jobId") String jobId,
                                             @RequestParam(value = "file", required = false) String file,
                                             Authentication authentication) {
        requirePrincipal(authentication);
        if (file == null || file.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "file query param required");
        }

        DrawingGenerationService.DrawingResponse response = drawingGenerationService.downloadJobFile(jobId, file);
        if (response.bytes() != null) {
            return ResponseEntity.status(response.status())
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file + "\"")
                    .contentType(MediaType.parseMediaType(response.contentType()))
                    .body(response.bytes());
        }
        return drawingResponse(response);
    }

    private ResponseEntity<?> drawingResponse(DrawingGenerationService.DrawingResponse response) {
        if (response.error() != null) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", false);
            body.put("error", response.error());
            body.put("fallback", response.fallback());
            return ResponseEntity.status(response.status()).body(body);
        }

        if (response.body() instanceof Map<?, ?> mapAny) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", response.ok());
            for (Map.Entry<?, ?> entry : mapAny.entrySet()) {
                body.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return ResponseEntity.status(response.status()).body(body);
        }

        if (response.body() instanceof String text) {
            return ResponseEntity.status(response.status())
                    .contentType(MediaType.parseMediaType(response.contentType()))
                    .body(text);
        }

        return ResponseEntity.status(response.status()).body(Map.of("success", response.ok()));
    }

    private AuthenticatedUser requirePrincipal(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return principal;
    }

    private void requireAdmin(AuthenticatedUser user) {
        if (!ADMIN_ROLES.contains(user.role())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Admin role required for this action.");
        }
    }

    private UUID resolveCompanyScope(AuthenticatedUser user) {
        TenantContext.State state = TenantContext.get();
        if (state != null) {
            if (state.companyId() != null) {
                return state.companyId();
            }
            if (state.platformAdmin()) {
                return null;
            }
        }
        return user.companyId();
    }

    private UUID resolveWriteCompanyScope(AuthenticatedUser user) {
        UUID companyScope = resolveCompanyScope(user);
        if (companyScope == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Platform admin must provide x-active-company-id for write operations.");
        }
        return companyScope;
    }

    private ConfiguratorComponentEntity findComponent(UUID id, UUID companyScope) {
        ConfiguratorComponentEntity row = componentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Component not found"));
        if (row.getDeletedAt() != null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Component not found");
        }
        if (companyScope != null && !Objects.equals(companyScope, row.getCompanyId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Component not found");
        }
        return row;
    }

    private ConfiguratorConfigurationEntity findConfiguration(UUID id, UUID companyScope) {
        Optional<ConfiguratorConfigurationEntity> row = companyScope == null
                ? configurationRepository.findById(id)
                : configurationRepository.findByIdAndCompanyId(id, companyScope);
        ConfiguratorConfigurationEntity value = row
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Configuration not found"));
        if (value.getDeletedAt() != null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Configuration not found");
        }
        return value;
    }

    private ConfiguratorQuotationEntity findQuotation(UUID id, UUID companyScope) {
        Optional<ConfiguratorQuotationEntity> row = companyScope == null
                ? quotationRepository.findById(id)
                : quotationRepository.findByIdAndCompanyId(id, companyScope);
        ConfiguratorQuotationEntity value = row
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quotation not found"));
        if (value.getDeletedAt() != null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Quotation not found");
        }
        return value;
    }

    private Map<String, Object> toComponentMap(ConfiguratorComponentEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("part_number", row.getPartNumber());
        map.put("name", row.getName());
        map.put("category", row.getCategory());
        map.put("subcategory", row.getSubcategory());
        map.put("type", row.getType());
        map.put("component_type", row.getComponentType());
        map.put("description", row.getDescription());
        map.put("price", row.getPrice());
        map.put("material_cost", row.getMaterialCost());
        map.put("labor_cost", row.getLaborCost());
        map.put("mat_cost", row.getMatCost());
        map.put("lbr_cu", row.getLbrCu());
        map.put("lbr_asm", row.getLbrAsm());
        map.put("lbr_cnt", row.getLbrCnt());
        map.put("lbr_qc", row.getLbrQc());
        map.put("lbr_tst", row.getLbrTst());
        map.put("lbr_eng", row.getLbrEng());
        map.put("lbr_cad", row.getLbrCad());
        map.put("specifications", row.getSpecifications());
        map.put("image_url", row.getImageUrl());
        map.put("excel_date", row.getExcelDate());
        map.put("comments", row.getComments());
        map.put("is_active", row.getIsActive());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toCategoryMap(ConfiguratorComponentCategoryEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("name", row.getName());
        map.put("normalized_name", row.getNormalizedName());
        map.put("display_order", row.getDisplayOrder());
        map.put("is_active", row.getIsActive());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toConfigurationMap(ConfiguratorConfigurationEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("code", row.getCode());
        map.put("name", row.getName());
        map.put("description", row.getDescription());
        map.put("project_id", row.getProjectId());
        map.put("user_id", row.getUserId());
        map.put("config_data", row.getConfigData());
        map.put("active_step", row.getActiveStep());
        map.put("progress_pct", row.getProgressPct());
        map.put("is_template", row.getIsTemplate());
        map.put("is_draft", row.getIsDraft());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toQuotationMap(ConfiguratorQuotationEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("quotation_number", row.getQuotationNumber());
        map.put("project_id", row.getProjectId());
        map.put("configuration_id", row.getConfigurationId());
        map.put("customer_name", row.getCustomerName());
        map.put("issued_at", row.getIssuedAt());
        map.put("valid_until", row.getValidUntil());
        map.put("status", row.getStatus());
        map.put("sold", row.getSold());
        map.put("subtotal", row.getSubtotal());
        map.put("labour_total", row.getLabourTotal());
        map.put("material_total", row.getMaterialTotal());
        map.put("overhead_total", row.getOverheadTotal());
        map.put("margin_pct", row.getMarginPct());
        map.put("margin_total", row.getMarginTotal());
        map.put("tax_total", row.getTaxTotal());
        map.put("grand_total", row.getGrandTotal());
        map.put("currency", row.getCurrency());
        map.put("bom_spec", row.getBomSpec());
        map.put("pricing_spec", row.getPricingSpec());
        map.put("terms", row.getTerms());
        map.put("notes", row.getNotes());
        map.put("pdf_document_id", row.getPdfDocumentId());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toQuotationItemMap(ConfiguratorQuotationItemEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("quotation_id", row.getQuotationId());
        map.put("component_id", row.getComponentId());
        map.put("line_no", row.getLineNo());
        map.put("step_key", row.getStepKey());
        map.put("category", row.getCategory());
        map.put("part_number", row.getPartNumber());
        map.put("description", row.getDescription());
        map.put("quantity", row.getQuantity());
        map.put("unit", row.getUnit());
        map.put("unit_price", row.getUnitPrice());
        map.put("line_total", row.getLineTotal());
        map.put("meta", row.getMeta());
        map.put("company_id", row.getCompanyId());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toDocumentMap(DocumentEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("project_id", row.getProjectId());
        map.put("module_type", row.getModuleType());
        map.put("reference_id", row.getReferenceId());
        map.put("document_type", row.getDocumentType());
        map.put("description", row.getDescription());
        map.put("size", row.getSize());
        map.put("version", row.getVersion());
        map.put("file_path", row.getFilePath());
        map.put("file_name", row.getFileName());
        map.put("status", row.getStatus());
        map.put("file_type", row.getFileType());
        map.put("uploaded_by", row.getUploadedBy());
        map.put("generated_by", row.getGeneratedBy());
        map.put("generated_at", row.getGeneratedAt());
        map.put("company_id", row.getCompanyId());
        map.put("r2_url", row.getR2Url());
        map.put("part_id", row.getPartId());
        map.put("workflow_stage", row.getWorkflowStage());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    private UUID uuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID u) {
            return u;
        }
        try {
            return UUID.fromString(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private String text(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value);
        return text.isBlank() ? fallback : text;
    }

    private int integer(Object value, int fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private java.math.BigDecimal decimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof java.math.BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return java.math.BigDecimal.valueOf(number.doubleValue());
        }
        try {
            return java.math.BigDecimal.valueOf(Double.parseDouble(String.valueOf(value)));
        } catch (Exception ex) {
            return null;
        }
    }

    private boolean bool(Object value, boolean fallback) {
        if (value == null) {
            return fallback;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        String text = String.valueOf(value).toLowerCase(Locale.ROOT);
        if ("true".equals(text) || "1".equals(text)) {
            return true;
        }
        if ("false".equals(text) || "0".equals(text)) {
            return false;
        }
        return fallback;
    }

    private Map<String, Object> map(Object value) {
        if (!(value instanceof Map<?, ?> mapAny)) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> map = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : mapAny.entrySet()) {
            map.put(String.valueOf(entry.getKey()), entry.getValue());
        }
        return map;
    }

    private String defaultConfigurationCode() {
        String value = String.valueOf(System.currentTimeMillis());
        return "CFG-" + value.substring(Math.max(0, value.length() - 6));
    }

    private <T> Slice<T> slice(List<T> data, int skip, int limit) {
        int safeSkip = Math.max(0, skip);
        int safeLimit = Math.max(1, limit);
        int from = Math.min(safeSkip, data.size());
        int to = Math.min(from + safeLimit, data.size());
        return new Slice<>(data.subList(from, to), data.size());
    }

    private record Slice<T>(List<T> items, long total) {
    }
}
