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
@Table(name = "mgmt_procurement_pos")
public class MgmtProcurementPoEntity {

    @Id
    private UUID id;

    @Column(name = "po_number", length = 50, nullable = false)
    private String poNumber;

    @Column(name = "rfq_id", nullable = false)
    private UUID rfqId;

    @Column(name = "vendor_id", nullable = false)
    private UUID vendorId;

    @Column(name = "po_date", nullable = false)
    private LocalDate poDate;

    // ENUM in DB: 'Exempt','5%','12%','18%'
    @Column(name = "tax_type", columnDefinition = "varchar(20)")
    private String taxType = "Exempt";

    // ── Snapshot from RFQ ──────────────────────────────────────────────
    @Column(name = "part_name", length = 300)
    private String partName;

    @Column(name = "material_category", length = 50)
    private String materialCategory;

    @Column(name = "material_grade", length = 200)
    private String materialGrade;

    @Column(name = "quantity", precision = 12, scale = 2)
    private BigDecimal quantity;

    @Column(name = "weight_per_piece")
    private Double weightPerPiece;

    @Column(name = "total_weight")
    private Double totalWeight;

    @Column(name = "subtotal", precision = 14, scale = 2)
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(name = "tax_amount", precision = 14, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Column(name = "grand_total", precision = 14, scale = 2)
    private BigDecimal grandTotal = BigDecimal.ZERO;

    @Column(name = "cost_mode", length = 20)
    private String costMode = "unit";

    @Column(name = "unit_cost", precision = 14, scale = 2)
    private BigDecimal unitCost;

    @Column(name = "cost_per_weight", precision = 14, scale = 2)
    private BigDecimal costPerWeight;

    @Column(name = "weight_unit", length = 10)
    private String weightUnit = "KG";

    @Column(name = "line_total", precision = 14, scale = 2)
    private BigDecimal lineTotal = BigDecimal.ZERO;

    // ── Multi-part line items ─────────────────────────────────────────────
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "line_items", columnDefinition = "jsonb")
    private List<Map<String, Object>> lineItems;

    @Column(name = "terms_conditions", columnDefinition = "text")
    private String termsConditions;

    @Column(name = "condition", length = 200)
    private String condition;

    @Column(name = "form", length = 50)
    private String form;

    @Column(name = "shape", length = 50)
    private String shape;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dimensions", columnDefinition = "jsonb")
    private Map<String, Object> dimensions;

    // ENUM in DB: 'Draft','Sent','Ordered','Received'
    @Column(name = "status", columnDefinition = "varchar(20)", nullable = false)
    private String status = "Draft";

    @Column(name = "notes", columnDefinition = "text")
    private String notes;

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
