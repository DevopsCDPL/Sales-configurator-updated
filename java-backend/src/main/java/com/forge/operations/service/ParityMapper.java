package com.forge.operations.service;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.FileManagerFolderEntity;
import com.forge.operations.entity.MaterialEntity;
import com.forge.operations.entity.MaterialStockEntity;
import com.forge.operations.entity.MaterialVendorMappingEntity;
import com.forge.operations.entity.ProjectAnalyticsEntity;
import com.forge.operations.entity.RawMaterialEntity;
import com.forge.operations.entity.StockEntity;
import com.forge.operations.entity.VendorEntity;
import com.forge.operations.entity.VendorMaterialEntity;
import com.forge.operations.repository.ClientRepository;

import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ParityMapper {

    private ClientRepository clientRepository;

    public ParityMapper() {
        this.clientRepository = null;
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ParityMapper(ClientRepository clientRepository) {
        this.clientRepository = clientRepository;
    }

    public Map<String, Object> toClientMap(ClientEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("client_name", row.getClientName());
        map.put("address", row.getAddress());
        map.put("poc_name", row.getPocName());
        map.put("poc_email", row.getPocEmail());
        map.put("poc_phone", row.getPocPhone());
        map.put("tax_id", row.getTaxId());
        map.put("payment_terms", row.getPaymentTerms());
        map.put("position", row.getPosition());
        map.put("notes", row.getNotes());
        map.put("cc_list", row.getCcList() == null ? List.of() : row.getCcList());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("is_active", row.getIsActive());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toVendorMap(VendorEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("vendor_name", row.getVendorName());
        map.put("address", row.getAddress());
        map.put("contact_person", row.getContactPerson());
        map.put("contact_position", row.getContactPosition());
        map.put("contact_email", row.getContactEmail());
        map.put("contact_phone", row.getContactPhone());
        map.put("service_categories", row.getServiceCategories() == null ? List.of() : Arrays.asList(row.getServiceCategories()));
        map.put("rating", row.getRating());
        map.put("tax_id", row.getTaxId());
        map.put("notes", row.getNotes());
        map.put("cc_list", row.getCcList() == null ? List.of() : row.getCcList());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("is_active", row.getIsActive());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toVendorMaterialMap(VendorMaterialEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("vendor_id", row.getVendorId());
        map.put("part_description", row.getPartDescription());
        map.put("material_grade", row.getMaterialGrade());
        map.put("dimension", row.getDimension());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toProjectMap(ProjectEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("project_name", row.getProjectName());
        map.put("client_id", row.getClientId());
        if (clientRepository != null && row.getClientId() != null) {
            clientRepository.findById(row.getClientId()).ifPresent(client -> {
                Map<String, Object> clientMap = new LinkedHashMap<>();
                clientMap.put("id", client.getId());
                clientMap.put("client_name", client.getClientName());
                clientMap.put("address", client.getAddress());
                map.put("client", clientMap);
            });
        } else {
            map.put("client", null);
        }
        map.put("prepared_by", row.getPreparedBy());
        map.put("company_id", row.getCompanyId());
        map.put("revision", row.getRevision());
        map.put("status", row.getStatus());
        map.put("ship_to_address", row.getShipToAddress());
        map.put("material_type", row.getMaterialType());
        map.put("material_grade", row.getMaterialGrade());
        map.put("heat_number", row.getHeatNumber());
        map.put("material_supplied_by", row.getMaterialSuppliedBy());
        map.put("quantity", row.getQuantity());
        map.put("quotation_number", row.getQuotationNumber());
        map.put("quote_info", row.getQuoteInfo());
        map.put("packages_json", row.getPackagesJson());
        map.put("po_number", row.getPoNumber());
        map.put("part_number", row.getPartNumber());
        map.put("selected_revision", row.getSelectedRevision());
        map.put("production_traveler_type", row.getProductionTravelerType());
        map.put("deleted_at", row.getDeletedAt());
        map.put("deleted_by", row.getDeletedBy());
        map.put("project_number", row.getProjectNumber());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toDocumentMap(DocumentEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("project_id", row.getProjectId());
        map.put("folder_id", row.getFolderId());
        map.put("module_type", row.getModuleType());
        map.put("reference_id", row.getReferenceId());
        map.put("document_type", row.getDocumentType());
        map.put("description", row.getDescription());
        map.put("size", row.getSize());
        map.put("version", row.getVersion());
        map.put("file_path", row.getFilePath());
        map.put("file_name", row.getFileName());
        map.put("status", row.getStatus());
        map.put("file_type", row.getFileType());
        map.put("uploaded_by", row.getUploadedBy());
        map.put("generated_by", row.getGeneratedBy());
        map.put("generated_at", row.getGeneratedAt());
        map.put("company_id", row.getCompanyId());
        map.put("r2_url", row.getR2Url());
        map.put("part_id", row.getPartId());
        map.put("workflow_stage", row.getWorkflowStage());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toFolderMap(FileManagerFolderEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("name", row.getName());
        map.put("slug", row.getSlug());
        map.put("parent_id", row.getParentId());
        map.put("folder_type", row.getFolderType());
        map.put("module_type", row.getModuleType());
        map.put("project_id", row.getProjectId());
        map.put("part_id", row.getPartId());
        map.put("reference_id", row.getReferenceId());
        map.put("company_id", row.getCompanyId());
        map.put("path", row.getPath());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toProjectAnalyticsMap(ProjectAnalyticsEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("project_id", row.getProjectId());
        map.put("part_description", row.getPartDescription());
        map.put("quantity", row.getQuantity());
        map.put("total", row.getTotal());
        map.put("mfg_cost", row.getMfgCost());
        map.put("profit", row.getProfit());
        map.put("materials_unused", row.getMaterialsUnused());
        map.put("raw_material_used", row.getRawMaterialUsed());
        map.put("purchased_dimension", row.getPurchasedDimension());
        map.put("dimension_after_usage", row.getDimensionAfterUsage());
        map.put("qty_available", row.getQtyAvailable());
        map.put("audit_info", row.getAuditInfo());
        map.put("company_id", row.getCompanyId());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toMaterialMap(MaterialEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("material_name", row.getMaterialName());
        map.put("category", row.getCategory());
        map.put("grade", row.getGrade());
        map.put("form", row.getForm());
        map.put("shape", row.getShape());
        map.put("unit", row.getUnit());
        map.put("density", row.getDensity());
        map.put("default_cost", row.getDefaultCost());
        map.put("description", row.getDescription());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("is_active", row.getIsActive());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toMaterialVendorMappingMap(MaterialVendorMappingEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("material_id", row.getMaterialId());
        map.put("vendor_id", row.getVendorId());
        map.put("price_per_unit", row.getPricePerUnit());
        map.put("lead_time", row.getLeadTime());
        map.put("is_default", row.getIsDefault());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toMaterialStockMap(MaterialStockEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("material_id", row.getMaterialId());
        map.put("current_quantity", row.getCurrentQuantity());
        map.put("unit", row.getUnit());
        map.put("company_id", row.getCompanyId());
        map.put("last_updated", row.getLastUpdated());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toRawMaterialMap(RawMaterialEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("material_id", row.getMaterialId());
        map.put("material_category", row.getMaterialCategory());
        map.put("material_grade", row.getMaterialGrade());
        map.put("condition", row.getCondition());
        map.put("density", row.getDensity());
        map.put("form", row.getForm());
        map.put("shape", row.getShape());
        map.put("cost_per_unit", row.getCostPerUnit());
        map.put("cost_unit", row.getCostUnit());
        map.put("dimensions", row.getDimensions());
        map.put("unit_system", row.getUnitSystem());
        map.put("notes", row.getNotes());
        map.put("is_active", row.getIsActive());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }

    public Map<String, Object> toStockMap(StockEntity row) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", row.getId());
        map.put("stock_id", row.getStockId());
        map.put("part_description", row.getPartDescription());
        map.put("material_grade", row.getMaterialGrade());
        map.put("condition", row.getCondition());
        map.put("shape", row.getShape());
        map.put("dimension", row.getDimension());
        map.put("quantity", row.getQuantity());
        map.put("heat_number", row.getHeatNumber());
        map.put("raw_material_id", row.getRawMaterialId());
        map.put("certificate_url", row.getCertificateUrl());
        map.put("company_id", row.getCompanyId());
        map.put("created_by", row.getCreatedBy());
        map.put("created_at", row.getCreatedAt());
        map.put("updated_at", row.getUpdatedAt());
        return map;
    }
}
