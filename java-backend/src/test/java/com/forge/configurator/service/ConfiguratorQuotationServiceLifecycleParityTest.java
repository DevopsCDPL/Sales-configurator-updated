package com.forge.configurator.service;

import com.forge.configurator.engine.QuotationCompiler;
import com.forge.configurator.entity.ConfiguratorConfigurationEntity;
import com.forge.configurator.entity.ConfiguratorQuotationEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ConfiguratorBomItemRepository;
import com.forge.configurator.repository.ConfiguratorComponentRepository;
import com.forge.configurator.repository.ConfiguratorConfigurationRepository;
import com.forge.configurator.repository.ConfiguratorLabourLineRepository;
import com.forge.configurator.repository.ConfiguratorQuotationItemRepository;
import com.forge.configurator.repository.ConfiguratorQuotationRepository;
import com.forge.configurator.repository.ConfiguratorSystemParameterRepository;
import com.forge.configurator.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConfiguratorQuotationServiceLifecycleParityTest {

    @Mock
    private ConfiguratorConfigurationRepository configurationRepository;

    @Mock
    private ConfiguratorComponentRepository componentRepository;

    @Mock
    private ConfiguratorBomItemRepository bomItemRepository;

    @Mock
    private ConfiguratorLabourLineRepository labourLineRepository;

    @Mock
    private ConfiguratorQuotationRepository quotationRepository;

    @Mock
    private ConfiguratorQuotationItemRepository quotationItemRepository;

    @Mock
    private ConfiguratorSystemParameterRepository systemParameterRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private PdfQuotationService pdfQuotationService;

    @InjectMocks
    private ConfiguratorQuotationService service;

    @Test
    void regeneratePdfUsesPersistedSnapshotRowsInsteadOfRecompilation() throws Exception {
        UUID quotationId = UUID.randomUUID();
        UUID configurationId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();

        ConfiguratorQuotationEntity quotation = new ConfiguratorQuotationEntity();
        quotation.setId(quotationId);
        quotation.setConfigurationId(configurationId);
        quotation.setProjectId(projectId);
        quotation.setCompanyId(companyId);
        quotation.setQuotationNumber("Q-TEST-001");
        quotation.setSubtotal(new BigDecimal("90.0000"));
        quotation.setMaterialTotal(new BigDecimal("60.0000"));
        quotation.setLabourTotal(new BigDecimal("20.0000"));
        quotation.setOverheadTotal(new BigDecimal("10.0000"));
        quotation.setGrandTotal(new BigDecimal("110.0000"));
        quotation.setMarginTotal(new BigDecimal("20.0000"));
        quotation.setMarginPct(new BigDecimal("0.1818"));

        Map<String, Object> bomRow = new LinkedHashMap<>();
        bomRow.put("component_id", "11111111-1111-1111-1111-111111111111");
        bomRow.put("part_number", "SNAP-ROW-1");
        bomRow.put("description", "Snapshot Row");
        bomRow.put("category", "MANUAL");
        bomRow.put("step_key", "plus_comp");
        bomRow.put("section_number", 2);
        bomRow.put("quantity", 2.0);
        bomRow.put("unit", "ea");
        bomRow.put("unit_cost", 10.0);
        bomRow.put("total_cost", 20.0);
        bomRow.put("meta", Map.of("source", "snapshot"));
        quotation.setBomSpec(Map.of("rows", List.of(bomRow)));

        Map<String, Object> quote = new LinkedHashMap<>();
        quote.put("calc_version", "1.1.0");
        quote.put("totals", Map.of("material_total", 60.0, "section_cost_total", 90.0, "overhead_amount", 10.0, "copper_cost", 0.0));
        quote.put("pricing", Map.of("target_price", 100.0, "rounded_price", 110.0, "actual_profit", 20.0, "actual_gm", 0.1818, "roundup_factor", -1));
        quote.put("schedule", Map.of());
        quote.put("labor_costs", Map.of());
        quote.put("labor_hours", Map.of());
        quote.put("adders_grouped", List.of());
        quote.put("total_line_adders", 0.0);
        quote.put("total_cost", 100.0);
        quote.put("copper_total", 0.0);

        quotation.setPricingSpec(Map.of(
                "quote", quote,
                "labour_summary", Map.of("hours", Map.of(), "costs", Map.of(), "rates", Map.of(), "totals", Map.of("hours_total", 0.0, "cost_total", 0.0))
        ));

        ConfiguratorConfigurationEntity configuration = new ConfiguratorConfigurationEntity();
        configuration.setId(configurationId);
        configuration.setCode("CFG-1");
        configuration.setName("Snapshot Config");

        ProjectEntity project = new ProjectEntity();
        project.setId(projectId);
        project.setProjectName("Snapshot Project");

        when(quotationRepository.findByIdAndCompanyId(quotationId, companyId)).thenReturn(Optional.of(quotation));
        when(configurationRepository.findByIdAndCompanyId(configurationId, companyId)).thenReturn(Optional.of(configuration));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(pdfQuotationService.generateAndStoreQuotationPdf(any(), eq(quotation), eq(configuration), eq(project), eq(companyId), eq(userId)))
            .thenReturn(new PdfQuotationService.PdfResult(documentId, "q.pdf", "C:/tmp/q.pdf", "https://example.test/q.pdf"));
        when(quotationRepository.save(any(ConfiguratorQuotationEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Map<String, Object> result = service.regenerateQuotationPdf(quotationId, companyId, userId);

        ArgumentCaptor<QuotationCompiler.CompiledQuotation> captor = ArgumentCaptor.forClass(QuotationCompiler.CompiledQuotation.class);
        verify(pdfQuotationService).generateAndStoreQuotationPdf(captor.capture(), eq(quotation), eq(configuration), eq(project), eq(companyId), eq(userId));

        QuotationCompiler.CompiledQuotation compiled = captor.getValue();
        assertNotNull(compiled);
        assertEquals(1, compiled.items().size());
        assertEquals("SNAP-ROW-1", compiled.items().getFirst().partNumber());
        assertEquals(2.0, compiled.items().getFirst().quantity(), 1e-9);
        assertFalse(compiled.bomSpec().isEmpty());
        assertEquals(110.0, compiled.totals().get("rounded_price"), 1e-9);

        @SuppressWarnings("unchecked")
        Map<String, Object> pdf = (Map<String, Object>) result.get("pdf");
        assertNotNull(pdf);
        assertEquals(documentId.toString(), String.valueOf(pdf.get("document_id")));
    }
}
