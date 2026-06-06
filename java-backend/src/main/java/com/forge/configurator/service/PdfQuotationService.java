package com.forge.configurator.service;

import com.forge.auth.repository.CompanyRepository;
import com.forge.auth.repository.SettingRepository;
import com.forge.configurator.engine.QuotationCompiler;
import com.forge.configurator.entity.ConfiguratorConfigurationEntity;
import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.DocumentRepository;
import com.forge.operations.service.PdfServiceClient;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

@Service
public class PdfQuotationService {

    private final DocumentRepository documentRepository;
    private final PdfServiceClient pdfServiceClient;
    private final CompanyRepository companyRepository;
    private final SettingRepository settingRepository;

    public PdfQuotationService(DocumentRepository documentRepository,
                               PdfServiceClient pdfServiceClient,
                               CompanyRepository companyRepository,
                               SettingRepository settingRepository) {
        this.documentRepository = documentRepository;
        this.pdfServiceClient   = pdfServiceClient;
        this.companyRepository  = companyRepository;
        this.settingRepository  = settingRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PdfResult generateAndStoreQuotationPdf(
            QuotationCompiler.CompiledQuotation compiled,
            ConfiguratorQuotationEntity quotation,
            ConfiguratorConfigurationEntity configuration,
            ProjectEntity project,
            UUID companyId,
            UUID userId) {

        String quotationNumber = quotation.getQuotationNumber() == null || quotation.getQuotationNumber().isBlank()
                ? "Q-" + quotation.getId().toString().substring(0, 8).toUpperCase()
                : quotation.getQuotationNumber();

        String datePath = LocalDate.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String fileName = "quotation-" + quotationNumber.replaceAll("[^a-zA-Z0-9_-]", "_") + "-" + datePath + ".pdf";

        // ── Company settings (mirror WorkOrderParityService pattern) ─────────
        Map<String, Object> company = new LinkedHashMap<>();
        company.put("id", companyId.toString());
        settingRepository.findByKeyAndCompanyId("company_profile", companyId).ifPresent(s -> {
            Map<String, Object> v = s.getValue();
            if (v != null) v.forEach(company::putIfAbsent);
        });
        companyRepository.findById(companyId).ifPresent(c -> {
            if (c.getLogoData() != null && !c.getLogoData().isBlank())
                company.put("logo_data", c.getLogoData());
            if (c.getName() != null && !c.getName().isBlank())
                company.putIfAbsent("name", c.getName());
            if (c.getAddress() != null && !c.getAddress().isBlank())
                company.putIfAbsent("address", c.getAddress());
            if (c.getPhone() != null && !c.getPhone().isBlank())
                company.putIfAbsent("phone", c.getPhone());
            if (c.getWebsite() != null && !c.getWebsite().isBlank())
                company.putIfAbsent("website", c.getWebsite());
            if (c.getTaxId() != null && !c.getTaxId().isBlank())
                company.putIfAbsent("tax_id", c.getTaxId());
        });

        // ── Quotation metadata ────────────────────────────────────────────────
        Map<String, Object> quotationMeta = new LinkedHashMap<>();
        quotationMeta.put("quotation_number",   quotationNumber);
        quotationMeta.put("customer_name",      quotation.getCustomerName());
        quotationMeta.put("issued_at",          quotation.getIssuedAt() == null ? null : quotation.getIssuedAt().toString());
        quotationMeta.put("project_name",       project == null ? null : project.getProjectName());
        quotationMeta.put("project_number",     project == null ? null : project.getProjectNumber());
        quotationMeta.put("configuration_name", configuration == null ? null : configuration.getName());
        quotationMeta.put("configuration_code", configuration == null ? null : configuration.getCode());
        quotationMeta.put("currency",           quotation.getCurrency() == null ? "USD" : quotation.getCurrency());
        quotationMeta.put("terms",              quotation.getTerms());
        quotationMeta.put("notes",              quotation.getNotes());

        // ── Line items from compiled quotation ────────────────────────────────
        List<Map<String, Object>> items = new ArrayList<>();
        if (compiled != null) {
            for (QuotationCompiler.QuotationItem qi : compiled.items()) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("line_no",     qi.lineNumber());
                item.put("part_number", qi.partNumber());
                item.put("description", qi.description());
                item.put("category",    qi.category());
                item.put("quantity",    qi.quantity());
                item.put("unit",        qi.unit());
                item.put("unit_price",  qi.unitCost());
                item.put("line_total",  qi.totalCost());
                items.add(item);
            }
        }

        // ── Labour summary ────────────────────────────────────────────────────
        Map<String, Object> labour = new LinkedHashMap<>();
        if (compiled != null && compiled.labour() != null) {
            labour.put("hours",  compiled.labour().hours());
            labour.put("costs",  compiled.labour().costs());
            labour.put("rates",  compiled.labour().rates());
            labour.put("totals", compiled.labour().totals());
        }

        // ── Pricing totals ────────────────────────────────────────────────────
        Map<String, Object> totals = compiled != null
                ? new LinkedHashMap<>(compiled.totals())
                : new LinkedHashMap<>();

        // ── R2 context ────────────────────────────────────────────────────────
        Map<String, Object> r2Context = new LinkedHashMap<>();
        r2Context.put("companyId",     companyId.toString());
        r2Context.put("projectId",     project == null ? null : project.getId().toString());
        r2Context.put("companyName",   (String) company.getOrDefault("name", "company"));
        r2Context.put("companyCode",   (String) company.getOrDefault("company_code", ""));
        r2Context.put("projectName",   project == null ? "project" : (project.getProjectName() == null ? "project" : project.getProjectName()));
        r2Context.put("projectNumber", project == null ? "" : (project.getProjectNumber() == null ? "" : project.getProjectNumber()));

        // ── Build payload ─────────────────────────────────────────────────────
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type",      "configurator_quotation");
        payload.put("fileName",  fileName);
        payload.put("company",   company);
        payload.put("quotation", quotationMeta);
        payload.put("items",     items);
        payload.put("labour",    labour);
        payload.put("totals",    totals);
        payload.put("r2Context", r2Context);

        // ── Call pdf-service ──────────────────────────────────────────────────
        Map<String, Object> result = pdfServiceClient.generatePdf(payload);

        String r2Url   = (String) result.get("r2_url");
        String resName = (String) result.getOrDefault("file_name", fileName);
        int    size    = result.get("size") instanceof Number n ? n.intValue() : 0;

        // ── Persist document record ───────────────────────────────────────────
        Instant now = Instant.now();
        DocumentEntity document = new DocumentEntity();
        document.setId(UUID.randomUUID());
        document.setProjectId(quotation.getProjectId());
        document.setModuleType("configurator");
        document.setReferenceId(quotation.getId());
        document.setDocumentType("configurator_quotation");
        document.setDescription("Configurator quotation " + quotationNumber);
        document.setSize(size);
        document.setVersion(1);
        document.setFilePath(r2Url);
        document.setFileName(resName);
        document.setR2Url(r2Url);
        document.setStatus("final");
        document.setFileType("generated");
        document.setGeneratedBy(userId);
        document.setGeneratedAt(now);
        document.setUploadedBy(userId);
        document.setCompanyId(companyId);
        document.setWorkflowStage("configuration/quotation");
        document.setCreatedAt(now);
        document.setUpdatedAt(now);
        documentRepository.save(document);

        return new PdfResult(document.getId(), resName, r2Url, r2Url);
    }

    public record PdfResult(UUID documentId, String fileName, String filePath, String r2Url) {
    }
}
