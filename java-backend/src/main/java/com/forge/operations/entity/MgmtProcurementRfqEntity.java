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
@Table(name = "mgmt_procurement_rfqs")
public class MgmtProcurementRfqEntity {

    @Id
    private UUID id;

    @Column(name = "rfq_number", length = 50, nullable = false)
    private String rfqNumber;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(name = "need_materials_before")
    private LocalDate needMaterialsBefore;

    @Column(name = "instructions", columnDefinition = "text")
    private String instructions;

    // ENUM in DB: 'Draft','Sent'
    @Column(name = "status", columnDefinition = "varchar(20)", nullable = false)
    private String status = "Draft";

    // ── Part snapshot ──────────────────────────────────────────────────────
    @Column(name = "part_id")
    private UUID partId;

    @Column(name = "part_name", length = 300)
    private String partName;

    @Column(name = "material_category", length = 50)
    private String materialCategory;

    @Column(name = "material_grade", length = 200)
    private String materialGrade;

    @Column(name = "density")
    private Double density;

    @Column(name = "form", length = 50)
    private String form;

    @Column(name = "shape", length = 50)
    private String shape;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dimensions", columnDefinition = "jsonb")
    private Map<String, Object> dimensions;

    @Column(name = "weight_per_piece")
    private Double weightPerPiece;

    @Column(name = "quantity", precision = 12, scale = 2, nullable = false)
    private BigDecimal quantity = BigDecimal.ONE;

    // ── Multi-part line items ─────────────────────────────────────────────
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "line_items", columnDefinition = "jsonb")
    private List<Map<String, Object>> lineItems;

    @Column(name = "vendor_id", nullable = false)
    private UUID vendorId;

    @Column(name = "parent_rfq_id")
    private UUID parentRfqId;

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
