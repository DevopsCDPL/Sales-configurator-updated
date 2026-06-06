package com.forge.operations.service;

import com.forge.configurator.entity.ConfiguratorConfigurationEntity;
import com.forge.configurator.repository.ConfiguratorConfigurationRepository;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.EstimateEntity;
import com.forge.operations.entity.InvoiceEntity;
import com.forge.operations.entity.SalesOrderEntity;
import com.forge.operations.repository.EstimateRepository;
import com.forge.operations.repository.InvoiceRepository;
import com.forge.operations.repository.SalesOrderRepository;
import com.forge.configurator.entity.DocumentEntity;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
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
import java.util.stream.Collectors;

/**
 * Java parity of Node.js invoiceController.js.
 */
@Service
public class InvoiceParityService {

    private final InvoiceRepository invoiceRepository;
    private final ProjectRepository projectRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final EstimateRepository estimateRepository;
    private final ConfiguratorConfigurationRepository configuratorRepository;
    private final SequenceNumberingService sequenceNumberingService;
    private final SystemSettingService systemSettingService;
    private final OperationAccessPolicy accessPolicy;
    private final DocumentLifecycleService documentLifecycleService;

    public InvoiceParityService(InvoiceRepository invoiceRepository,
                                ProjectRepository projectRepository,
                                SalesOrderRepository salesOrderRepository,
                                EstimateRepository estimateRepository,
                                ConfiguratorConfigurationRepository configuratorRepository,
                                SequenceNumberingService sequenceNumberingService,
                                SystemSettingService systemSettingService,
                                OperationAccessPolicy accessPolicy,
                                DocumentLifecycleService documentLifecycleService) {
        this.invoiceRepository        = invoiceRepository;
        this.projectRepository        = projectRepository;
        this.salesOrderRepository     = salesOrderRepository;
        this.estimateRepository       = estimateRepository;
        this.configuratorRepository   = configuratorRepository;
        this.sequenceNumberingService = sequenceNumberingService;
        this.systemSettingService     = systemSettingService;
        this.accessPolicy             = accessPolicy;
        this.documentLifecycleService = documentLifecycleService;
    }

    // ── PDF generation ─────────────────────────────────────────────────────────

    public DocumentEntity generateInvoicePdf(UUID invoiceId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        InvoiceEntity inv = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (companyScope != null && !companyScope.equals(inv.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        if (inv.getProjectId() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invoice has no associated project");
        }
        Map<String, Object> invoiceMap = toMap(inv);
        return documentLifecycleService.generateProjectDocument(
                inv.getProjectId(), "invoice", Map.of("invoice", invoiceMap), user);
    }

    public DocumentLifecycleService.DownloadPayload readDocument(UUID documentId, AuthenticatedUser user) {
        return documentLifecycleService.readDocument(documentId, user, false);
    }

    // ── Mapper ────────────────────────────────────────────────────────────────

    public Map<String, Object> toMap(InvoiceEntity inv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",               inv.getId());
        m.put("project_id",       inv.getProjectId());
        m.put("invoice_number",   inv.getInvoiceNumber());
        m.put("invoice_type",     inv.getInvoiceType());
        m.put("invoice_date",     inv.getInvoiceDate() != null ? inv.getInvoiceDate().toString() : null);
        m.put("customer_name",    inv.getCustomerName());
        m.put("customer_address", inv.getCustomerAddress());
        m.put("customer_email",   inv.getCustomerEmail());
        m.put("customer_phone",   inv.getCustomerPhone());
        m.put("client_po_number", inv.getClientPoNumber());
        m.put("project_name",     inv.getProjectName());
        m.put("revision",         inv.getRevision());
        m.put("line_items",       inv.getLineItems()        == null ? List.of() : inv.getLineItems());
        m.put("tax_type",         inv.getTaxType());
        m.put("tax_percent",      inv.getTaxPercent());
        m.put("payment_terms",    inv.getPaymentTerms());
        m.put("notes",            inv.getNotes());
        m.put("terms_conditions", inv.getTermsConditions()  == null ? List.of() : inv.getTermsConditions());
        m.put("shipping_charges", inv.getShippingCharges());
        m.put("subtotal",         inv.getSubtotal());
        m.put("tax_amount",       inv.getTaxAmount());
        m.put("final_total",      inv.getFinalTotal());
        m.put("status",           inv.getStatus());
        m.put("company_id",       inv.getCompanyId());
        m.put("created_at",       inv.getCreatedAt());
        m.put("updated_at",       inv.getUpdatedAt());
        return m;
    }

    // ── Auto-populate ─────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public Map<String, Object> getAutoPopulatedData(UUID projectId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        ProjectEntity project = resolveProject(projectId, companyScope);

        SalesOrderEntity so = salesOrderRepository.findByProjectId(projectId).orElse(null);

        // ── Configurator config → stepLines ──────────────────────────────────
        List<ConfiguratorConfigurationEntity> configs =
                configuratorRepository.findByProjectIdAndDeletedAtIsNullOrderByCreatedAtAsc(projectId);

        // Best estimate for price enrichment
        List<EstimateEntity> estimates = estimateRepository.findAllByProjectIdOrderByRevisionAsc(projectId);
        EstimateEntity estimate = pickBestEstimate(estimates, project.getSelectedRevision());

        // Build a price lookup map: partNumber → { unit_price, line_total }
        Map<String, Map<String, Object>> priceByPartNumber = buildPriceLookup(estimate);

        // Build line items from configurator stepLines
        List<Map<String, Object>> lineItems = buildLineItemsFromConfig(configs, priceByPartNumber);

        // Fall back to estimate-only if no configurator data found
        if (lineItems.isEmpty()) {
            lineItems = buildLineItemsFromEstimate(estimate);
        }

        // Quantity shipped from packages_json
        int totalShipped = 0;
        if (project.getPackagesJson() != null) {
            for (Map<String, Object> pkg : project.getPackagesJson()) {
                Object idx = pkg.get("selected_job_indices");
                if (idx instanceof List<?> l) totalShipped += l.size();
            }
        }

        UUID companyId = companyScope != null ? companyScope : project.getCompanyId();
        String invoiceNumber = sequenceNumberingService.generatePreview(
                SequenceNumberingService.COMMERCIAL_INVOICE_NUMBER, companyId);

        Map<String, Object> sysSettings = safeGetSystemSettings(companyId);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("invoice_number",   invoiceNumber);
        data.put("invoice_date",     LocalDate.now(ZoneOffset.UTC).toString());
        data.put("customer_name",    "");
        data.put("customer_address", "");
        data.put("customer_email",   "");
        data.put("customer_phone",   "");
        data.put("client_po_number", so != null && so.getCustomerPoNumber() != null ? so.getCustomerPoNumber() : "");
        data.put("client_po_date",   so != null && so.getAcceptedDate() != null
                ? so.getAcceptedDate().atZone(ZoneOffset.UTC).toLocalDate().toString() : "");
        data.put("project_name",     project.getProjectName() != null ? project.getProjectName() : "");
        data.put("revision",         estimate != null ? "R" + estimate.getRevision() : "");
        data.put("line_items",       lineItems);
        data.put("quantity_shipped", totalShipped > 0 ? totalShipped
                : lineItems.stream().mapToInt(i -> toInt(i.get("quantity"))).sum());
        data.put("payment_terms",    orDefault(sysSettings.get("invoicePaymentTerms"),
                "Net 30 days from invoice date. Payment via bank transfer."));
        data.put("notes",            orDefault(sysSettings.get("invoiceNotes"), "Thank you for your business."));
        data.put("terms_conditions", sysSettings.getOrDefault("invoiceTerms", ""));
        data.put("tax_type",         "Exempt");
        data.put("tax_percent",      0);
        data.put("shipping_charges", 0);
        data.put("status",           "Draft");
        return data;
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getByProjectId(UUID projectId, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        resolveProject(projectId, companyScope);
        return invoiceRepository.findAllByProjectIdOrderByCreatedAtDesc(projectId)
                .stream().map(this::toMap).toList();
    }

    public List<Map<String, Object>> getAll(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<InvoiceEntity> invoices = companyScope == null
                ? invoiceRepository.findAll()
                : invoiceRepository.findAllByCompanyIdOrderByCreatedAtDesc(companyScope);
        return invoices.stream().map(this::toMap).toList();
    }

    public Map<String, Object> getById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        InvoiceEntity inv = invoiceRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (companyScope != null && !companyScope.equals(inv.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        return toMap(inv);
    }

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> create(Map<String, Object> body, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveWriteCompanyScope(user);

        if (body.get("project_id") != null) {
            resolveProject(toUUID(body.get("project_id")), companyScope);
        }

        String invoiceType = strVal(body.get("invoice_type"));
        String docType = invoiceDocType(invoiceType);
        String invoiceNumber = generateUniqueNumber(docType, companyScope);

        List<Map<String, Object>> lineItems = normalizeLineItems(
                (List<Map<String, Object>>) body.get("line_items"));
        BigDecimal subtotal     = sumLineTotals(lineItems);
        BigDecimal taxPercent   = "Exempt".equals(strVal(body.get("tax_type"))) ? BigDecimal.ZERO
                : toBigDecimal(body.get("tax_percent"));
        BigDecimal taxAmount    = subtotal.multiply(taxPercent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal shipping     = toBigDecimal(body.get("shipping_charges"));
        BigDecimal finalTotal   = subtotal.add(taxAmount).add(shipping);

        Map<String, Object> sysSettings = safeGetSystemSettings(companyScope);

        InvoiceEntity inv = new InvoiceEntity();
        inv.setId(UUID.randomUUID());
        inv.setProjectId(body.get("project_id") != null ? toUUID(body.get("project_id")) : null);
        inv.setCompanyId(companyScope);
        inv.setInvoiceNumber(invoiceNumber);
        inv.setInvoiceType(invoiceType != null ? invoiceType : "Commercial");
        inv.setInvoiceDate(parseLocalDate(strVal(body.get("invoice_date"))));
        inv.setCustomerName(strVal(body.get("customer_name")));
        inv.setCustomerAddress(strVal(body.get("customer_address")));
        inv.setCustomerEmail(strVal(body.get("customer_email")));
        inv.setCustomerPhone(strVal(body.get("customer_phone")));
        inv.setClientPoNumber(strVal(body.get("client_po_number")));
        inv.setProjectName(strVal(body.get("project_name")));
        inv.setRevision(strVal(body.get("revision")));
        inv.setLineItems(lineItems);
        inv.setTaxType(strVal(body.get("tax_type")) != null ? strVal(body.get("tax_type")) : "Exempt");
        inv.setTaxPercent(taxPercent);
        inv.setPaymentTerms(strVal(body.get("payment_terms")) != null ? strVal(body.get("payment_terms"))
                : orDefault(sysSettings.get("invoicePaymentTerms"),
                "Net 30 days from invoice date. Payment via bank transfer."));
        inv.setNotes(strVal(body.get("notes")) != null ? strVal(body.get("notes"))
                : orDefault(sysSettings.get("invoiceNotes"), "Thank you for your business."));
        inv.setTermsConditions((List<Map<String, Object>>) body.get("terms_conditions"));
        inv.setShippingCharges(shipping);
        inv.setSubtotal(subtotal);
        inv.setTaxAmount(taxAmount);
        inv.setFinalTotal(finalTotal);
        inv.setStatus(strVal(body.get("status")) != null ? strVal(body.get("status")) : "Draft");
        inv.setCreatedAt(Instant.now());
        inv.setUpdatedAt(Instant.now());

        return toMap(invoiceRepository.save(inv));
    }

    @SuppressWarnings("unchecked")
    @Transactional
    public Map<String, Object> update(UUID id, Map<String, Object> body, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        InvoiceEntity inv = invoiceRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (companyScope != null && !companyScope.equals(inv.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }

        // Apply patches — only update fields present in the body
        if (body.containsKey("invoice_type"))     inv.setInvoiceType(strVal(body.get("invoice_type")));
        if (body.containsKey("invoice_date"))     inv.setInvoiceDate(parseLocalDate(strVal(body.get("invoice_date"))));
        if (body.containsKey("customer_name"))    inv.setCustomerName(strVal(body.get("customer_name")));
        if (body.containsKey("customer_address")) inv.setCustomerAddress(strVal(body.get("customer_address")));
        if (body.containsKey("customer_email"))   inv.setCustomerEmail(strVal(body.get("customer_email")));
        if (body.containsKey("customer_phone"))   inv.setCustomerPhone(strVal(body.get("customer_phone")));
        if (body.containsKey("client_po_number")) inv.setClientPoNumber(strVal(body.get("client_po_number")));
        if (body.containsKey("project_name"))     inv.setProjectName(strVal(body.get("project_name")));
        if (body.containsKey("revision"))         inv.setRevision(strVal(body.get("revision")));
        if (body.containsKey("payment_terms"))    inv.setPaymentTerms(strVal(body.get("payment_terms")));
        if (body.containsKey("notes"))            inv.setNotes(strVal(body.get("notes")));
        if (body.containsKey("status"))           inv.setStatus(strVal(body.get("status")));
        if (body.containsKey("terms_conditions"))
            inv.setTermsConditions((List<Map<String, Object>>) body.get("terms_conditions"));

        // Recalculate totals from line items
        List<Map<String, Object>> lineItems = body.containsKey("line_items")
                ? normalizeLineItems((List<Map<String, Object>>) body.get("line_items"))
                : inv.getLineItems();
        if (body.containsKey("line_items")) inv.setLineItems(lineItems);

        BigDecimal subtotal   = sumLineTotals(lineItems != null ? lineItems : List.of());
        String taxType        = body.containsKey("tax_type") ? strVal(body.get("tax_type")) : inv.getTaxType();
        BigDecimal taxPercent = "Exempt".equals(taxType) ? BigDecimal.ZERO
                : body.containsKey("tax_percent") ? toBigDecimal(body.get("tax_percent")) : inv.getTaxPercent();
        BigDecimal taxAmount  = subtotal.multiply(taxPercent != null ? taxPercent : BigDecimal.ZERO)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal shipping   = body.containsKey("shipping_charges")
                ? toBigDecimal(body.get("shipping_charges"))
                : (inv.getShippingCharges() != null ? inv.getShippingCharges() : BigDecimal.ZERO);

        if (body.containsKey("tax_type"))  inv.setTaxType(taxType);
        inv.setTaxPercent(taxPercent);
        inv.setSubtotal(subtotal);
        inv.setTaxAmount(taxAmount);
        inv.setShippingCharges(shipping);
        inv.setFinalTotal(subtotal.add(taxAmount).add(shipping));
        inv.setUpdatedAt(Instant.now());

        return toMap(invoiceRepository.save(inv));
    }

    @Transactional
    public void delete(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        InvoiceEntity inv = invoiceRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invoice not found"));
        if (companyScope != null && !companyScope.equals(inv.getCompanyId())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Access denied");
        }
        invoiceRepository.delete(inv);
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    public Map<String, Object> getAnalyticsMetrics(AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        List<InvoiceEntity> all = companyScope == null
                ? invoiceRepository.findAll()
                : invoiceRepository.findAllByCompanyIdOrderByCreatedAtDesc(companyScope);

        long total     = all.size();
        long draft     = all.stream().filter(i -> "Draft".equals(i.getStatus())).count();
        long sent      = all.stream().filter(i -> "Sent".equals(i.getStatus())).count();
        long paid      = all.stream().filter(i -> "Paid".equals(i.getStatus())).count();
        long cancelled = all.stream().filter(i -> "Cancelled".equals(i.getStatus())).count();

        BigDecimal totalRevenue = all.stream()
                .filter(i -> "Paid".equals(i.getStatus()))
                .map(i -> i.getFinalTotal() != null ? i.getFinalTotal() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outstanding = all.stream()
                .filter(i -> "Sent".equals(i.getStatus()) || "Draft".equals(i.getStatus()))
                .map(i -> i.getFinalTotal() != null ? i.getFinalTotal() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total_invoices",       total);
        m.put("draft_count",          draft);
        m.put("sent_count",           sent);
        m.put("paid_count",           paid);
        m.put("cancelled_count",      cancelled);
        m.put("total_revenue",        totalRevenue);
        m.put("outstanding_amount",   outstanding);
        return m;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private ProjectEntity resolveProject(UUID projectId, UUID companyScope) {
        ProjectEntity p = companyScope == null
                ? projectRepository.findByIdAndDeletedAtIsNull(projectId).orElse(null)
                : projectRepository.findByIdAndCompanyIdAndDeletedAtIsNull(projectId, companyScope).orElse(null);
        if (p == null) throw new ApiException(HttpStatus.NOT_FOUND, "Project not found");
        return p;
    }

    private String invoiceDocType(String invoiceType) {
        String t = invoiceType == null ? "" : invoiceType.toLowerCase();
        if (t.contains("tax"))      return SequenceNumberingService.TAX_INVOICE_NUMBER;
        if (t.contains("proforma")) return SequenceNumberingService.PROFORMA_INVOICE_NUMBER;
        return SequenceNumberingService.COMMERCIAL_INVOICE_NUMBER;
    }

    /** Generate a number, retrying up to 5 times if a collision occurs. */
    @Transactional
    private String generateUniqueNumber(String docType, UUID companyId) {
        for (int i = 0; i < 5; i++) {
            String num = sequenceNumberingService.generateNumber(docType, companyId);
            boolean exists = companyId == null
                    ? invoiceRepository.existsByInvoiceNumber(num)
                    : invoiceRepository.existsByInvoiceNumberAndCompanyId(num, companyId);
            if (!exists) return num;
        }
        // Last resort: append timestamp suffix
        return sequenceNumberingService.generateNumber(docType, companyId) + "-" + System.currentTimeMillis() % 10000;
    }

    private EstimateEntity pickBestEstimate(List<EstimateEntity> estimates, Integer selectedRevision) {
        if (estimates == null || estimates.isEmpty()) return null;
        if (selectedRevision != null) {
            return estimates.stream()
                    .filter(e -> selectedRevision.equals(e.getRevision()))
                    .findFirst()
                    .orElse(estimates.get(estimates.size() - 1));
        }
        return estimates.get(estimates.size() - 1);
    }

    private List<Map<String, Object>> buildLineItemsFromEstimate(EstimateEntity estimate) {
        if (estimate == null || estimate.getCustomParts() == null) return List.of();
        return estimate.getCustomParts().stream().map(part -> {
            Map<String, Object> item = new LinkedHashMap<>();
            Object drawingNo = part.get("drawing_part_no");
            Object desc      = part.get("job_description");
            item.put("part",        drawingNo != null ? drawingNo.toString() : (desc != null ? desc.toString() : ""));
            item.put("description", desc != null ? desc.toString() : "");
            double qty   = toDouble(part.get("quantity"));
            double price = toDouble(part.get("job_cost_per_unit"));
            // Prefer total_cost when available
            double lineTotal = toDouble(part.get("total_cost"));
            if (lineTotal == 0) lineTotal = qty * price;
            item.put("quantity",   qty);
            item.put("unit_price", price);
            item.put("line_total", lineTotal);
            return (Map<String, Object>) item;
        }).collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> normalizeLineItems(List<Map<String, Object>> items) {
        if (items == null) return List.of();
        return items.stream().map(raw -> {
            Map<String, Object> m = new LinkedHashMap<>(raw);
            double qty   = toDouble(m.get("quantity"));
            double price = toDouble(m.get("unit_price"));
            m.put("line_total", BigDecimal.valueOf(qty * price).setScale(2, RoundingMode.HALF_UP));
            return m;
        }).collect(Collectors.toList());
    }

    private BigDecimal sumLineTotals(List<Map<String, Object>> items) {
        if (items == null) return BigDecimal.ZERO;
        return items.stream()
                .map(i -> toBigDecimal(i.get("line_total")))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> safeGetSystemSettings(UUID companyId) {
        try {
            return systemSettingService.getSystemSettings(companyId);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String strVal(Object v) {
        return v != null ? v.toString() : null;
    }

    private double toDouble(Object v) {
        if (v == null) return 0.0;
        try { return Double.parseDouble(v.toString()); } catch (NumberFormatException e) { return 0.0; }
    }

    private int toInt(Object v) {
        if (v == null) return 0;
        try { return (int) Double.parseDouble(v.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private BigDecimal toBigDecimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        try { return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP); }
        catch (Exception e) { return BigDecimal.ZERO; }
    }

    private UUID toUUID(Object v) {
        if (v == null) return null;
        try { return UUID.fromString(v.toString()); } catch (Exception e) { return null; }
    }

    private String orDefault(Object val, String def) {
        return (val != null && !val.toString().isBlank()) ? val.toString() : def;
    }

    private LocalDate parseLocalDate(String s) {
        if (s == null || s.isBlank()) return LocalDate.now(ZoneOffset.UTC);
        try { return LocalDate.parse(s); } catch (DateTimeParseException e) { return LocalDate.now(ZoneOffset.UTC); }
    }

    /**
     * Builds a lookup map from partNumber → price info
     * sourced from estimate.customParts[].drawing_part_no
     */
    private Map<String, Map<String, Object>> buildPriceLookup(EstimateEntity estimate) {
        Map<String, Map<String, Object>> lookup = new HashMap<>();
        if (estimate == null || estimate.getCustomParts() == null) return lookup;
        for (Map<String, Object> part : estimate.getCustomParts()) {
            String partNo = strVal(part.get("drawing_part_no"));
            if (partNo == null || partNo.isBlank()) continue;
            double qty       = toDouble(part.get("quantity"));
            double unitPrice = toDouble(part.get("job_cost_per_unit"));
            double lineTotal = toDouble(part.get("total_cost"));
            if (lineTotal == 0) lineTotal = qty * unitPrice;
            Map<String, Object> prices = new LinkedHashMap<>();
            prices.put("unit_price", unitPrice);
            prices.put("line_total", lineTotal);
            lookup.put(partNo, prices);
        }
        return lookup;
    }

    /**
     * Flattens all stepLines across all configurator configs for the project.
     * Each step key (e.g. "bussing") becomes a group of line items.
     * Prices are enriched from the estimate lookup by partNumber.
     *
     * stepLines structure:
     * {
     *   "bussing": [ { name, quantity, partNumber, componentId }, ... ],
     *   "wiring":  [ ... ]
     * }
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildLineItemsFromConfig(
            List<ConfiguratorConfigurationEntity> configs,
            Map<String, Map<String, Object>> priceByPartNumber) {

        List<Map<String, Object>> result = new ArrayList<>();

        for (ConfiguratorConfigurationEntity config : configs) {
            if (config.getConfigData() == null) continue;

            Object stepLinesRaw = config.getConfigData().get("stepLines");
            if (!(stepLinesRaw instanceof Map<?, ?> stepLinesMap)) continue;

            // Iterate each step key: "bussing", "wiring", etc.
            for (Map.Entry<?, ?> stepEntry : stepLinesMap.entrySet()) {
                String stepName = strVal(stepEntry.getKey());
                if (!(stepEntry.getValue() instanceof List<?> components)) continue;

                for (Object compRaw : components) {
                    if (!(compRaw instanceof Map<?, ?> comp)) continue;

                    String partNumber = strVal(comp.get("partNumber"));
                    String name       = strVal(comp.get("name"));
                    double qty        = toDouble(comp.get("quantity"));

                    // Enrich price from estimate lookup
                    double unitPrice = 0.0;
                    double lineTotal = 0.0;
                    if (partNumber != null && priceByPartNumber.containsKey(partNumber)) {
                        Map<String, Object> prices = priceByPartNumber.get(partNumber);
                        unitPrice = toDouble(prices.get("unit_price"));
                        lineTotal = toDouble(prices.get("line_total"));
                    }
                    // Recalculate if line_total missing
                    if (lineTotal == 0 && unitPrice > 0) lineTotal = qty * unitPrice;

                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("part",        partNumber != null ? partNumber : "");
                    item.put("description", name != null ? name : "");
                    item.put("category",    stepName);          // e.g. "bussing" — useful for grouping in PDF
                    item.put("component_id", strVal(comp.get("componentId")));
                    item.put("quantity",    qty);
                    item.put("unit_price",  unitPrice);
                    item.put("line_total",  BigDecimal.valueOf(lineTotal).setScale(2, RoundingMode.HALF_UP));
                    result.add(item);
                }
            }
        }
        return result;
    }
}
