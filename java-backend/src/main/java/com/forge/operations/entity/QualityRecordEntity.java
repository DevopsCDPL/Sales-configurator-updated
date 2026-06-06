package com.forge.operations.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "quality_records")
public class QualityRecordEntity {
    @Id
    private UUID id;

    @Column(name = "project_id")
    private UUID projectId;

    @Column(name = "dimensional_verification")
    private Boolean dimensionalVerification;

    @Column(name = "visual_inspection")
    private Boolean visualInspection;

    @Column(name = "hardness_testing")
    private Boolean hardnessTesting;

    @Column(name = "ndt_testing")
    private Boolean ndtTesting;

    @Column(name = "pressure_testing")
    private Boolean pressureTesting;

    @Column(name = "mtr_verification")
    private Boolean mtrVerification;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inspection_data_json", columnDefinition = "jsonb")
    private Map<String, Object> inspectionDataJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inspection_checklist", columnDefinition = "jsonb")
    private List<Map<String, Object>> inspectionChecklist;

    @Column(name = "inspector_notes")
    private String inspectorNotes;

    @Column(name = "overall_result")
    private String overallResult;

    @Column(name = "is_finalized")
    private Boolean isFinalized;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "report_files", columnDefinition = "jsonb")
    private List<Map<String, Object>> reportFiles;

    @Column(name = "coc_generated")
    private Boolean cocGenerated;

    @Column(name = "inspection_date")
    private Instant inspectionDate;

    @Column(name = "inspector_name")
    private String inspectorName;

    private String notes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "job_quality_forms", columnDefinition = "jsonb")
    private List<Map<String, Object>> jobQualityForms;

    @Column(name = "company_id")
    private UUID companyId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
