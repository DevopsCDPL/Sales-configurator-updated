package com.forge.configurator.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "configurator_quotations")
public class ConfiguratorQuotationEntity {
    @Id
    private UUID id;

    @Column(name = "quotation_number")
    private String quotationNumber;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "configuration_id")
    private UUID configurationId;

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "issued_at")
    private Instant issuedAt;

    @Column(name = "valid_until")
    private Instant validUntil;

    private String status;
    private Boolean sold;

    private BigDecimal subtotal;

    @Column(name = "labour_total")
    private BigDecimal labourTotal;

    @Column(name = "material_total")
    private BigDecimal materialTotal;

    @Column(name = "overhead_total")
    private BigDecimal overheadTotal;

    @Column(name = "margin_pct")
    private BigDecimal marginPct;

    @Column(name = "margin_total")
    private BigDecimal marginTotal;

    @Column(name = "tax_total")
    private BigDecimal taxTotal;

    @Column(name = "grand_total")
    private BigDecimal grandTotal;

    private String currency;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "bom_spec", columnDefinition = "jsonb")
    private Map<String, Object> bomSpec;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "pricing_spec", columnDefinition = "jsonb")
    private Map<String, Object> pricingSpec;

    private String terms;
    private String notes;

    @Column(name = "pdf_document_id")
    private UUID pdfDocumentId;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
