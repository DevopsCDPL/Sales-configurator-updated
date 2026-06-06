package com.forge.operations.entity;

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
@Table(name = "work_orders")
public class WorkOrderEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "work_order_number")
    private String workOrderNumber;

    @Column(name = "production_traveler_number")
    private String productionTravelerNumber;

    @Column(name = "release_date")
    private Instant releaseDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "operations", columnDefinition = "jsonb")
    private List<Map<String, Object>> operations;

    private String notes;

    @Column(name = "target_date")
    private Instant targetDate;

    @Column(name = "approved_by")
    private String approvedBy;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quality_requirements", columnDefinition = "jsonb")
    private List<Map<String, Object>> qualityRequirements;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "special_instructions", columnDefinition = "jsonb")
    private List<Map<String, Object>> specialInstructions;

    @Column(name = "status", columnDefinition = "enum_work_orders_status")
    @ColumnTransformer(write = "?::enum_work_orders_status")
    private String status;

    private Integer revision;

    @Column(name = "dimensional_report")
    private Boolean dimensionalReport;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "materials", columnDefinition = "jsonb")
    private List<Map<String, Object>> materials;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "external_processes", columnDefinition = "jsonb")
    private List<Map<String, Object>> externalProcesses;

    @Column(name = "prepared_by")
    private String preparedBy;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "job_ids", columnDefinition = "jsonb")
    private List<Integer> jobIds;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "production_forms", columnDefinition = "jsonb")
    private List<Map<String, Object>> productionForms;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "job_requirements", columnDefinition = "jsonb")
    private Map<String, Object> jobRequirements;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
