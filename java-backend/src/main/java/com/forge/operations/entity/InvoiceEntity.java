package com.forge.operations.entity;

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
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "invoices")
public class InvoiceEntity {

    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "invoice_number", nullable = false)
    private String invoiceNumber;

    @Column(name = "invoice_type")
    private String invoiceType;

    @Column(name = "invoice_date")
    private LocalDate invoiceDate;

    @Column(name = "customer_name")
    private String customerName;

    @Column(name = "customer_address")
    private String customerAddress;

    @Column(name = "customer_email")
    private String customerEmail;

    @Column(name = "customer_phone")
    private String customerPhone;

    @Column(name = "client_po_number")
    private String clientPoNumber;

    @Column(name = "project_name")
    private String projectName;

    private String revision;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "line_items", columnDefinition = "jsonb")
    private List<Map<String, Object>> lineItems;

    @Column(name = "tax_type")
    private String taxType;

    @Column(name = "tax_percent")
    private BigDecimal taxPercent;

    @Column(name = "payment_terms")
    private String paymentTerms;

    private String notes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "terms_conditions", columnDefinition = "jsonb")
    private List<Map<String, Object>> termsConditions;

    @Column(name = "shipping_charges")
    private BigDecimal shippingCharges;

    private BigDecimal subtotal;

    @Column(name = "tax_amount")
    private BigDecimal taxAmount;

    @Column(name = "final_total")
    private BigDecimal finalTotal;

    private String status;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
