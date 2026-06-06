package com.forge.operations.service;

import com.forge.auth.entity.SettingEntity;
import com.forge.auth.repository.SettingRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Centralized document / sequence number generator.
 *
 * Architecture mirrors documentNumberingService.js in the Node backend:
 *  – Numbers are stored as a JSONB blob in the `settings` table under key = 'document_numbering'.
 *  – Each document type has its own counter: { prefix, current_counter, increment_step, suffix, number_length }.
 *  – Records are company-scoped (company_id column, NULL = global).
 *  – System-level overrides come from system_module_config (section_name → prefix/suffix/increment).
 *  – generateNumber() uses SELECT FOR UPDATE (PESSIMISTIC_WRITE) for atomic counter increment.
 */
@Service
public class SequenceNumberingService {

    private static final Logger log = LoggerFactory.getLogger(SequenceNumberingService.class);

    // ── Document type constants (mirrors DOCUMENT_TYPES in documentNumberingService.js) ──
    public static final String PROJECT_NUMBER             = "project_number";
    public static final String CONFIGURATION_NUMBER       = "configuration_number";
    public static final String QUOTATION_NUMBER           = "quotation_number";
    public static final String CLIENT_PO_NUMBER           = "client_po_number";
    public static final String VENDOR_PO_NUMBER           = "vendor_po_number";
    public static final String WORK_ORDER_NUMBER          = "work_order_number";
    public static final String PRODUCTION_TRAVELER_NUMBER = "production_traveler_number";
    public static final String COC_NUMBER                 = "coc_number";
    public static final String PACKING_LIST_NUMBER        = "packing_list_number";
    public static final String COMMERCIAL_INVOICE_NUMBER  = "commercial_invoice_number";
    public static final String TAX_INVOICE_NUMBER         = "tax_invoice_number";
    public static final String PROFORMA_INVOICE_NUMBER    = "proforma_invoice_number";
    public static final String RAW_MATERIAL_ID            = "raw_material_id";
    public static final String PART_ID                    = "part_id";
    public static final String MATERIAL_STOCK_ENTRY_ID    = "material_stock_entry_id";

    public static final Set<String> VALID_TYPES = Set.of(
            PROJECT_NUMBER, CONFIGURATION_NUMBER, QUOTATION_NUMBER,
            CLIENT_PO_NUMBER, VENDOR_PO_NUMBER, WORK_ORDER_NUMBER,
            PRODUCTION_TRAVELER_NUMBER, COC_NUMBER, PACKING_LIST_NUMBER,
            COMMERCIAL_INVOICE_NUMBER, TAX_INVOICE_NUMBER, PROFORMA_INVOICE_NUMBER,
            RAW_MATERIAL_ID, PART_ID, MATERIAL_STOCK_ENTRY_ID
    );

    private static final String SETTINGS_KEY = "document_numbering";

    /**
     * Default configurations — mirrors DEFAULT_CONFIGS in documentNumberingService.js.
     * Fields: prefix, currentCounter, incrementStep, suffix, numberLength.
     */
    private static final Map<String, DocTypeDefaults> DEFAULT_CONFIGS;
    static {
        Map<String, DocTypeDefaults> m = new LinkedHashMap<>();
        m.put(PROJECT_NUMBER,             new DocTypeDefaults("PRJ-",   1, 1, "", 4));
        m.put(CONFIGURATION_NUMBER,       new DocTypeDefaults("CFG-",   1, 1, "", 4));
        m.put(QUOTATION_NUMBER,           new DocTypeDefaults("QT-",    1, 1, "", 4));
        m.put(CLIENT_PO_NUMBER,           new DocTypeDefaults("RFQ-P-", 1, 1, "", 5));
        m.put(VENDOR_PO_NUMBER,           new DocTypeDefaults("PO-P-",  1, 1, "", 5));
        m.put(WORK_ORDER_NUMBER,          new DocTypeDefaults("WO-",    1, 1, "", 4));
        m.put(PRODUCTION_TRAVELER_NUMBER, new DocTypeDefaults("PT-",    1, 1, "", 4));
        m.put(COC_NUMBER,                 new DocTypeDefaults("COC-",   1, 1, "", 4));
        m.put(PACKING_LIST_NUMBER,        new DocTypeDefaults("PL-",    1, 1, "", 4));
        m.put(COMMERCIAL_INVOICE_NUMBER,  new DocTypeDefaults("INV-",   1, 1, "", 4));
        m.put(TAX_INVOICE_NUMBER,         new DocTypeDefaults("TINV-",  1, 1, "", 4));
        m.put(PROFORMA_INVOICE_NUMBER,    new DocTypeDefaults("PINV-",  1, 1, "", 4));
        m.put(RAW_MATERIAL_ID,            new DocTypeDefaults("RM-",    1, 1, "", 4));
        m.put(PART_ID,                    new DocTypeDefaults("PART-",  1, 1, "", 4));
        m.put(MATERIAL_STOCK_ENTRY_ID,    new DocTypeDefaults("MSTK-",  1, 1, "", 4));
        DEFAULT_CONFIGS = Collections.unmodifiableMap(m);
    }

    /**
     * Maps document type → system_module_config.section_name.
     * Mirrors DOC_TYPE_TO_SECTION in documentNumberingService.js.
     */
    private static final Map<String, String> DOC_TYPE_TO_SECTION;
    static {
        Map<String, String> m = new HashMap<>();
        m.put(PROJECT_NUMBER,             "project_id");
        m.put(CONFIGURATION_NUMBER,       "configuration");
        m.put(QUOTATION_NUMBER,           "quotation");
        m.put(CLIENT_PO_NUMBER,           "po");
        m.put(VENDOR_PO_NUMBER,           "rfq");
        m.put(WORK_ORDER_NUMBER,          "work_order");
        m.put(PRODUCTION_TRAVELER_NUMBER, "production_traveler");
        m.put(COC_NUMBER,                 "quality");
        m.put(PACKING_LIST_NUMBER,        "logistics");
        m.put(COMMERCIAL_INVOICE_NUMBER,  "invoice");
        m.put(TAX_INVOICE_NUMBER,         "invoice");
        m.put(PROFORMA_INVOICE_NUMBER,    "invoice");
        DOC_TYPE_TO_SECTION = Collections.unmodifiableMap(m);
    }

    private final SettingRepository settingRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public SequenceNumberingService(SettingRepository settingRepository) {
        this.settingRepository = settingRepository;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Generate a new document number and atomically increment the stored counter.
     *
     * Concurrency: uses PESSIMISTIC_WRITE (SELECT … FOR UPDATE) so that concurrent
     * calls for the same document type + company never produce duplicates.
     *
     * Mirrors _doGenerate() + generateNumber() in documentNumberingService.js.
     */
    @Transactional
    public String generateNumber(String documentType, UUID companyId) {
        validateType(documentType);

        // Lock the settings row for this key + company (null-safe).
        // Use cast(s.companyId as String) so Hibernate generates a varchar comparison
        // that works regardless of whether the DB column is 'uuid' or 'character varying'.
        String jpql = companyId == null
                ? "SELECT s FROM SettingEntity s WHERE s.key = :key AND s.companyId IS NULL"
                : "SELECT s FROM SettingEntity s WHERE s.key = :key AND cast(s.companyId as String) = :companyId";

        var query = entityManager.createQuery(jpql, SettingEntity.class)
                .setParameter("key", SETTINGS_KEY)
                .setLockMode(LockModeType.PESSIMISTIC_WRITE);
        if (companyId != null) query.setParameter("companyId", companyId.toString());

        List<SettingEntity> rows = query.getResultList();

        SettingEntity setting;
        Map<String, Object> configs;

        if (rows.isEmpty()) {
            // First call for this company: seed all defaults (mirrors Node.js _doGenerate insert branch)
            configs = buildAllDefaults();
            setting = buildNewEntity(companyId, configs);
        } else {
            setting = rows.get(0);
            configs = setting.getValue() != null
                    ? new LinkedHashMap<>(setting.getValue())
                    : buildAllDefaults();
        }

        // Ensure the requested document type has a config entry
        Map<String, Object> typeConfig = extractOrDefault(configs, documentType);

        // Apply system_module_config overrides (prefix/suffix/increment from admin settings)
        applySystemConfigOverride(typeConfig, documentType, companyId);

        // Format the number BEFORE incrementing
        String generatedNumber = formatNumber(typeConfig);

        // Increment counter — counters only go forward, never back
        int step    = asInt(typeConfig.get("increment_step"), 1);
        int current = asInt(typeConfig.get("current_counter"), 1);
        typeConfig.put("current_counter", current + step);
        configs.put(documentType, typeConfig);

        setting.setValue(configs);
        setting.setUpdatedAt(Instant.now());
        settingRepository.save(setting);

        log.debug("Generated {} = {} for company={}", documentType, generatedNumber, companyId);
        return generatedNumber;
    }

    /**
     * Preview the NEXT number without incrementing the counter.
     * Mirrors generatePreview() in documentNumberingService.js.
     */
    public String generatePreview(String documentType, UUID companyId) {
        validateType(documentType);
        Map<String, Object> allConfigs = getAllConfigurations(companyId);
        Map<String, Object> typeConfig = new LinkedHashMap<>(extractOrDefault(allConfigs, documentType));
        applySystemConfigOverride(typeConfig, documentType, companyId);
        return formatNumber(typeConfig);
    }

    /**
     * Get configuration for a single document type.
     * Mirrors getConfiguration() in documentNumberingService.js.
     */
    public Map<String, Object> getConfiguration(String documentType, UUID companyId) {
        validateType(documentType);
        return extractOrDefault(getAllConfigurations(companyId), documentType);
    }

    /**
     * Get configurations for ALL document types, merged with defaults for missing entries.
     * Mirrors getAllConfigurations() in documentNumberingService.js.
     */
    public Map<String, Object> getAllConfigurations(UUID companyId) {
        Optional<SettingEntity> row = companyId == null
                ? settingRepository.findByKeyAndCompanyIdIsNull(SETTINGS_KEY)
                : settingRepository.findByKeyAndCompanyId(SETTINGS_KEY, companyId);

        Map<String, Object> stored = row.map(SettingEntity::getValue).orElse(Map.of());
        Map<String, Object> result = new LinkedHashMap<>();
        for (String type : VALID_TYPES) {
            result.put(type, stored.containsKey(type) ? stored.get(type) : defaultAsMap(type));
        }
        return result;
    }

    /**
     * Save (update) configuration for a single document type.
     * Validates all fields before writing.
     * Mirrors saveConfiguration() in documentNumberingService.js.
     */
    @Transactional
    public Map<String, Object> saveConfiguration(String documentType, Map<String, Object> config, UUID companyId) {
        validateType(documentType);

        String prefix = asString(config.get("prefix"));
        if (prefix == null || prefix.isBlank()) throw new IllegalArgumentException("Prefix cannot be empty");

        int counter = asInt(config.get("current_counter"), -1);
        if (counter < 0) throw new IllegalArgumentException("Starting number must be a non-negative integer");

        int step = asInt(config.get("increment_step"), 0);
        if (step < 1) throw new IllegalArgumentException("Increment step must be >= 1");

        int numLen = asInt(config.get("number_length"), 0);
        if (numLen < 1) throw new IllegalArgumentException("Number length (padding) must be >= 1");

        Map<String, Object> allConfigs = getAllConfigurations(companyId);

        Map<String, Object> updated = new LinkedHashMap<>();
        updated.put("prefix", prefix.trim());
        updated.put("current_counter", counter);
        updated.put("increment_step", step);
        updated.put("suffix", Objects.toString(config.getOrDefault("suffix", ""), ""));
        updated.put("number_length", numLen);
        allConfigs.put(documentType, updated);

        Optional<SettingEntity> existing = companyId == null
                ? settingRepository.findByKeyAndCompanyIdIsNull(SETTINGS_KEY)
                : settingRepository.findByKeyAndCompanyId(SETTINGS_KEY, companyId);

        SettingEntity entity = existing.orElseGet(() -> buildNewEntity(companyId, new LinkedHashMap<>()));
        entity.setValue(allConfigs);
        entity.setUpdatedAt(Instant.now());
        settingRepository.save(entity);

        return updated;
    }

    /**
     * Ensure the document_numbering row exists, seeding defaults for any missing types.
     * Safe to call multiple times (idempotent).
     * Mirrors initialize() in documentNumberingService.js.
     */
    @Transactional
    public void initialize(UUID companyId) {
        Optional<SettingEntity> existing = companyId == null
                ? settingRepository.findByKeyAndCompanyIdIsNull(SETTINGS_KEY)
                : settingRepository.findByKeyAndCompanyId(SETTINGS_KEY, companyId);

        if (existing.isEmpty()) {
            settingRepository.save(buildNewEntity(companyId, buildAllDefaults()));
            log.info("SequenceNumbering: initialized defaults for company={}", companyId);
            return;
        }

        SettingEntity entity = existing.get();
        Map<String, Object> value = entity.getValue() != null
                ? new LinkedHashMap<>(entity.getValue())
                : new LinkedHashMap<>();
        boolean patched = false;
        for (String type : VALID_TYPES) {
            if (!value.containsKey(type)) {
                value.put(type, defaultAsMap(type));
                patched = true;
            }
        }
        if (patched) {
            entity.setValue(value);
            entity.setUpdatedAt(Instant.now());
            settingRepository.save(entity);
            log.info("SequenceNumbering: patched missing types for company={}", companyId);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void validateType(String documentType) {
        if (!VALID_TYPES.contains(documentType)) {
            throw new IllegalArgumentException("Invalid document type: " + documentType);
        }
    }

    /** Format: [prefix][zero-padded counter][suffix] */
    private String formatNumber(Map<String, Object> config) {
        int    counter = asInt(config.get("current_counter"), 1);
        int    length  = asInt(config.get("number_length"),   4);
        String prefix  = Objects.toString(config.getOrDefault("prefix", ""), "");
        String suffix  = Objects.toString(config.getOrDefault("suffix", ""), "");
        return prefix + String.format("%0" + length + "d", counter) + suffix;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractOrDefault(Map<String, Object> configs, String documentType) {
        Object raw = configs.get(documentType);
        if (raw instanceof Map<?, ?> m) {
            return new LinkedHashMap<>((Map<String, Object>) m);
        }
        return defaultAsMap(documentType);
    }

    private Map<String, Object> defaultAsMap(String documentType) {
        DocTypeDefaults d = DEFAULT_CONFIGS.getOrDefault(documentType,
                new DocTypeDefaults(
                        documentType.substring(0, Math.min(3, documentType.length())).toUpperCase() + "-",
                        1, 1, "", 4));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("prefix",          d.prefix());
        m.put("current_counter", d.currentCounter());
        m.put("increment_step",  d.incrementStep());
        m.put("suffix",          d.suffix());
        m.put("number_length",   d.numberLength());
        return m;
    }

    private Map<String, Object> buildAllDefaults() {
        Map<String, Object> m = new LinkedHashMap<>();
        for (String type : VALID_TYPES) {
            m.put(type, defaultAsMap(type));
        }
        return m;
    }

    private SettingEntity buildNewEntity(UUID companyId, Map<String, Object> configs) {
        SettingEntity e = new SettingEntity();
        e.setId(UUID.randomUUID());
        e.setKey(SETTINGS_KEY);
        e.setCompanyId(companyId);
        e.setValue(configs);
        Instant now = Instant.now();
        e.setCreatedAt(now);
        e.setUpdatedAt(now);
        return e;
    }

    /**
     * Read system_module_config for a section_name and apply prefix/suffix/increment overrides.
     * Mirrors _getSystemConfig() in documentNumberingService.js.
     * Silently skips if the table doesn't exist or has no matching row.
     *
     * IMPORTANT: We must check table existence BEFORE querying, because a missing-table
     * SQL error marks the current PostgreSQL transaction as ABORTED even if the Java
     * exception is caught. Any subsequent DB operation in the same transaction would
     * then fail with "current transaction is aborted". The information_schema check is
     * a safe read that never aborts a transaction.
     */
    private void applySystemConfigOverride(Map<String, Object> typeConfig, String documentType, UUID companyId) {
        String sectionName = DOC_TYPE_TO_SECTION.get(documentType);
        if (sectionName == null) return;

        try {
            // Guard: verify the table exists before querying it.
            // A missing-relation error inside a transaction poisons the entire transaction
            // in PostgreSQL (SQLState 42P01), making all subsequent operations fail even
            // if the Java exception is caught. The information_schema query is always safe.
            @SuppressWarnings("unchecked")
            List<?> tableExists = entityManager.createNativeQuery(
                    "SELECT 1 FROM information_schema.tables " +
                    "WHERE table_schema = 'public' AND table_name = 'system_module_config'")
                    .getResultList();
            if (tableExists.isEmpty()) {
                log.trace("system_module_config table does not exist yet — skipping numbering override for {}", documentType);
                return;
            }

            String sql = companyId != null
                    ? "SELECT numbering_prefix, numbering_start, numbering_increment, numbering_suffix " +
                      "FROM system_module_config WHERE section_name = :section AND company_id = :companyId LIMIT 1"
                    : "SELECT numbering_prefix, numbering_start, numbering_increment, numbering_suffix " +
                      "FROM system_module_config WHERE section_name = :section LIMIT 1";

            var nq = entityManager.createNativeQuery(sql)
                    .setParameter("section", sectionName);
            if (companyId != null) nq.setParameter("companyId", companyId);

            @SuppressWarnings("unchecked")
            List<Object[]> rows = nq.getResultList();
            if (rows.isEmpty()) return;

            Object[] row = rows.get(0);
            // row[0]=numbering_prefix, row[1]=numbering_start, row[2]=numbering_increment, row[3]=numbering_suffix
            if (row[0] == null || row[1] == null || row[2] == null || row[3] == null) return;

            typeConfig.put("prefix", String.valueOf(row[0]));
            typeConfig.put("suffix", String.valueOf(row[3]));
            int increment = asInt(row[2], 0);
            if (increment >= 1) typeConfig.put("increment_step", increment);

        } catch (Exception e) {
            // Unexpected error — log and skip override so numbering continues with defaults
            log.warn("system_module_config override skipped for {}: {}", documentType, e.getMessage());
        }
    }

    private int asInt(Object val, int fallback) {
        if (val == null) return fallback;
        if (val instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(val)); } catch (Exception e) { return fallback; }
    }

    private String asString(Object val) {
        return val == null ? null : String.valueOf(val);
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    private record DocTypeDefaults(
            String prefix, int currentCounter, int incrementStep, String suffix, int numberLength) {}
}
