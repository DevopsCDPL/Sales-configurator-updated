package com.forge.operations.service;

import com.forge.auth.entity.UserEntity;
import com.forge.auth.repository.UserRepository;
import com.forge.operations.entity.MgmtProcurementPoEntity;
import com.forge.operations.entity.MgmtProcurementRfqEntity;
import com.forge.operations.entity.RawMaterialEntity;
import com.forge.operations.entity.StockEntity;
import com.forge.operations.entity.VendorEntity;
import com.forge.operations.repository.MgmtProcurementPoRepository;
import com.forge.operations.repository.MgmtProcurementRfqRepository;
import com.forge.operations.repository.RawMaterialRepository;
import com.forge.operations.repository.StockRepository;
import com.forge.operations.repository.VendorRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MgmtProcurementParityService {

    private static final Logger log = LoggerFactory.getLogger(MgmtProcurementParityService.class);

    private final MgmtProcurementRfqRepository rfqRepo;
    private final MgmtProcurementPoRepository poRepo;
    private final VendorRepository vendorRepo;
    private final RawMaterialRepository rawMaterialRepo;
    private final StockRepository stockRepo;
    private final UserRepository userRepo;
    private final OperationAccessPolicy accessPolicy;
    private final SequenceNumberingService sequenceService;

    public MgmtProcurementParityService(MgmtProcurementRfqRepository rfqRepo,
                                         MgmtProcurementPoRepository poRepo,
                                         VendorRepository vendorRepo,
                                         RawMaterialRepository rawMaterialRepo,
                                         StockRepository stockRepo,
                                         UserRepository userRepo,
                                         OperationAccessPolicy accessPolicy,
                                         SequenceNumberingService sequenceService) {
        this.rfqRepo = rfqRepo;
        this.poRepo = poRepo;
        this.vendorRepo = vendorRepo;
        this.rawMaterialRepo = rawMaterialRepo;
        this.stockRepo = stockRepo;
        this.userRepo = userRepo;
        this.accessPolicy = accessPolicy;
        this.sequenceService = sequenceService;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RFQ OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════

    public List<Map<String, Object>> getAllRFQs(Map<String, String> query, AuthenticatedUser user) {
        UUID company = accessPolicy.resolveCompanyScope(user);
        List<MgmtProcurementRfqEntity> rfqs = company != null
                ? rfqRepo.findAllActiveByCompany(company)
                : rfqRepo.findAllActive();

        // Filter by status / search in-memory (tables are typically small)
        String statusFilter = query == null ? null : query.get("status");
        String search = query == null ? null : trim(query.get("search"));

        return rfqs.stream()
                .filter(r -> statusFilter == null || statusFilter.equalsIgnoreCase(r.getStatus()))
                .filter(r -> search == null || (r.getRfqNumber() != null && r.getRfqNumber().toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))))
                .map(r -> toRfqMap(r, true))
                .toList();
    }

    public Map<String, Object> getRFQById(UUID id) {
        MgmtProcurementRfqEntity rfq = rfqRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));
        return toRfqMap(rfq, true);
    }

    @Transactional
    public List<Map<String, Object>> createRFQ(Map<String, Object> body, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        if (companyId == null) throw new ApiException(HttpStatus.BAD_REQUEST, "No active company.");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> itemsRaw = body.containsKey("items")
                ? (List<Map<String, Object>>) body.get("items")
                : Collections.emptyList();

        boolean isLegacySingle = itemsRaw.isEmpty() && body.get("part_id") != null;

        if (!isLegacySingle && itemsRaw.isEmpty())
            throw new ApiException(HttpStatus.BAD_REQUEST, "At least 1 part must be added");

        @SuppressWarnings("unchecked")
        List<String> vendorIdStrings = (List<String>) body.get("vendor_ids");
        if (vendorIdStrings == null || vendorIdStrings.isEmpty())
            throw new ApiException(HttpStatus.BAD_REQUEST, "At least 1 vendor must be selected");

        // Validate vendors exist
        List<UUID> vendorIds = vendorIdStrings.stream().map(UUID::fromString).toList();
        for (UUID vid : vendorIds) {
            vendorRepo.findById(vid)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Vendor not found: " + vid));
        }

        // Build line items
        List<Map<String, Object>> lineItems;
        Map<String, Object> primarySnapshot;

        if (isLegacySingle) {
            UUID partId = UUID.fromString(String.valueOf(body.get("part_id")));
            RawMaterialEntity rm = rawMaterialRepo.findById(partId)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Raw material not found"));
            double qty = parseDouble(body.get("quantity"), 0);
            if (qty <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "Quantity must be greater than 0");
            primarySnapshot = buildRmSnapshot(rm);
            Map<String, Object> li = new LinkedHashMap<>(primarySnapshot);
            li.put("quantity", qty);
            lineItems = List.of(li);
        } else {
            lineItems = new ArrayList<>();
            for (Map<String, Object> item : itemsRaw) {
                if (item.get("part_id") == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Each line item must have a part selected");
                double qty = parseDouble(item.get("quantity"), 0);
                if (qty <= 0) throw new ApiException(HttpStatus.BAD_REQUEST, "Each line item quantity must be greater than 0");
                UUID partId = UUID.fromString(String.valueOf(item.get("part_id")));
                RawMaterialEntity rm = rawMaterialRepo.findById(partId)
                        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Raw material not found: " + partId));
                Map<String, Object> li = new LinkedHashMap<>(buildRmSnapshot(rm));
                li.put("quantity", qty);
                lineItems.add(li);
            }
            primarySnapshot = new LinkedHashMap<>(lineItems.get(0));
            primarySnapshot.remove("quantity");
        }

        double totalQty = lineItems.stream().mapToDouble(li -> parseDouble(li.get("quantity"), 0)).sum();

        List<Map<String, Object>> created = new ArrayList<>();
        for (UUID vendorId : vendorIds) {
            String rfqNumber = generateRfqNumber(companyId);

            Instant now = Instant.now();
            MgmtProcurementRfqEntity rfq = new MgmtProcurementRfqEntity();
            rfq.setId(UUID.randomUUID());
            rfq.setRfqNumber(rfqNumber);
            rfq.setDate(parseDate(body.get("date")));
            rfq.setNeedMaterialsBefore(parseDate(body.get("need_materials_before")));
            rfq.setInstructions(trimOrNull(body.get("instructions")));
            rfq.setStatus("Draft");
            applyPrimarySnapshot(rfq, primarySnapshot);
            rfq.setQuantity(BigDecimal.valueOf(totalQty));
            rfq.setLineItems(lineItems);
            rfq.setVendorId(vendorId);
            rfq.setParentRfqId(null);
            rfq.setCompanyId(companyId);
            rfq.setCreatedBy(user.id());
            rfq.setCreatedAt(now);
            rfq.setUpdatedAt(now);

            created.add(toRfqMap(rfqRepo.save(rfq), true));
        }

        return created;
    }

    @Transactional
    public Map<String, Object> updateRFQ(UUID id, Map<String, Object> body, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        MgmtProcurementRfqEntity rfq = rfqRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));

        if (body.containsKey("date")) rfq.setDate(parseDate(body.get("date")));
        if (body.containsKey("need_materials_before")) rfq.setNeedMaterialsBefore(parseDate(body.get("need_materials_before")));
        if (body.containsKey("instructions")) rfq.setInstructions(trimOrNull(body.get("instructions")));

        // Vendor change
        if (body.get("vendor_id") != null) {
            UUID newVendor = UUID.fromString(String.valueOf(body.get("vendor_id")));
            vendorRepo.findById(newVendor)
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Vendor not found"));
            rfq.setVendorId(newVendor);
        }

        // Items update
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> itemsRaw = body.containsKey("items")
                ? (List<Map<String, Object>>) body.get("items")
                : null;

        if (itemsRaw != null && !itemsRaw.isEmpty()) {
            List<Map<String, Object>> lineItems = new ArrayList<>();
            double totalQty = 0;
            for (Map<String, Object> item : itemsRaw) {
                double qty = parseDouble(item.get("quantity"), 0);
                if (qty <= 0) continue;
                UUID partId = UUID.fromString(String.valueOf(item.get("part_id")));
                RawMaterialEntity rm = rawMaterialRepo.findById(partId)
                        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Raw material not found: " + partId));
                Map<String, Object> li = new LinkedHashMap<>(buildRmSnapshot(rm));
                li.put("quantity", qty);
                lineItems.add(li);
                totalQty += qty;
            }
            if (!lineItems.isEmpty()) {
                rfq.setLineItems(lineItems);
                rfq.setQuantity(BigDecimal.valueOf(totalQty));
                Map<String, Object> primary = new LinkedHashMap<>(lineItems.get(0));
                primary.remove("quantity");
                applyPrimarySnapshot(rfq, primary);
            }
        }

        rfq.setUpdatedAt(Instant.now());
        return toRfqMap(rfqRepo.save(rfq), true);
    }

    @Transactional
    public Map<String, Object> sendRFQ(UUID id) {
        MgmtProcurementRfqEntity rfq = rfqRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));
        if (!"Draft".equals(rfq.getStatus())) throw new ApiException(HttpStatus.BAD_REQUEST, "RFQ has already been sent");
        rfq.setStatus("Sent");
        rfq.setUpdatedAt(Instant.now());
        return toRfqMap(rfqRepo.save(rfq), true);
    }

    @Transactional
    public Map<String, Object> deleteRFQ(UUID id, boolean force, AuthenticatedUser user) {
        MgmtProcurementRfqEntity rfq = rfqRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));

        List<MgmtProcurementPoEntity> linkedPOs = poRepo.findActiveByRfqId(rfq.getId()).map(List::of).orElse(List.of());

        if (!linkedPOs.isEmpty() && !force) {
            String poNumbers = linkedPOs.stream().map(MgmtProcurementPoEntity::getPoNumber).collect(Collectors.joining(", "));
            throw new ApiException(HttpStatus.CONFLICT,
                    "Cannot delete RFQ with existing Purchase Orders: " + poNumbers + ". Use force=true to remove RFQ and its linked POs.");
        }

        Instant now = Instant.now();
        if (!linkedPOs.isEmpty()) {
            for (MgmtProcurementPoEntity po : linkedPOs) {
                po.setDeletedAt(now);
                po.setDeletedBy(user.id());
                poRepo.save(po);
            }
        }

        rfq.setDeletedAt(now);
        rfq.setDeletedBy(user.id());
        rfqRepo.save(rfq);

        return Map.of("message", "RFQ deleted", "deletedPOs", linkedPOs.size());
    }

    @Transactional
    public Map<String, Object> copyRFQ(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        MgmtProcurementRfqEntity source = rfqRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        String rfqNumber = generateRfqNumber(companyId);

        Instant now = Instant.now();
        MgmtProcurementRfqEntity copy = new MgmtProcurementRfqEntity();
        copy.setId(UUID.randomUUID());
        copy.setRfqNumber(rfqNumber);
        copy.setDate(LocalDate.now());
        copy.setNeedMaterialsBefore(source.getNeedMaterialsBefore());
        copy.setInstructions(source.getInstructions());
        copy.setStatus("Draft");
        copy.setPartId(source.getPartId());
        copy.setPartName(source.getPartName());
        copy.setMaterialCategory(source.getMaterialCategory());
        copy.setMaterialGrade(source.getMaterialGrade());
        copy.setDensity(source.getDensity());
        copy.setForm(source.getForm());
        copy.setShape(source.getShape());
        copy.setDimensions(source.getDimensions());
        copy.setWeightPerPiece(source.getWeightPerPiece());
        copy.setQuantity(source.getQuantity());
        copy.setLineItems(source.getLineItems());
        copy.setVendorId(source.getVendorId());
        copy.setParentRfqId(null);
        copy.setCompanyId(companyId);
        copy.setCreatedBy(user.id());
        copy.setCreatedAt(now);
        copy.setUpdatedAt(now);

        return toRfqMap(rfqRepo.save(copy), true);
    }

    @Transactional
    public Map<String, Object> bulkDeleteRFQs(List<UUID> ids, boolean force, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        List<MgmtProcurementRfqEntity> rfqs = rfqRepo.findAllById(ids).stream()
                .filter(r -> r.getDeletedAt() == null).toList();
        if (rfqs.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "No RFQs found");

        List<UUID> rfqIds = rfqs.stream().map(MgmtProcurementRfqEntity::getId).toList();
        List<MgmtProcurementPoEntity> linkedPOs = poRepo.findActiveByRfqIdIn(rfqIds);

        List<MgmtProcurementRfqEntity> withPOs = rfqs.stream()
                .filter(r -> linkedPOs.stream().anyMatch(p -> p.getRfqId().equals(r.getId())))
                .toList();

        if (!withPOs.isEmpty() && !force) {
            String numbers = withPOs.stream().map(MgmtProcurementRfqEntity::getRfqNumber).collect(Collectors.joining(", "));
            throw new ApiException(HttpStatus.CONFLICT,
                    "Cannot delete " + withPOs.size() + " RFQ(s) that have Purchase Orders: " + numbers + ". Use force=true.");
        }

        Instant now = Instant.now();
        if (!linkedPOs.isEmpty()) {
            for (MgmtProcurementPoEntity po : linkedPOs) {
                po.setDeletedAt(now);
                po.setDeletedBy(user.id());
            }
            poRepo.saveAll(linkedPOs);
        }

        rfqRepo.softDeleteByIdIn(rfqIds, user.id());
        return Map.of("message", rfqs.size() + " RFQ(s) deleted", "deleted", rfqs.size());
    }

    // ── stub email / pdf ──────────────────────────────────────────────────

    public Map<String, Object> sendRFQEmail(UUID id) {
        rfqRepo.findActiveById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RFQ not found"));
        return Map.of("message", "Email functionality not available in this deployment");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PO OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════

    public List<Map<String, Object>> getAllPOs(Map<String, String> query, AuthenticatedUser user) {
        UUID company = accessPolicy.resolveCompanyScope(user);
        List<MgmtProcurementPoEntity> pos = company != null
                ? poRepo.findAllActiveByCompany(company)
                : poRepo.findAllActive();

        String statusFilter = query == null ? null : query.get("status");
        String search = query == null ? null : trim(query.get("search"));

        return pos.stream()
                .filter(p -> statusFilter == null || statusFilter.equalsIgnoreCase(p.getStatus()))
                .filter(p -> search == null || (p.getPoNumber() != null && p.getPoNumber().toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))))
                .map(p -> toPoMap(p, true))
                .toList();
    }

    public Map<String, Object> getPOById(UUID id) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Purchase Order not found"));
        return toPoMap(po, true);
    }

    @Transactional
    public Map<String, Object> createPO(Map<String, Object> body, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        if (companyId == null) throw new ApiException(HttpStatus.BAD_REQUEST, "No active company.");

        UUID rfqId = UUID.fromString(String.valueOf(body.get("rfq_id")));
        MgmtProcurementRfqEntity rfq = rfqRepo.findActiveById(rfqId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "RFQ not found"));
        if (!"Sent".equals(rfq.getStatus()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "PO can only be created from Sent RFQs");

        poRepo.findActiveByRfqId(rfqId).ifPresent(p -> { throw new ApiException(HttpStatus.CONFLICT, "A PO already exists for this RFQ"); });

        String poNumber = generatePoNumber(companyId);
        String costMode = strOrDefault(body.get("cost_mode"), "unit");
        String taxType = strOrDefault(body.get("tax_type"), "Exempt");

        // Build line items
        List<Map<String, Object>> rfqLineItems = rfq.getLineItems() != null && !rfq.getLineItems().isEmpty()
                ? rfq.getLineItems()
                : List.of(Map.of(
                        "part_id", rfq.getPartId() != null ? rfq.getPartId().toString() : "",
                        "part_name", orEmpty(rfq.getPartName()),
                        "material_category", orEmpty(rfq.getMaterialCategory()),
                        "material_grade", orEmpty(rfq.getMaterialGrade()),
                        "quantity", rfq.getQuantity() != null ? rfq.getQuantity().doubleValue() : 0.0));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> requestItems = body.containsKey("items")
                ? (List<Map<String, Object>>) body.get("items")
                : Collections.emptyList();

        List<Map<String, Object>> lineItems = new ArrayList<>();
        for (int i = 0; i < rfqLineItems.size(); i++) {
            Map<String, Object> rfqItem = rfqLineItems.get(i);
            Map<String, Object> reqItem = i < requestItems.size() ? requestItems.get(i) : Collections.emptyMap();

            double qty = parseDouble(reqItem.getOrDefault("quantity", rfqItem.get("quantity")), 0);
            double weight = parseDouble(reqItem.get("weight"), 0);
            double unitCost = parseDouble(reqItem.get("unit_cost"), 0);
            double costPerWeight = parseDouble(reqItem.get("cost_per_weight"), 0);
            String weightUnit = strOrDefault(reqItem.get("weight_unit"), "KG");
            double lineTotal = "weight".equals(costMode) ? qty * weight * costPerWeight : qty * unitCost;

            Map<String, Object> li = new LinkedHashMap<>();
            li.put("part_id", rfqItem.get("part_id"));
            li.put("part_name", orEmpty(rfqItem.get("part_name")));
            li.put("material_category", orEmpty(rfqItem.get("material_category")));
            li.put("material_grade", orEmpty(rfqItem.get("material_grade")));
            li.put("condition", orEmpty(reqItem.getOrDefault("condition", rfqItem.get("condition"))));
            li.put("form", orEmpty(reqItem.getOrDefault("form", rfqItem.get("form"))));
            li.put("dimensions", reqItem.getOrDefault("dimensions", rfqItem.get("dimensions")));
            li.put("unit_system", strOrDefault(reqItem.getOrDefault("unit_system", rfqItem.get("unit_system")), "imperial"));
            li.put("quantity", qty);
            li.put("weight", weight);
            li.put("unit_cost", unitCost);
            li.put("cost_per_weight", costPerWeight);
            li.put("weight_unit", weightUnit);
            li.put("line_total", round2(lineTotal));
            lineItems.add(li);
        }

        double subtotal = lineItems.stream().mapToDouble(li -> parseDouble(li.get("line_total"), 0)).sum();
        double totalQty = lineItems.stream().mapToDouble(li -> parseDouble(li.get("quantity"), 0)).sum();
        double totalWeight = lineItems.stream().mapToDouble(li -> parseDouble(li.get("weight"), 0)).sum();
        double taxPct = taxPct(taxType);
        double taxAmount = subtotal * taxPct;
        double grandTotal = subtotal + taxAmount;

        Map<String, Object> primary = lineItems.get(0);

        Instant now = Instant.now();
        MgmtProcurementPoEntity po = new MgmtProcurementPoEntity();
        po.setId(UUID.randomUUID());
        po.setPoNumber(poNumber);
        po.setRfqId(rfq.getId());
        po.setVendorId(rfq.getVendorId());
        po.setPoDate(parseDate(body.get("po_date")));
        po.setTaxType(taxType);
        po.setPartName(strOrNull(primary.get("part_name")));
        po.setMaterialCategory(strOrNull(primary.get("material_category")));
        po.setMaterialGrade(strOrNull(primary.get("material_grade")));
        po.setQuantity(BigDecimal.valueOf(totalQty));
        po.setWeightPerPiece(rfq.getWeightPerPiece());
        po.setTotalWeight(totalWeight);
        po.setCostMode(costMode);
        po.setUnitCost(parseDouble(primary.get("unit_cost"), 0) > 0 ? BigDecimal.valueOf(parseDouble(primary.get("unit_cost"), 0)) : null);
        po.setCostPerWeight(parseDouble(primary.get("cost_per_weight"), 0) > 0 ? BigDecimal.valueOf(parseDouble(primary.get("cost_per_weight"), 0)) : null);
        po.setWeightUnit(strOrDefault(body.get("weight_unit"), "KG"));
        po.setLineTotal(BigDecimal.valueOf(round2(subtotal)));
        po.setLineItems(lineItems);
        po.setSubtotal(BigDecimal.valueOf(round2(subtotal)));
        po.setTaxAmount(BigDecimal.valueOf(round2(taxAmount)));
        po.setGrandTotal(BigDecimal.valueOf(round2(grandTotal)));
        po.setStatus("Draft");
        po.setNotes(trimOrNull(body.get("notes")));
        po.setTermsConditions(trimOrNull(body.get("terms_conditions")));
        po.setCondition(rfq.getMaterialCategory() != null ? null : null); // snapshot from rfq if needed
        po.setForm(rfq.getForm());
        po.setShape(rfq.getShape());
        po.setDimensions(rfq.getDimensions());
        po.setCompanyId(companyId);
        po.setCreatedBy(user.id());
        po.setCreatedAt(now);
        po.setUpdatedAt(now);

        return toPoMap(poRepo.save(po), true);
    }

    @Transactional
    public Map<String, Object> updatePO(UUID id, Map<String, Object> body) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        if (!"Draft".equals(po.getStatus()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only Draft POs can be edited");

        if (body.containsKey("po_date")) po.setPoDate(parseDate(body.get("po_date")));
        if (body.containsKey("notes")) po.setNotes(trimOrNull(body.get("notes")));
        if (body.containsKey("terms_conditions")) po.setTermsConditions(trimOrNull(body.get("terms_conditions")));
        if (body.containsKey("tax_type")) po.setTaxType(strOrDefault(body.get("tax_type"), po.getTaxType()));
        if (body.containsKey("cost_mode")) po.setCostMode(strOrDefault(body.get("cost_mode"), po.getCostMode()));
        if (body.containsKey("weight_unit")) po.setWeightUnit(strOrDefault(body.get("weight_unit"), po.getWeightUnit()));

        String costMode = po.getCostMode() != null ? po.getCostMode() : "unit";

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> itemsRaw = body.containsKey("items")
                ? (List<Map<String, Object>>) body.get("items")
                : null;

        if (itemsRaw != null && !itemsRaw.isEmpty()) {
            List<Map<String, Object>> lineItems = new ArrayList<>();
            for (Map<String, Object> item : itemsRaw) {
                double qty = parseDouble(item.get("quantity"), 0);
                double weight = parseDouble(item.get("weight"), 0);
                double unitCost = parseDouble(item.get("unit_cost"), 0);
                double costPerWeight = parseDouble(item.get("cost_per_weight"), 0);
                double lineTotal = "weight".equals(costMode) ? qty * weight * costPerWeight : qty * unitCost;

                Map<String, Object> li = new LinkedHashMap<>();
                li.put("part_id", item.get("part_id"));
                li.put("part_name", orEmpty(item.get("part_name")));
                li.put("material_category", orEmpty(item.get("material_category")));
                li.put("material_grade", orEmpty(item.get("material_grade")));
                li.put("condition", orEmpty(item.get("condition")));
                li.put("form", orEmpty(item.get("form")));
                li.put("dimensions", item.get("dimensions"));
                li.put("unit_system", strOrDefault(item.get("unit_system"), "imperial"));
                li.put("quantity", qty);
                li.put("weight", weight);
                li.put("unit_cost", unitCost);
                li.put("cost_per_weight", costPerWeight);
                li.put("weight_unit", strOrDefault(item.get("weight_unit"), "KG"));
                li.put("line_total", round2(lineTotal));
                lineItems.add(li);
            }
            po.setLineItems(lineItems);
            double subtotal = lineItems.stream().mapToDouble(li -> parseDouble(li.get("line_total"), 0)).sum();
            po.setQuantity(BigDecimal.valueOf(lineItems.stream().mapToDouble(li -> parseDouble(li.get("quantity"), 0)).sum()));
            po.setTotalWeight(lineItems.stream().mapToDouble(li -> parseDouble(li.get("weight"), 0)).sum());
            po.setLineTotal(BigDecimal.valueOf(round2(subtotal)));
            po.setSubtotal(BigDecimal.valueOf(round2(subtotal)));

            Map<String, Object> primary = lineItems.get(0);
            po.setUnitCost(parseDouble(primary.get("unit_cost"), 0) > 0 ? BigDecimal.valueOf(parseDouble(primary.get("unit_cost"), 0)) : null);
            po.setCostPerWeight(parseDouble(primary.get("cost_per_weight"), 0) > 0 ? BigDecimal.valueOf(parseDouble(primary.get("cost_per_weight"), 0)) : null);
            po.setPartName(strOrNull(primary.get("part_name")));
            po.setMaterialCategory(strOrNull(primary.get("material_category")));
            po.setMaterialGrade(strOrNull(primary.get("material_grade")));

            recalcTotals(po);
        }

        po.setUpdatedAt(Instant.now());
        return toPoMap(poRepo.save(po), true);
    }

    @Transactional
    public Map<String, Object> sendPO(UUID id) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        if (!"Draft".equals(po.getStatus())) throw new ApiException(HttpStatus.BAD_REQUEST, "PO has already been sent");
        po.setStatus("Sent");
        po.setUpdatedAt(Instant.now());
        return toPoMap(poRepo.save(po), true);
    }

    @Transactional
    public Map<String, Object> markOrdered(UUID id) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        if (!"Sent".equals(po.getStatus()) && !"Draft".equals(po.getStatus()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot mark as Ordered from current status");
        po.setStatus("Ordered");
        po.setUpdatedAt(Instant.now());
        return toPoMap(poRepo.save(po), true);
    }

    @Transactional
    public Map<String, Object> markReceived(UUID id) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        if (!"Sent".equals(po.getStatus()) && !"Ordered".equals(po.getStatus()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only Sent or Ordered POs can be marked Received");
        po.setStatus("Received");
        po.setUpdatedAt(Instant.now());
        poRepo.save(po);

        // Copy line items to stock
        copyToStock(po);

        return toPoMap(poRepo.findById(id).orElseThrow(), true);
    }

    @Transactional
    public Map<String, Object> copyPO(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin", "procurement");

        MgmtProcurementPoEntity source = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));

        UUID companyId = accessPolicy.resolveWriteCompanyScope(user);
        String poNumber = generatePoNumber(companyId);

        Instant now = Instant.now();
        MgmtProcurementPoEntity copy = new MgmtProcurementPoEntity();
        copy.setId(UUID.randomUUID());
        copy.setPoNumber(poNumber);
        copy.setPoDate(LocalDate.now());
        copy.setRfqId(source.getRfqId());
        copy.setVendorId(source.getVendorId());
        copy.setStatus("Draft");
        copy.setCostMode(source.getCostMode());
        copy.setWeightUnit(source.getWeightUnit());
        copy.setTaxType(source.getTaxType());
        copy.setTaxAmount(source.getTaxAmount());
        copy.setNotes(source.getNotes());
        copy.setTermsConditions(source.getTermsConditions());
        copy.setLineItems(source.getLineItems());
        copy.setPartName(source.getPartName());
        copy.setMaterialCategory(source.getMaterialCategory());
        copy.setMaterialGrade(source.getMaterialGrade());
        copy.setDimensions(source.getDimensions());
        copy.setQuantity(source.getQuantity());
        copy.setTotalWeight(source.getTotalWeight());
        copy.setUnitCost(source.getUnitCost());
        copy.setCostPerWeight(source.getCostPerWeight());
        copy.setLineTotal(source.getLineTotal());
        copy.setSubtotal(source.getSubtotal());
        copy.setGrandTotal(source.getGrandTotal());
        copy.setCompanyId(companyId);
        copy.setCreatedBy(user.id());
        copy.setCreatedAt(now);
        copy.setUpdatedAt(now);

        return toPoMap(poRepo.save(copy), true);
    }

    @Transactional
    public Map<String, Object> deletePO(UUID id, AuthenticatedUser user) {
        MgmtProcurementPoEntity po = poRepo.findActiveById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        if (!"Draft".equals(po.getStatus()) && !"Sent".equals(po.getStatus()))
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only Draft or Sent POs can be deleted");
        po.setDeletedAt(Instant.now());
        po.setDeletedBy(user.id());
        poRepo.save(po);
        return Map.of("message", "PO deleted");
    }

    public Map<String, Object> sendPOEmail(UUID id) {
        poRepo.findActiveById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "PO not found"));
        return Map.of("message", "Email functionality not available in this deployment");
    }

    // ── Purchased Materials ────────────────────────────────────────────────

    public List<Map<String, Object>> getPurchasedMaterials(Map<String, String> query, AuthenticatedUser user) {
        UUID company = accessPolicy.resolveCompanyScope(user);
        List<MgmtProcurementPoEntity> pos = company != null
                ? poRepo.findPurchasedByCompany(company)
                : poRepo.findAllPurchased();

        String search = query == null ? null : trim(query.get("search"));
        return pos.stream()
                .filter(p -> search == null || (p.getPoNumber() != null && p.getPoNumber().toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))))
                .map(p -> toPoMap(p, false))
                .toList();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    private Map<String, Object> toRfqMap(MgmtProcurementRfqEntity rfq, boolean withRelations) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rfq.getId());
        m.put("rfq_number", rfq.getRfqNumber());
        m.put("date", rfq.getDate() != null ? rfq.getDate().toString() : null);
        m.put("need_materials_before", rfq.getNeedMaterialsBefore() != null ? rfq.getNeedMaterialsBefore().toString() : null);
        m.put("instructions", rfq.getInstructions());
        m.put("status", rfq.getStatus());
        m.put("part_id", rfq.getPartId());
        m.put("part_name", rfq.getPartName());
        m.put("material_category", rfq.getMaterialCategory());
        m.put("material_grade", rfq.getMaterialGrade());
        m.put("density", rfq.getDensity());
        m.put("form", rfq.getForm());
        m.put("shape", rfq.getShape());
        m.put("dimensions", rfq.getDimensions());
        m.put("weight_per_piece", rfq.getWeightPerPiece());
        m.put("quantity", rfq.getQuantity());
        m.put("line_items", rfq.getLineItems());
        m.put("vendor_id", rfq.getVendorId());
        m.put("parent_rfq_id", rfq.getParentRfqId());
        m.put("company_id", rfq.getCompanyId());
        m.put("created_by", rfq.getCreatedBy());
        m.put("created_at", rfq.getCreatedAt());
        m.put("updated_at", rfq.getUpdatedAt());

        if (withRelations) {
            // Enrich vendor
            if (rfq.getVendorId() != null) {
                vendorRepo.findById(rfq.getVendorId()).ifPresent(v -> m.put("vendor", Map.of(
                        "id", v.getId(), "vendor_name", orEmpty(v.getVendorName()),
                        "contact_email", orEmpty(v.getContactEmail()), "contact_phone", orEmpty(v.getContactPhone()),
                        "address", orEmpty(v.getAddress()), "contact_person", orEmpty(v.getContactPerson()),
                        "contact_position", orEmpty(v.getContactPosition()))));
            }
            // Enrich creator
            if (rfq.getCreatedBy() != null) {
                userRepo.findById(rfq.getCreatedBy()).ifPresent(u -> m.put("creator", Map.of(
                        "id", u.getId(), "name", orEmpty(u.getName()), "position", orEmpty(u.getPosition()))));
            }
            // Linked POs
            poRepo.findActiveByRfqId(rfq.getId()).ifPresent(po -> m.put("purchaseOrders", List.of(
                    Map.of("id", po.getId(), "po_number", orEmpty(po.getPoNumber()), "status", orEmpty(po.getStatus())))));
        }
        return m;
    }

    private Map<String, Object> toPoMap(MgmtProcurementPoEntity po, boolean withRelations) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", po.getId());
        m.put("po_number", po.getPoNumber());
        m.put("rfq_id", po.getRfqId());
        m.put("vendor_id", po.getVendorId());
        m.put("po_date", po.getPoDate() != null ? po.getPoDate().toString() : null);
        m.put("tax_type", po.getTaxType());
        m.put("part_name", po.getPartName());
        m.put("material_category", po.getMaterialCategory());
        m.put("material_grade", po.getMaterialGrade());
        m.put("quantity", po.getQuantity());
        m.put("weight_per_piece", po.getWeightPerPiece());
        m.put("total_weight", po.getTotalWeight());
        m.put("subtotal", po.getSubtotal());
        m.put("tax_amount", po.getTaxAmount());
        m.put("grand_total", po.getGrandTotal());
        m.put("cost_mode", po.getCostMode());
        m.put("unit_cost", po.getUnitCost());
        m.put("cost_per_weight", po.getCostPerWeight());
        m.put("weight_unit", po.getWeightUnit());
        m.put("line_total", po.getLineTotal());
        m.put("line_items", po.getLineItems());
        m.put("terms_conditions", po.getTermsConditions());
        m.put("condition", po.getCondition());
        m.put("form", po.getForm());
        m.put("shape", po.getShape());
        m.put("dimensions", po.getDimensions());
        m.put("status", po.getStatus());
        m.put("notes", po.getNotes());
        m.put("company_id", po.getCompanyId());
        m.put("created_by", po.getCreatedBy());
        m.put("created_at", po.getCreatedAt());
        m.put("updated_at", po.getUpdatedAt());

        if (withRelations) {
            if (po.getRfqId() != null) {
                rfqRepo.findById(po.getRfqId()).ifPresent(rfq -> m.put("rfq", Map.of(
                        "id", rfq.getId(), "rfq_number", orEmpty(rfq.getRfqNumber()),
                        "part_name", orEmpty(rfq.getPartName()), "material_category", orEmpty(rfq.getMaterialCategory()),
                        "material_grade", orEmpty(rfq.getMaterialGrade()),
                        "quantity", rfq.getQuantity() != null ? rfq.getQuantity() : BigDecimal.ZERO,
                        "part_id", rfq.getPartId() != null ? rfq.getPartId().toString() : "")));
            }
            if (po.getVendorId() != null) {
                vendorRepo.findById(po.getVendorId()).ifPresent(v -> m.put("vendor", Map.of(
                        "id", v.getId(), "vendor_name", orEmpty(v.getVendorName()),
                        "contact_email", orEmpty(v.getContactEmail()), "contact_phone", orEmpty(v.getContactPhone()),
                        "address", orEmpty(v.getAddress()), "contact_person", orEmpty(v.getContactPerson()),
                        "contact_position", orEmpty(v.getContactPosition()))));
            }
            if (po.getCreatedBy() != null) {
                userRepo.findById(po.getCreatedBy()).ifPresent(u -> m.put("creator", Map.of(
                        "id", u.getId(), "name", orEmpty(u.getName()), "position", orEmpty(u.getPosition()))));
            }
        }
        return m;
    }

    private void copyToStock(MgmtProcurementPoEntity po) {
        try {
            List<Map<String, Object>> items = po.getLineItems() != null && !po.getLineItems().isEmpty()
                    ? po.getLineItems()
                    : List.of(Map.of(
                            "material_category", orEmpty(po.getMaterialCategory()),
                            "material_grade", orEmpty(po.getMaterialGrade()),
                            "quantity", po.getQuantity() != null ? po.getQuantity().doubleValue() : 0.0));

            Instant now = Instant.now();
            for (Map<String, Object> item : items) {
                double qty = parseDouble(item.get("quantity"), 0);
                if (qty <= 0) continue;

                String partDescription = orEmpty(item.get("material_category"));
                String materialGrade = orEmpty(item.get("material_grade"));
                String dimension = buildDimStr(item.get("dimensions"));

                // Resolve raw_material_id
                UUID rawMaterialId = null;
                Object partIdObj = item.get("part_id");
                if (partIdObj != null && !String.valueOf(partIdObj).isBlank()) {
                    try { rawMaterialId = UUID.fromString(String.valueOf(partIdObj)); } catch (Exception ignored) {}
                }
                if (rawMaterialId == null && !materialGrade.isBlank()) {
                    UUID company = po.getCompanyId();
                    Optional<RawMaterialEntity> rm = rawMaterialRepo.findAll((root, q, cb) ->
                            company != null
                                    ? cb.and(cb.equal(root.get("companyId"), company), cb.equal(cb.lower(root.get("materialGrade")), materialGrade.toLowerCase(Locale.ROOT)))
                                    : cb.equal(cb.lower(root.get("materialGrade")), materialGrade.toLowerCase(Locale.ROOT))
                    ).stream().findFirst();
                    rawMaterialId = rm.map(RawMaterialEntity::getId).orElse(null);
                }

                String stockId = null;
                try {
                    stockId = sequenceService.generateNumber(SequenceNumberingService.MATERIAL_STOCK_ENTRY_ID, po.getCompanyId());
                } catch (Exception e) {
                    log.warn("Failed to generate stock_id: {}", e.getMessage());
                }

                StockEntity stock = new StockEntity();
                stock.setId(UUID.randomUUID());
                stock.setStockId(stockId);
                stock.setPartDescription(partDescription.isBlank() ? "Unknown" : partDescription);
                stock.setMaterialGrade(materialGrade);
                stock.setCondition(strOrNull(item.get("condition")));
                stock.setShape(strOrNull(item.get("shape")));
                stock.setDimension(dimension);
                stock.setQuantity(qty);
                stock.setRawMaterialId(rawMaterialId);
                stock.setCompanyId(po.getCompanyId());
                stock.setCreatedBy(po.getCreatedBy());
                stock.setCreatedAt(now);
                stock.setUpdatedAt(now);
                stockRepo.save(stock);
            }
        } catch (Exception e) {
            log.error("Failed to copy received PO to material stock: {}", e.getMessage());
        }
    }

    private String buildDimStr(Object dims) {
        if (!(dims instanceof Map<?, ?> m)) return "";
        List<String> vals = new ArrayList<>();
        for (String key : List.of("length", "width", "height", "thickness", "diameter", "outer_diameter", "inner_diameter", "across_flats", "side")) {
            Object v = m.get(key);
            if (v != null && !String.valueOf(v).isBlank()) vals.add(String.valueOf(v));
        }
        return vals.isEmpty() ? "" : String.join(" x ", vals) + " mm";
    }

    private void recalcTotals(MgmtProcurementPoEntity po) {
        double subtotal = po.getSubtotal() != null ? po.getSubtotal().doubleValue() : 0;
        double taxPct = taxPct(po.getTaxType());
        double taxAmount = subtotal * taxPct;
        po.setTaxAmount(BigDecimal.valueOf(round2(taxAmount)));
        po.setGrandTotal(BigDecimal.valueOf(round2(subtotal + taxAmount)));
    }

    private double taxPct(String taxType) {
        if (taxType == null) return 0;
        return switch (taxType) { case "5%" -> 0.05; case "12%" -> 0.12; case "18%" -> 0.18; default -> 0; };
    }

    private Map<String, Object> buildRmSnapshot(RawMaterialEntity rm) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("part_id", rm.getId());
        m.put("part_name", rm.getMaterialCategory() + " — " + rm.getMaterialGrade());
        m.put("material_category", rm.getMaterialCategory());
        m.put("material_grade", rm.getMaterialGrade());
        m.put("condition", rm.getCondition());
        m.put("density", rm.getDensity());
        m.put("form", rm.getForm());
        m.put("shape", rm.getShape());
        m.put("dimensions", rm.getDimensions());
        m.put("weight_per_piece", null);
        return m;
    }

    private void applyPrimarySnapshot(MgmtProcurementRfqEntity rfq, Map<String, Object> snap) {
        rfq.setPartId(snap.get("part_id") instanceof UUID u ? u : snap.get("part_id") != null ? UUID.fromString(String.valueOf(snap.get("part_id"))) : null);
        rfq.setPartName(strOrNull(snap.get("part_name")));
        rfq.setMaterialCategory(strOrNull(snap.get("material_category")));
        rfq.setMaterialGrade(strOrNull(snap.get("material_grade")));
        rfq.setDensity(snap.get("density") instanceof Number n ? n.doubleValue() : null);
        rfq.setForm(strOrNull(snap.get("form")));
        rfq.setShape(strOrNull(snap.get("shape")));
        @SuppressWarnings("unchecked")
        Map<String, Object> dims = snap.get("dimensions") instanceof Map<?, ?> d ? (Map<String, Object>) d : null;
        rfq.setDimensions(dims);
        rfq.setWeightPerPiece(null);
    }

    private String generateRfqNumber(UUID companyId) {
        return sequenceService.generateNumber(SequenceNumberingService.CLIENT_PO_NUMBER, companyId);
    }

    private String generatePoNumber(UUID companyId) {
        return sequenceService.generateNumber(SequenceNumberingService.VENDOR_PO_NUMBER, companyId);
    }

    private LocalDate parseDate(Object value) {
        if (value == null) return LocalDate.now();
        try { return LocalDate.parse(String.valueOf(value).substring(0, 10)); } catch (Exception e) { return LocalDate.now(); }
    }

    private double parseDouble(Object value, double fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(String.valueOf(value)); } catch (Exception e) { return fallback; }
    }

    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }

    private String trim(String v) { if (v == null) return null; String s = v.trim(); return s.isEmpty() ? null : s; }

    private String trimOrNull(Object v) { if (v == null) return null; String s = String.valueOf(v).trim(); return s.isEmpty() ? null : s; }

    private String strOrNull(Object v) { return v == null ? null : String.valueOf(v).trim().isEmpty() ? null : String.valueOf(v); }

    private String strOrDefault(Object v, String def) { if (v == null) return def; String s = String.valueOf(v).trim(); return s.isEmpty() ? def : s; }

    private String orEmpty(Object v) { return v == null ? "" : String.valueOf(v); }
}
