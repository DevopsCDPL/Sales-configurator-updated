package com.forge.configurator.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "projects")
public class ProjectEntity {
    @Id
    private UUID id;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "client_id")
    private UUID clientId;

    @Column(name = "prepared_by")
    private UUID preparedBy;

    @Column(name = "company_id")
    private UUID companyId;

    private Integer revision;

    @Column(name = "status", columnDefinition = "enum_projects_status")
    @ColumnTransformer(write = "?::enum_projects_status")
    private String status;

    @Column(name = "ship_to_address")
    private String shipToAddress;

    @Column(name = "material_type")
    private String materialType;

    @Column(name = "material_grade")
    private String materialGrade;

    @Column(name = "heat_number")
    private String heatNumber;

    @Column(name = "material_supplied_by", columnDefinition = "enum_projects_material_supplied_by")
    @ColumnTransformer(write = "?::enum_projects_material_supplied_by")
    private String materialSuppliedBy;

    private Integer quantity;

    @Column(name = "quotation_number")
    private String quotationNumber;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quote_info", columnDefinition = "jsonb")
    private Map<String, Object> quoteInfo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "packages_json", columnDefinition = "jsonb")
    private List<Map<String, Object>> packagesJson;

    @Column(name = "po_number")
    private String poNumber;

    @Column(name = "part_number")
    private String partNumber;

    @Column(name = "selected_revision")
    private Integer selectedRevision;

    @Column(name = "production_traveler_type")
    private String productionTravelerType;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "deleted_by")
    private UUID deletedBy;

    @Column(name = "project_number")
    private String projectNumber;

    @Column(name = "dispatch_date")
    private Instant dispatchDate;

    @Column(name = "tracking_number")
    private String trackingNumber;

    @Column(name = "shipment_method")
    private String shipmentMethod;

    @Column(name = "packaging_details")
    private String packagingDetails;

    @Column(name = "logistics_notes")
    private String logisticsNotes;

    @Column(name = "carrier")
    private String carrier;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
