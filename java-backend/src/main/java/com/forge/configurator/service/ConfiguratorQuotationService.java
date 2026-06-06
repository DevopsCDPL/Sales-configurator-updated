package com.forge.configurator.service;

import com.forge.configurator.engine.BomEngine;
import com.forge.configurator.engine.LabourEngine;
import com.forge.configurator.engine.PricingEngine;
import com.forge.configurator.engine.QuotationCompiler;
import com.forge.configurator.entity.*;
import com.forge.configurator.repository.*;
import com.forge.operations.service.SequenceNumberingService;
import com.forge.shared.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
public class ConfiguratorQuotationService {
    private final ConfiguratorConfigurationRepository configurationRepository;
    private final ConfiguratorComponentRepository componentRepository;
    private final ConfiguratorBomItemRepository bomItemRepository;
    private final ConfiguratorLabourLineRepository labourLineRepository;
    private final ConfiguratorQuotationRepository quotationRepository;
    private final ConfiguratorQuotationItemRepository quotationItemRepository;
    private final ConfiguratorSystemParameterRepository systemParameterRepository;
    private final ProjectRepository projectRepository;
    private final PdfQuotationService pdfQuotationService;
    private final SequenceNumberingService sequenceNumberingService;

    private final BomEngine bomEngine = new BomEngine();
    private final PricingEngine pricingEngine = new PricingEngine();
    private final LabourEngine labourEngine = new LabourEngine();
    private final QuotationCompiler compiler = new QuotationCompiler(bomEngine, pricingEngine, labourEngine);

    public ConfiguratorQuotationService(ConfiguratorConfigurationRepository configurationRepository,
                                        ConfiguratorComponentRepository componentRepository,
                                        ConfiguratorBomItemRepository bomItemRepository,
                                        ConfiguratorLabourLineRepository labourLineRepository,
                                        ConfiguratorQuotationRepository quotationRepository,
                                        ConfiguratorQuotationItemRepository quotationItemRepository,
                                        ConfiguratorSystemParameterRepository systemParameterRepository,
                                        ProjectRepository projectRepository,
                                        PdfQuotationService pdfQuotationService,
                                        SequenceNumberingService sequenceNumberingService) {
        this.configurationRepository = configurationRepository;
        this.componentRepository = componentRepository;
        this.bomItemRepository = bomItemRepository;
        this.labourLineRepository = labourLineRepository;
        this.quotationRepository = quotationRepository;
        this.quotationItemRepository = quotationItemRepository;
        this.systemParameterRepository = systemParameterRepository;
        this.projectRepository = projectRepository;
        this.pdfQuotationService = pdfQuotationService;
        this.sequenceNumberingService = sequenceNumberingService;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> previewQuotation(UUID configurationId,
                                                Map<String, Object> overrides,
                                                UUID companyScope) {
        PreparedCompilation prepared = prepareCompilation(configurationId, overrides, companyScope);
        return toCompiledResponse(prepared);
    }

    @Transactional
    public CompilePersistResult compileAndPersistQuotation(UUID configurationId,
                                                           Map<String, Object> overrides,
                                                           UUID companyScope,
                                                           UUID userId,
                                                           boolean generatePdf,
                                                           String customer) {
        PreparedCompilation prepared = prepareCompilation(configurationId, overrides, companyScope);
        ConfiguratorConfigurationEntity configuration = prepared.configuration();

        bomItemRepository.deleteByConfigurationId(configuration.getId());
        labourLineRepository.deleteByConfigurationId(configuration.getId());

        List<BomEngine.BomRow> bomRows = bomRows(prepared.compiled());
        Instant now = Instant.now();

        List<ConfiguratorBomItemEntity> bomItems = new ArrayList<>();
        for (BomEngine.BomRow row : bomRows) {
            ConfiguratorBomItemEntity item = new ConfiguratorBomItemEntity();
            item.setId(UUID.randomUUID());
            item.setConfigurationId(configuration.getId());
            item.setComponentId(row.componentId());
            item.setStepKey(row.stepKey());
            item.setCategory(row.category());
            item.setPartNumber(row.partNumber());
            item.setDescription(row.description() == null ? row.name() : row.description());
            item.setQuantity(decimal(row.quantity()));
            item.setUnit(row.unit());
            item.setUnitCost(decimal(row.unitCost()));
            item.setTotalCost(decimal(row.totalCost()));
            item.setMeta(row.meta());
            item.setCompanyId(configuration.getCompanyId());
            item.setCreatedAt(now);
            item.setUpdatedAt(now);
            bomItems.add(bomItemRepository.save(item));
        }

        List<ConfiguratorLabourLineEntity> labourLines = new ArrayList<>();
        for (String cat : PricingEngine.LABOR_CATEGORIES) {
            ConfiguratorLabourLineEntity line = new ConfiguratorLabourLineEntity();
            line.setId(UUID.randomUUID());
            line.setConfigurationId(configuration.getId());
            line.setCategory(cat.toLowerCase(Locale.ROOT));
            line.setHours(decimal(num(prepared.compiled().labour().hours().get(cat))));
            line.setRate(decimal(num(prepared.compiled().labour().rates().get(cat))));
            line.setTotalCost(decimal(num(prepared.compiled().labour().costs().get(cat))));
            line.setMeta(Map.of());
            line.setCompanyId(configuration.getCompanyId());
            line.setCreatedAt(now);
            line.setUpdatedAt(now);
            labourLines.add(labourLineRepository.save(line));
        }

        ConfiguratorQuotationEntity quotation = new ConfiguratorQuotationEntity();
        quotation.setId(UUID.randomUUID());
        quotation.setQuotationNumber(sequenceNumberingService.generateNumber(
                SequenceNumberingService.QUOTATION_NUMBER, configuration.getCompanyId()));
        quotation.setProjectId(configuration.getProjectId());
        quotation.setConfigurationId(configuration.getId());
        quotation.setCustomerName(customer);
        quotation.setIssuedAt(now);
        quotation.setStatus("draft");
        quotation.setSold(false);
        quotation.setSubtotal(decimal(num(prepared.compiled().totals().get("section_cost_total"))));
        quotation.setLabourTotal(decimal(num(prepared.compiled().labour().totals().get("cost_total"))));
        quotation.setMaterialTotal(decimal(num(prepared.compiled().totals().get("material_total"))));
        quotation.setOverheadTotal(decimal(num(prepared.compiled().totals().get("overhead_amount"))));
        quotation.setMarginPct(decimal(num(prepared.compiled().totals().get("actual_gm"))));
        quotation.setMarginTotal(decimal(num(prepared.compiled().totals().get("actual_profit"))));
        quotation.setTaxTotal(java.math.BigDecimal.ZERO); // Default to ZERO if not explicitly modeled
        quotation.setGrandTotal(decimal(num(prepared.compiled().totals().get("rounded_price"))));
        quotation.setCurrency("USD");
        quotation.setBomSpec(toBomSpecMap(prepared.compiled()));
        quotation.setPricingSpec(toPricingSpecMap(prepared));
        quotation.setCompanyId(configuration.getCompanyId());
        quotation.setCreatedBy(userId);
        quotation.setCreatedAt(now);
        quotation.setUpdatedAt(now);
        quotation = quotationRepository.save(quotation);

        List<ConfiguratorQuotationItemEntity> quoteItems = new ArrayList<>();
        for (QuotationCompiler.QuotationItem row : prepared.compiled().items()) {
            ConfiguratorQuotationItemEntity item = new ConfiguratorQuotationItemEntity();
            item.setId(UUID.randomUUID());
            item.setQuotationId(quotation.getId());
            item.setComponentId(row.componentId());
            item.setLineNo(row.lineNumber());
            item.setStepKey(row.stepKey());
            item.setCategory(row.category());
            item.setPartNumber(row.partNumber());
            item.setDescription(row.description());
            item.setQuantity(decimal(row.quantity()));
            item.setUnit(row.unit());
            item.setUnitPrice(decimal(row.unitCost()));
            item.setLineTotal(decimal(row.totalCost()));
            item.setMeta(row.meta());
            item.setCompanyId(configuration.getCompanyId());
            item.setCreatedAt(now);
            item.setUpdatedAt(now);
            quoteItems.add(quotationItemRepository.save(item));
        }

        Map<String, Object> pdfPayload = null;
        if (generatePdf) {
            try {
                PdfQuotationService.PdfResult pdf = pdfQuotationService.generateAndStoreQuotationPdf(
                        prepared.compiled(), quotation, configuration, prepared.project(), configuration.getCompanyId(), userId
                );
                quotation.setPdfDocumentId(pdf.documentId());
                quotation.setUpdatedAt(Instant.now());
                quotationRepository.save(quotation);
                pdfPayload = new LinkedHashMap<>();
                pdfPayload.put("document_id", pdf.documentId());
                pdfPayload.put("file_name", pdf.fileName());
                pdfPayload.put("file_path", pdf.filePath());
                pdfPayload.put("r2_url", pdf.r2Url());
            } catch (Exception ignored) {
                ignored.printStackTrace();
                // Quotation persistence is primary; PDF generation failure is non-fatal.
            }
        }

        return new CompilePersistResult(
                toQuotationMap(quotation),
                quoteItems.stream().map(this::toQuotationItemEntityMap).toList(),
                bomItems.stream().map(this::toBomItemEntityMap).toList(),
                labourLines.stream().map(this::toLabourLineEntityMap).toList(),
                pdfPayload
        );
    }

    @Transactional
    public Map<String, Object> markQuotationSold(UUID quotationId, UUID companyScope) {
        ConfiguratorQuotationEntity quotation = findQuotation(quotationId, companyScope);
        quotation.setSold(true);
        quotation.setStatus("sold");
        quotation.setUpdatedAt(Instant.now());
        quotationRepository.save(quotation);
        return toQuotationMap(quotation);
    }

    @Transactional
    public Map<String, Object> regenerateQuotationPdf(UUID quotationId,
                                                      UUID companyScope,
                                                      UUID userId) {
        ConfiguratorQuotationEntity quotation = findQuotation(quotationId, companyScope);
        ConfiguratorConfigurationEntity configuration = quotation.getConfigurationId() == null
                ? null
                : findConfiguration(quotation.getConfigurationId(), companyScope);
        ProjectEntity project = quotation.getProjectId() == null
                ? null
                : projectRepository.findById(quotation.getProjectId()).orElse(null);

        // Node parity: regenerate PDF from persisted quotation snapshot data
        // (bom_spec + pricing_spec) rather than recompiling current config.
        QuotationCompiler.CompiledQuotation compiled = compiledFromSnapshot(quotation, configuration);

        try {
            PdfQuotationService.PdfResult pdf = pdfQuotationService.generateAndStoreQuotationPdf(
                    compiled,
                    quotation,
                    configuration,
                    project,
                    quotation.getCompanyId(),
                    userId
            );
            quotation.setPdfDocumentId(pdf.documentId());
            quotation.setUpdatedAt(Instant.now());
            quotationRepository.save(quotation);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("quotation", toQuotationMap(quotation));
            result.put("pdf", Map.of(
                    "document_id", pdf.documentId(),
                    "file_name", pdf.fileName(),
                    "file_path", pdf.filePath(),
                    "r2_url", pdf.r2Url()
            ));
            return result;
        } catch (Exception ex) {
            ex.printStackTrace();
            throw new ApiException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Failed to regenerate PDF: " + ex.getMessage());
        }
    }

        private QuotationCompiler.CompiledQuotation compiledFromSnapshot(ConfiguratorQuotationEntity quotation,
                                         ConfiguratorConfigurationEntity configuration) {
        Map<String, Object> bomSpec = map(quotation.getBomSpec());
        Map<String, Object> pricingSpec = map(quotation.getPricingSpec());
        Map<String, Object> quoteMap = map(pricingSpec.get("quote"));
        Map<String, Object> labourMap = map(pricingSpec.get("labour_summary"));

        List<QuotationCompiler.QuotationItem> items = new ArrayList<>();
        List<Object> rows = list(bomSpec.get("rows"));
        for (int i = 0; i < rows.size(); i++) {
            Object raw = rows.get(i);
            if (!(raw instanceof Map<?, ?> rawMap)) {
            continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> row = (Map<String, Object>) rawMap;
            Integer sectionNumber = row.containsKey("section_number")
                ? integer(row.get("section_number"), 0)
                : null;

            items.add(new QuotationCompiler.QuotationItem(
                i + 1,
                uuid(row.get("component_id")),
                text(row.get("part_number"), null),
                text(first(row, "description", "name"), ""),
                text(row.get("category"), null),
                text(row.get("step_key"), null),
                sectionNumber,
                num(row.get("quantity")),
                text(row.get("unit"), "ea"),
                num(row.get("unit_cost")),
                num(row.get("total_cost")),
                map(row.get("meta"))
            ));
        }

        Map<String, Object> quoteTotalsMap = map(quoteMap.get("totals"));
        Map<String, Object> quotePricingMap = map(quoteMap.get("pricing"));
        Map<String, Object> quoteScheduleMap = map(quoteMap.get("schedule"));

        PricingEngine.PricingResult pricing = new PricingEngine.PricingResult(
            num(quotePricingMap.get("target_price")),
            num(quotePricingMap.get("rounded_price")),
            num(quotePricingMap.get("actual_profit")),
            num(quotePricingMap.get("actual_gm")),
            integer(quotePricingMap.get("roundup_factor"), -1)
        );

        PricingEngine.ScheduleResult schedule = new PricingEngine.ScheduleResult(
            instant(quoteScheduleMap.get("order_date")),
            instant(quoteScheduleMap.get("long_lead_sub_date")),
            instant(quoteScheduleMap.get("long_lead_approve_date")),
            instant(quoteScheduleMap.get("eng_sub_date")),
            instant(quoteScheduleMap.get("release_date")),
            instant(quoteScheduleMap.get("rts_date"))
        );

        List<PricingEngine.AddersGroupedItem> adders = new ArrayList<>();
        for (Object rawAdder : list(quoteMap.get("adders_grouped"))) {
            if (!(rawAdder instanceof Map<?, ?> rawMap)) {
            continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> adder = (Map<String, Object>) rawMap;
            adders.add(new PricingEngine.AddersGroupedItem(
                text(adder.get("desc"), ""),
                num(adder.get("total"))
            ));
        }

        PricingEngine.QuoteResult quote = new PricingEngine.QuoteResult(
            instant(quoteMap.get("generated_at")) == null ? Instant.now() : instant(quoteMap.get("generated_at")),
            text(quoteMap.get("calc_version"), PricingEngine.CALC_VERSION),
            List.of(),
            toDoubleMap(quoteTotalsMap),
            toDoubleMap(map(quoteMap.get("labor_costs"))),
            toDoubleMap(map(quoteMap.get("labor_hours"))),
            adders,
            num(quoteMap.get("total_line_adders")),
            num(quoteMap.get("total_cost")),
            pricing,
            schedule,
            num(quoteMap.get("copper_total"))
        );

        LabourEngine.LabourSummary labour = new LabourEngine.LabourSummary(
            toDoubleMap(map(labourMap.get("hours"))),
            toDoubleMap(map(labourMap.get("costs"))),
            toDoubleMap(map(labourMap.get("rates"))),
            toDoubleMap(map(labourMap.get("totals")))
        );

        Map<String, Double> totals = new LinkedHashMap<>();
        totals.put("material_total", num(quotation.getMaterialTotal()));
        totals.put("section_cost_total", num(quotation.getSubtotal()));
        totals.put("overhead_amount", num(quotation.getOverheadTotal()));
        totals.put("copper_cost", num(quoteTotalsMap.get("copper_cost")));
        totals.put("total_cost", num(quoteMap.get("total_cost")));
        totals.put("target_price", num(quotePricingMap.get("target_price")));
        totals.put("rounded_price", num(quotation.getGrandTotal()));
        totals.put("actual_profit", num(quotation.getMarginTotal()));
        totals.put("actual_gm", num(quotation.getMarginPct()));

        return new QuotationCompiler.CompiledQuotation(
            configuration == null ? null : toConfigurationMap(configuration),
            quote,
            labour,
            items,
            bomSpec,
            pricingSpec,
            totals
        );
        }

    @Transactional(readOnly = true)
    public Map<String, Object> getOrCreateSystemParameters(UUID userId, UUID companyId) {
        ConfiguratorSystemParameterEntity row = systemParameterRepository.findByUserIdAndCompanyId(userId, companyId)
                .orElseGet(() -> {
                    ConfiguratorSystemParameterEntity created = new ConfiguratorSystemParameterEntity();
                    created.setId(UUID.randomUUID());
                    created.setUserId(userId);
                    created.setData(new LinkedHashMap<>());
                    created.setCompanyId(companyId);
                    created.setCreatedAt(Instant.now());
                    created.setUpdatedAt(Instant.now());
                    return systemParameterRepository.save(created);
                });
        return row.getData() == null ? Map.of() : row.getData();
    }

    @Transactional
    public Map<String, Object> setSystemParameters(UUID userId, UUID companyId, Map<String, Object> data) {
        ConfiguratorSystemParameterEntity row = systemParameterRepository.findByUserIdAndCompanyId(userId, companyId)
                .orElseGet(() -> {
                    ConfiguratorSystemParameterEntity created = new ConfiguratorSystemParameterEntity();
                    created.setId(UUID.randomUUID());
                    created.setUserId(userId);
                    created.setCompanyId(companyId);
                    created.setCreatedAt(Instant.now());
                    return created;
                });

        row.setData(data == null ? new LinkedHashMap<>() : new LinkedHashMap<>(data));
        row.setUpdatedAt(Instant.now());
        if (row.getCreatedAt() == null) {
            row.setCreatedAt(Instant.now());
        }
        return systemParameterRepository.save(row).getData();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getSystemSection(UUID userId, UUID companyId, int sectionNumber) {
        Map<String, Object> params = getOrCreateSystemParameters(userId, companyId);
        Map<String, Object> sections = map(params.get("sections"));
        Object value = sections.get(String.valueOf(sectionNumber));
        if (value instanceof Map<?, ?> v) {
            @SuppressWarnings("unchecked")
            Map<String, Object> section = (Map<String, Object>) v;
            return section;
        }
        return Map.of();
    }

    @Transactional
    public Map<String, Object> setSystemSection(UUID userId, UUID companyId, int sectionNumber, Map<String, Object> definition) {
        ConfiguratorSystemParameterEntity row = systemParameterRepository.findByUserIdAndCompanyId(userId, companyId)
                .orElseGet(() -> {
                    ConfiguratorSystemParameterEntity created = new ConfiguratorSystemParameterEntity();
                    created.setId(UUID.randomUUID());
                    created.setUserId(userId);
                    created.setCompanyId(companyId);
                    created.setData(new LinkedHashMap<>());
                    created.setCreatedAt(Instant.now());
                    return created;
                });

        Map<String, Object> payload = row.getData() == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(row.getData());

        Map<String, Object> sections = map(payload.get("sections"));
        sections.put(String.valueOf(sectionNumber), definition == null ? Map.of() : new LinkedHashMap<>(definition));
        payload.put("sections", sections);

        row.setData(payload);
        row.setUpdatedAt(Instant.now());
        if (row.getCreatedAt() == null) {
            row.setCreatedAt(Instant.now());
        }
        systemParameterRepository.save(row);

        return definition == null ? Map.of() : definition;
    }

    private PreparedCompilation prepareCompilation(UUID configurationId,
                                                   Map<String, Object> overrides,
                                                   UUID companyScope) {
        ConfiguratorConfigurationEntity configuration = findConfiguration(configurationId, companyScope);
        ProjectEntity project = configuration.getProjectId() == null
                ? null
                : projectRepository.findById(configuration.getProjectId()).orElse(null);

        Map<String, Object> normalizedConfigData =
                QuotationCompiler.normalizeConfigurationData(configuration.getConfigData());

        BomEngine.Catalog catalog = buildComponentCatalog(normalizedConfigData, companyScope);

        Map<String, Object> safeOverrides = overrides == null ? Map.of() : overrides;

        Map<String, Double> lookup = new LinkedHashMap<>(ConfiguratorDefaults.LOOKUP);
        lookup.putAll(toDoubleMap(map(safeOverrides.get("lookup"))));

        Map<String, Object> pricingData = new LinkedHashMap<>(ConfiguratorDefaults.PRICING);
        pricingData.putAll(map(safeOverrides.get("pricing")));
        PricingEngine.PricingStrategy pricing = new PricingEngine.PricingStrategy(
                text(pricingData.get("strategy"), "DESIRED GM%"),
                toNullableDouble(pricingData.get("desired_gm_pct")),
                toNullableDouble(pricingData.get("desired_price")),
                integer(pricingData.get("roundup_factor"), -1)
        );

        Map<String, Object> scheduleData = new LinkedHashMap<>(ConfiguratorDefaults.SCHEDULE);
        scheduleData.putAll(map(safeOverrides.get("schedule")));
        Instant orderDate = instant(scheduleData.get("order_date"));
        PricingEngine.ScheduleInput schedule = new PricingEngine.ScheduleInput(
                orderDate,
                integer(scheduleData.get("long_lead_sub_weeks"), 0),
                integer(scheduleData.get("long_lead_approve_weeks"), 0),
                integer(scheduleData.get("eng_sub_weeks"), 0),
                integer(scheduleData.get("sub_approve_weeks"), 0),
                integer(scheduleData.get("lead_time_weeks"), 0),
                integer(scheduleData.get("mfg_time_weeks"), 0)
        );

        List<LocalDate> holidays = parseHolidays(list(safeOverrides.get("holidays")));
        List<QuotationCompiler.LineAdder> lineAdders = parseLineAdders(list(safeOverrides.get("lineAdders")));
        List<PricingEngine.SectionInput> preBuiltSections = parseSections(list(safeOverrides.get("preBuiltSections")));

        QuotationCompiler.CompiledQuotation compiled = compiler.compileQuotation(
                toConfigurationMap(configuration),
                normalizedConfigData,
                catalog,
                lookup,
                pricing,
                schedule,
                holidays,
                lineAdders,
                preBuiltSections.isEmpty() ? null : preBuiltSections
        );

        return new PreparedCompilation(
                configuration,
                project,
                compiled,
                lookup,
                pricing,
                schedule,
                holidays,
                lineAdders,
                preBuiltSections.isEmpty() ? bomEngine.sectionsFromBomRows(bomRows(compiled)) : preBuiltSections
        );
    }

    private BomEngine.Catalog buildComponentCatalog(Map<String, Object> configData, UUID companyScope) {
        Set<UUID> ids = new LinkedHashSet<>();
        Set<String> partNumbers = new LinkedHashSet<>();

        for (String stepKey : BomEngine.STEP_KEYS) {
            Object nodeObj = configData.get(stepKey);
            if (!(nodeObj instanceof Map<?, ?> nodeAny)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> node = (Map<String, Object>) nodeAny;

            List<Map<String, Object>> entries = new ArrayList<>();
            entries.addAll(entryList(node.get("bom_rows")));
            entries.addAll(entryList(node.get("selected_components")));
            entries.addAll(entryList(node.get("items")));

            for (Map<String, Object> entry : entries) {
                UUID id = uuid(entry.get("component_id"));
                if (id != null) {
                    ids.add(id);
                }
                String partNumber = text(entry.get("part_number"), null);
                if (partNumber != null && !partNumber.isBlank()) {
                    partNumbers.add(partNumber);
                }
            }
        }

        Map<UUID, ConfiguratorComponentEntity> byId = new LinkedHashMap<>();
        Map<String, ConfiguratorComponentEntity> byPartNumber = new LinkedHashMap<>();

        if (!ids.isEmpty()) {
            for (ConfiguratorComponentEntity component : componentRepository.findByIdIn(ids)) {
                if (companyScope != null && !Objects.equals(companyScope, component.getCompanyId())) {
                    continue;
                }
                byId.put(component.getId(), component);
                if (component.getPartNumber() != null && !component.getPartNumber().isBlank()) {
                    byPartNumber.put(component.getPartNumber(), component);
                }
            }
        }

        if (!partNumbers.isEmpty()) {
            for (ConfiguratorComponentEntity component : componentRepository.findByPartNumberIn(partNumbers)) {
                if (companyScope != null && !Objects.equals(companyScope, component.getCompanyId())) {
                    continue;
                }
                byId.putIfAbsent(component.getId(), component);
                if (component.getPartNumber() != null && !component.getPartNumber().isBlank()) {
                    byPartNumber.putIfAbsent(component.getPartNumber(), component);
                }
            }
        }

        return new BomEngine.Catalog(byId, byPartNumber);
    }

    private ConfiguratorConfigurationEntity findConfiguration(UUID id, UUID companyScope) {
        Optional<ConfiguratorConfigurationEntity> row;
        if (companyScope == null) {
            row = configurationRepository.findById(id);
        } else {
            row = configurationRepository.findByIdAndCompanyId(id, companyScope);
        }
        return row.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Configuration not found"));
    }

    private ConfiguratorQuotationEntity findQuotation(UUID id, UUID companyScope) {
        Optional<ConfiguratorQuotationEntity> row;
        if (companyScope == null) {
            row = quotationRepository.findById(id);
        } else {
            row = quotationRepository.findByIdAndCompanyId(id, companyScope);
        }
        return row.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Quotation not found"));
    }

    private Map<String, Object> toCompiledResponse(PreparedCompilation prepared) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("configuration", toConfigurationMap(prepared.configuration()));
        response.put("quote", toQuoteMap(prepared.compiled().quote()));
        response.put("labour", toLabourMap(prepared.compiled().labour()));
        response.put("items", prepared.compiled().items().stream().map(this::toQuoteItemMap).toList());
        response.put("bom_spec", toBomSpecMap(prepared.compiled()));
        response.put("pricing_spec", toPricingSpecMap(prepared));
        response.put("totals", prepared.compiled().totals());
        return response;
    }

    private Map<String, Object> toConfigurationMap(ConfiguratorConfigurationEntity configuration) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", configuration.getId());
        map.put("code", configuration.getCode());
        map.put("name", configuration.getName());
        map.put("project_id", configuration.getProjectId());
        return map;
    }

    private Map<String, Object> toQuoteMap(PricingEngine.QuoteResult quote) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("generated_at", quote.generatedAt().toString());
        map.put("calc_version", quote.calcVersion());
        map.put("section_breakdown", quote.sectionBreakdown().stream().map(section -> {
            Map<String, Object> sec = new LinkedHashMap<>();
            sec.put("id", section.id());
            sec.put("description", section.description());
            sec.put("qty", section.qty());
            sec.put("material_total", section.materialTotal());

            Map<String, Object> labor = new LinkedHashMap<>();
            for (Map.Entry<String, PricingEngine.LaborCategoryBreakdown> entry : section.labor().entrySet()) {
                Map<String, Object> values = new LinkedHashMap<>();
                values.put("hours", entry.getValue().hours());
                values.put("cost", entry.getValue().cost());
                values.put("rate", entry.getValue().rate());
                labor.put(entry.getKey(), values);
            }
            sec.put("labor", labor);
            sec.put("section_total", section.sectionTotal());
            sec.put("copper_total", section.copperTotal());
            return sec;
        }).toList());
        map.put("totals", quote.totals());
        map.put("labor_costs", quote.laborCosts());
        map.put("labor_hours", quote.laborHours());
        map.put("adders_grouped", quote.addersGrouped().stream().map(adder -> Map.of(
                "desc", adder.desc(),
                "total", adder.total()
        )).toList());
        map.put("total_line_adders", quote.totalLineAdders());
        map.put("total_cost", quote.totalCost());
        Map<String, Object> pricingMap = new LinkedHashMap<>();
        pricingMap.put("target_price", quote.pricing().targetPrice());
        pricingMap.put("rounded_price", quote.pricing().roundedPrice());
        pricingMap.put("actual_profit", quote.pricing().actualProfit());
        pricingMap.put("actual_gm", quote.pricing().actualGm());
        pricingMap.put("roundup_factor", quote.pricing().roundupFactor());
        map.put("pricing", pricingMap);
        Map<String, Object> scheduleMap = new LinkedHashMap<>();
        scheduleMap.put("order_date", iso(quote.schedule().orderDate()));
        scheduleMap.put("long_lead_sub_date", iso(quote.schedule().longLeadSubDate()));
        scheduleMap.put("long_lead_approve_date", iso(quote.schedule().longLeadApproveDate()));
        scheduleMap.put("eng_sub_date", iso(quote.schedule().engSubDate()));
        scheduleMap.put("release_date", iso(quote.schedule().releaseDate()));
        scheduleMap.put("rts_date", iso(quote.schedule().rtsDate()));
        map.put("schedule", scheduleMap);
        map.put("copper_total", quote.copperTotal());
        return map;
    }

    private Map<String, Object> toLabourMap(LabourEngine.LabourSummary labour) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("hours", labour.hours());
        map.put("costs", labour.costs());
        map.put("rates", labour.rates());
        map.put("totals", labour.totals());
        return map;
    }

    private Map<String, Object> toQuoteItemMap(QuotationCompiler.QuotationItem item) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("line_number", item.lineNumber());
        map.put("component_id", item.componentId());
        map.put("part_number", item.partNumber());
        map.put("description", item.description());
        map.put("category", item.category());
        map.put("step_key", item.stepKey());
        map.put("section_number", item.sectionNumber());
        map.put("quantity", item.quantity());
        map.put("unit", item.unit());
        map.put("unit_cost", item.unitCost());
        map.put("total_cost", item.totalCost());
        map.put("meta", item.meta());
        return map;
    }

    private Map<String, Object> toBomSpecMap(QuotationCompiler.CompiledQuotation compiled) {
        Map<String, Object> spec = new LinkedHashMap<>();
        List<BomEngine.BomRow> rows = bomRows(compiled);
        spec.put("rows", rows.stream().map(this::toBomRowMap).toList());

        Map<String, Object> byStep = new LinkedHashMap<>();
        Map<String, Map<String, Object>> rawByStep = byStep(compiled);
        for (Map.Entry<String, Map<String, Object>> entry : rawByStep.entrySet()) {
            Map<String, Object> value = new LinkedHashMap<>();
            List<BomEngine.BomRow> stepRows = castRows(entry.getValue().get("rows"));
            value.put("rows", stepRows.stream().map(this::toBomRowMap).toList());
            value.put("total_cost", num(entry.getValue().get("total_cost")));
            byStep.put(entry.getKey(), value);
        }
        spec.put("by_step", byStep);

        Map<String, Object> bySection = new LinkedHashMap<>();
        Map<Integer, Map<String, Object>> rawBySection = bySection(compiled);
        for (Map.Entry<Integer, Map<String, Object>> entry : rawBySection.entrySet()) {
            Map<String, Object> value = new LinkedHashMap<>();
            List<BomEngine.BomRow> secRows = castRows(entry.getValue().get("rows"));
            value.put("rows", secRows.stream().map(this::toBomRowMap).toList());
            value.put("total_cost", num(entry.getValue().get("total_cost")));
            value.put("material_total", num(entry.getValue().get("material_total")));
            bySection.put(String.valueOf(entry.getKey()), value);
        }
        spec.put("by_section", bySection);

        spec.put("totals", compiled.bomSpec().getOrDefault("totals", Map.of()));
        return spec;
    }

    private Map<String, Object> toPricingSpecMap(PreparedCompilation prepared) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("lookup", prepared.lookup());
        Map<String, Object> psMap = new LinkedHashMap<>();
        psMap.put("strategy", prepared.pricing().strategy());
        psMap.put("desired_gm_pct", prepared.pricing().desiredGmPct());
        psMap.put("desired_price", prepared.pricing().desiredPrice());
        psMap.put("roundup_factor", prepared.pricing().roundupFactor());
        map.put("pricing_strategy", psMap);

        Map<String, Object> schedule = new LinkedHashMap<>();
        schedule.put("order_date", iso(prepared.schedule().orderDate()));
        schedule.put("long_lead_sub_weeks", prepared.schedule().longLeadSubWeeks());
        schedule.put("long_lead_approve_weeks", prepared.schedule().longLeadApproveWeeks());
        schedule.put("eng_sub_weeks", prepared.schedule().engSubWeeks());
        schedule.put("sub_approve_weeks", prepared.schedule().subApproveWeeks());
        schedule.put("lead_time_weeks", prepared.schedule().leadTimeWeeks());
        schedule.put("mfg_time_weeks", prepared.schedule().mfgTimeWeeks());
        map.put("schedule", schedule);

        map.put("holidays", prepared.holidays().stream().map(LocalDate::toString).toList());
        map.put("line_adders", prepared.lineAdders().stream().map(a -> Map.of(
                "section_id", a.sectionId(),
                "desc", a.desc(),
                "value", a.value()
        )).toList());

        map.put("sections_input", prepared.sectionsInput().stream().map(s -> {
            Map<String, Object> sec = new LinkedHashMap<>();
            sec.put("id", s.id());
            sec.put("description", s.description());
            sec.put("qty", s.qty());
            sec.put("unit_material_cost", s.unitMaterialCost());
            sec.put("labor_hours_per_unit", s.laborHoursPerUnit());
            sec.put("copper_weight_per_unit", s.copperWeightPerUnit());
            sec.put("line_items", s.lineItems().stream().map(li -> Map.of(
                    "desc", li.desc(),
                    "value", li.value()
            )).toList());
            return sec;
        }).toList());

        map.put("quote", toQuoteMap(prepared.compiled().quote()));
        map.put("labour_summary", toLabourMap(prepared.compiled().labour()));
        return map;
    }

    private Map<String, Object> toBomRowMap(BomEngine.BomRow row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("component_id", row.componentId());
        map.put("part_number", row.partNumber());
        map.put("name", row.name());
        map.put("description", row.description());
        map.put("category", row.category());
        map.put("component_type", row.componentType());
        map.put("quantity", row.quantity());
        map.put("unit", row.unit());
        map.put("unit_cost", row.unitCost());
        map.put("total_cost", row.totalCost());
        map.put("unit_material_cost", row.unitMaterialCost());
        map.put("unit_labor_cost", row.unitLaborCost());
        map.put("lbr_cu", row.lbrCu());
        map.put("lbr_asm", row.lbrAsm());
        map.put("lbr_cnt", row.lbrCnt());
        map.put("lbr_qc", row.lbrQc());
        map.put("lbr_tst", row.lbrTst());
        map.put("lbr_eng", row.lbrEng());
        map.put("lbr_cad", row.lbrCad());
        map.put("copper_weight_per_unit", row.copperWeightPerUnit());
        map.put("step_key", row.stepKey());
        map.put("section_number", row.sectionNumber());
        map.put("meta", row.meta());
        return map;
    }

    private Map<String, Object> toQuotationMap(ConfiguratorQuotationEntity quotation) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", quotation.getId());
        map.put("quotation_number", quotation.getQuotationNumber());
        map.put("project_id", quotation.getProjectId());
        map.put("configuration_id", quotation.getConfigurationId());
        map.put("customer_name", quotation.getCustomerName());
        map.put("issued_at", iso(quotation.getIssuedAt()));
        map.put("valid_until", iso(quotation.getValidUntil()));
        map.put("status", quotation.getStatus());
        map.put("sold", quotation.getSold());
        map.put("subtotal", quotation.getSubtotal());
        map.put("labour_total", quotation.getLabourTotal());
        map.put("material_total", quotation.getMaterialTotal());
        map.put("overhead_total", quotation.getOverheadTotal());
        map.put("margin_pct", quotation.getMarginPct());
        map.put("margin_total", quotation.getMarginTotal());
        map.put("tax_total", quotation.getTaxTotal());
        map.put("grand_total", quotation.getGrandTotal());
        map.put("currency", quotation.getCurrency());
        map.put("bom_spec", quotation.getBomSpec());
        map.put("pricing_spec", quotation.getPricingSpec());
        map.put("terms", quotation.getTerms());
        map.put("notes", quotation.getNotes());
        map.put("pdf_document_id", quotation.getPdfDocumentId());
        map.put("company_id", quotation.getCompanyId());
        map.put("created_by", quotation.getCreatedBy());
        map.put("deleted_at", iso(quotation.getDeletedAt()));
        map.put("deleted_by", quotation.getDeletedBy());
        map.put("created_at", iso(quotation.getCreatedAt()));
        map.put("updated_at", iso(quotation.getUpdatedAt()));
        return map;
    }

    private Map<String, Object> toQuotationItemEntityMap(ConfiguratorQuotationItemEntity item) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", item.getId());
        map.put("quotation_id", item.getQuotationId());
        map.put("component_id", item.getComponentId());
        map.put("line_no", item.getLineNo());
        map.put("step_key", item.getStepKey());
        map.put("category", item.getCategory());
        map.put("part_number", item.getPartNumber());
        map.put("description", item.getDescription());
        map.put("quantity", item.getQuantity());
        map.put("unit", item.getUnit());
        map.put("unit_price", item.getUnitPrice());
        map.put("line_total", item.getLineTotal());
        map.put("meta", item.getMeta());
        map.put("company_id", item.getCompanyId());
        map.put("created_at", iso(item.getCreatedAt()));
        map.put("updated_at", iso(item.getUpdatedAt()));
        return map;
    }

    private Map<String, Object> toBomItemEntityMap(ConfiguratorBomItemEntity item) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", item.getId());
        map.put("configuration_id", item.getConfigurationId());
        map.put("component_id", item.getComponentId());
        map.put("step_key", item.getStepKey());
        map.put("category", item.getCategory());
        map.put("part_number", item.getPartNumber());
        map.put("description", item.getDescription());
        map.put("quantity", item.getQuantity());
        map.put("unit", item.getUnit());
        map.put("unit_cost", item.getUnitCost());
        map.put("total_cost", item.getTotalCost());
        map.put("meta", item.getMeta());
        map.put("company_id", item.getCompanyId());
        map.put("created_at", iso(item.getCreatedAt()));
        map.put("updated_at", iso(item.getUpdatedAt()));
        return map;
    }

    private Map<String, Object> toLabourLineEntityMap(ConfiguratorLabourLineEntity item) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", item.getId());
        map.put("configuration_id", item.getConfigurationId());
        map.put("category", item.getCategory());
        map.put("hours", item.getHours());
        map.put("rate", item.getRate());
        map.put("total_cost", item.getTotalCost());
        map.put("meta", item.getMeta());
        map.put("company_id", item.getCompanyId());
        map.put("created_at", iso(item.getCreatedAt()));
        map.put("updated_at", iso(item.getUpdatedAt()));
        return map;
    }

    private List<Map<String, Object>> entryList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> mapAny) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) mapAny;
                out.add(map);
            }
        }
        return out;
    }

    private List<LocalDate> parseHolidays(List<Object> values) {
        List<LocalDate> out = new ArrayList<>();
        for (Object value : values) {
            if (value == null) {
                continue;
            }
            String text = String.valueOf(value);
            if (text.length() >= 10) {
                text = text.substring(0, 10);
            }
            try {
                out.add(LocalDate.parse(text));
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    private List<QuotationCompiler.LineAdder> parseLineAdders(List<Object> values) {
        List<QuotationCompiler.LineAdder> out = new ArrayList<>();
        for (Object value : values) {
            if (!(value instanceof Map<?, ?> mapAny)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) mapAny;
            String sectionId = text(first(map, "section_id", "sectionId"), null);
            String desc = text(map.get("desc"), "");
            double amount = num(map.get("value"));
            out.add(new QuotationCompiler.LineAdder(sectionId, desc, amount));
        }
        return out;
    }

    private List<PricingEngine.SectionInput> parseSections(List<Object> values) {
        List<PricingEngine.SectionInput> out = new ArrayList<>();
        for (Object value : values) {
            if (!(value instanceof Map<?, ?> mapAny)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) mapAny;

            String id = text(map.get("id"), UUID.randomUUID().toString());
            String description = text(map.get("description"), "");
            double unitMaterialCost = num(first(map, "unit_material_cost", "unitMaterialCost"));
            int qty = integer(map.get("qty"), 1);
            double copperWeight = num(first(map, "copper_weight_per_unit", "copperWeightPerUnit"));

            Map<String, Double> labourHours = new LinkedHashMap<>();
            Map<String, Object> rawLabour = map(first(map, "labor_hours_per_unit", "laborHoursPerUnit"));
            for (String cat : PricingEngine.LABOR_CATEGORIES) {
                labourHours.put(cat, num(rawLabour.get(cat)));
            }

            List<PricingEngine.SectionLineItem> lineItems = new ArrayList<>();
            for (Object liRaw : list(first(map, "line_items", "lineItems"))) {
                if (!(liRaw instanceof Map<?, ?> liMapAny)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> liMap = (Map<String, Object>) liMapAny;
                lineItems.add(new PricingEngine.SectionLineItem(
                        text(liMap.get("desc"), ""),
                        num(liMap.get("value"))
                ));
            }

            out.add(new PricingEngine.SectionInput(id, description, unitMaterialCost, qty, labourHours, copperWeight, lineItems));
        }
        return out;
    }

    private Map<String, Double> toDoubleMap(Map<String, Object> source) {
        Map<String, Double> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            out.put(entry.getKey(), num(entry.getValue()));
        }
        return out;
    }

    private List<BomEngine.BomRow> bomRows(QuotationCompiler.CompiledQuotation compiled) {
        Object rows = compiled.bomSpec().get("rows");
        return castRows(rows);
    }

    private Map<String, Map<String, Object>> byStep(QuotationCompiler.CompiledQuotation compiled) {
        Object byStep = compiled.bomSpec().get("by_step");
        if (byStep instanceof Map<?, ?> mapAny) {
            @SuppressWarnings("unchecked")
            Map<String, Map<String, Object>> typed = (Map<String, Map<String, Object>>) mapAny;
            return typed;
        }
        return Map.of();
    }

    private Map<Integer, Map<String, Object>> bySection(QuotationCompiler.CompiledQuotation compiled) {
        Object bySection = compiled.bomSpec().get("by_section");
        if (bySection instanceof Map<?, ?> mapAny) {
            Map<Integer, Map<String, Object>> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : mapAny.entrySet()) {
                Integer key;
                if (entry.getKey() instanceof Number n) {
                    key = n.intValue();
                } else {
                    key = integer(entry.getKey(), 0);
                }
                if (entry.getValue() instanceof Map<?, ?> valueAny) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> value = (Map<String, Object>) valueAny;
                    out.put(key, value);
                }
            }
            return out;
        }
        return Map.of();
    }

    private List<BomEngine.BomRow> castRows(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<BomEngine.BomRow> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof BomEngine.BomRow row) {
                out.add(row);
            }
        }
        return out;
    }

    private Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> mapAny) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : mapAny.entrySet()) {
                out.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return out;
        }
        return new LinkedHashMap<>();
    }

    private List<Object> list(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private Object first(Map<String, Object> map, String a, String b) {
        if (map.containsKey(a)) {
            return map.get(a);
        }
        return map.get(b);
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

    private double num(Object value) {
        if (value == null) {
            return 0.0;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return 0.0;
        }
    }

    private Double toNullableDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private Instant instant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof Date date) {
            return date.toInstant();
        }
        if (value instanceof LocalDate localDate) {
            return localDate.atStartOfDay().toInstant(ZoneOffset.UTC);
        }
        try {
            return Instant.parse(String.valueOf(value));
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private String iso(Instant value) {
        return value == null ? null : value.toString();
    }

    private BigDecimal decimal(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP);
    }

    public record CompilePersistResult(Map<String, Object> quotation,
                                       List<Map<String, Object>> items,
                                       List<Map<String, Object>> bomItems,
                                       List<Map<String, Object>> labourLines,
                                       Map<String, Object> pdf) {
    }

    private record PreparedCompilation(ConfiguratorConfigurationEntity configuration,
                                       ProjectEntity project,
                                       QuotationCompiler.CompiledQuotation compiled,
                                       Map<String, Double> lookup,
                                       PricingEngine.PricingStrategy pricing,
                                       PricingEngine.ScheduleInput schedule,
                                       List<LocalDate> holidays,
                                       List<QuotationCompiler.LineAdder> lineAdders,
                                       List<PricingEngine.SectionInput> sectionsInput) {
    }
}
