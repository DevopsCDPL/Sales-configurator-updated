package com.forge.operations.service;

import com.forge.operations.entity.VendorEntity;
import com.forge.operations.entity.VendorMaterialEntity;
import com.forge.operations.repository.VendorMaterialRepository;
import com.forge.operations.repository.VendorRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class VendorParityService {
    private final VendorRepository vendorRepository;
    private final VendorMaterialRepository vendorMaterialRepository;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public VendorParityService(VendorRepository vendorRepository,
                               VendorMaterialRepository vendorMaterialRepository,
                               OperationAccessPolicy accessPolicy,
                               ParityMapper mapper) {
        this.vendorRepository = vendorRepository;
        this.vendorMaterialRepository = vendorMaterialRepository;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    public List<VendorEntity> getAllVendors(Map<String, String> filters, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        Specification<VendorEntity> spec = (root, query, cb) -> cb.isNull(root.get("deletedAt"));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        String search = filters == null ? null : trim(filters.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.or(
                    cb.like(cb.lower(root.get("vendorName")), pattern),
                    cb.like(cb.lower(root.get("contactPerson")), pattern),
                    cb.like(cb.lower(root.get("contactEmail")), pattern)
            ));
        }

        return vendorRepository.findAll(spec, Sort.by(Sort.Direction.ASC, "vendorName"));
    }

    public VendorEntity getVendorById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        return (companyScope == null
                ? vendorRepository.findByIdAndDeletedAtIsNull(id)
                : vendorRepository.findByIdAndCompanyIdAndDeletedAtIsNull(id, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Vendor not found"));
    }

    public VendorEntity createVendor(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        String vendorName = trim(asString(payload.get("company_name")));
        if (vendorName == null) {
            vendorName = trim(asString(payload.get("vendor_name")));
        }
        if (vendorName == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Vendor name is required");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        UUID companyId = companyScope != null ? companyScope : asUuid(payload.get("company_id"));

        Instant now = Instant.now();
        VendorEntity row = new VendorEntity();
        row.setId(UUID.randomUUID());
        row.setVendorName(vendorName);
        row.setAddress(trim(asString(payload.get("address"))));
        row.setContactPerson(trim(asString(payload.get("contact_person"))));
        String contactPosition = trim(asString(payload.get("position")));
        if (contactPosition == null) {
            contactPosition = trim(asString(payload.get("contact_position")));
        }
        row.setContactPosition(contactPosition);

        String contactEmail = trim(asString(payload.get("email")));
        if (contactEmail == null) {
            contactEmail = trim(asString(payload.get("contact_email")));
        }
        row.setContactEmail(contactEmail);

        String contactPhone = trim(asString(payload.get("phone")));
        if (contactPhone == null) {
            contactPhone = trim(asString(payload.get("contact_phone")));
        }
        row.setContactPhone(contactPhone);

        row.setServiceCategories(asStringArray(payload.get("service_categories")));
        row.setRating(BigDecimal.valueOf(asDouble(payload.get("rating"), 0D)));
        row.setTaxId(trim(asString(payload.get("tax_id"))));
        row.setNotes(trim(asString(payload.get("notes"))));
        row.setCcList(asMapList(payload.get("cc_list")));
        row.setCompanyId(companyId);
        row.setCreatedBy(user.id());
        row.setIsActive(true);
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        row = vendorRepository.save(row);
        saveVendorMaterials(row.getId(), payload.get("materials"));
        return row;
    }

    private BigDecimal asBigDecimal(Object value, BigDecimal fallback) {
        if (value == null) return fallback;

        try {
            return new BigDecimal(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asMapList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                result.add((Map<String, Object>) map);
            } else if (item != null) {
                // fallback: wrap plain string as {value: "..."}
                result.add(Map.of("value", String.valueOf(item)));
            }
        }
        return result;
    }

    public VendorEntity updateVendor(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        VendorEntity row = getVendorById(id, user);

        String vendorName = trim(asString(payload.get("company_name")));
        if (vendorName == null) {
            vendorName = trim(asString(payload.get("vendor_name")));
        }
        if (vendorName != null) row.setVendorName(vendorName);

        if (payload.containsKey("address")) row.setAddress(trim(asString(payload.get("address"))));
        if (payload.containsKey("contact_person")) row.setContactPerson(trim(asString(payload.get("contact_person"))));

        if (payload.containsKey("position") || payload.containsKey("contact_position")) {
            String position = trim(asString(payload.get("position")));
            if (position == null) position = trim(asString(payload.get("contact_position")));
            row.setContactPosition(position);
        }

        if (payload.containsKey("email") || payload.containsKey("contact_email")) {
            String email = trim(asString(payload.get("email")));
            if (email == null) email = trim(asString(payload.get("contact_email")));
            row.setContactEmail(email);
        }

        if (payload.containsKey("phone") || payload.containsKey("contact_phone")) {
            String phone = trim(asString(payload.get("phone")));
            if (phone == null) phone = trim(asString(payload.get("contact_phone")));
            row.setContactPhone(phone);
        }

        if (payload.containsKey("service_categories")) row.setServiceCategories(asStringArray(payload.get("service_categories")));
        if (payload.containsKey("rating")) row.setRating(asBigDecimal(payload.get("rating"), row.getRating() == null ? BigDecimal.ZERO : row.getRating()));
        if (payload.containsKey("tax_id")) row.setTaxId(trim(asString(payload.get("tax_id"))));
        if (payload.containsKey("notes")) row.setNotes(trim(asString(payload.get("notes"))));
        if (payload.containsKey("cc_list")) row.setCcList(asMapList(payload.get("cc_list")));

        if (("main_admin".equals(user.role()) || "platform_admin".equals(user.role())) && payload.containsKey("company_id")) {
            row.setCompanyId(asUuid(payload.get("company_id")));
        }

        row.setUpdatedAt(Instant.now());
        row = vendorRepository.save(row);

        if (payload.containsKey("materials")) {
            vendorMaterialRepository.deleteByVendorId(id);
            saveVendorMaterials(id, payload.get("materials"));
        }

        return row;
    }

    public Map<String, Object> deleteVendor(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        VendorEntity row = getVendorById(id, user);
        row.setDeletedAt(Instant.now());
        row.setDeletedBy(user.id());
        row.setUpdatedAt(Instant.now());
        vendorRepository.save(row);
        return Map.of("message", "Vendor moved to recycle bin");
    }

    public List<Map<String, Object>> getAllVendorMaterials(AuthenticatedUser user) {
        List<VendorEntity> accessibleVendors = getAllVendors(Map.of(), user);
        if (accessibleVendors.isEmpty()) {
            return List.of();
        }

        List<UUID> vendorIds = accessibleVendors.stream().map(VendorEntity::getId).toList();
        Map<UUID, VendorEntity> vendorMap = accessibleVendors.stream()
                .collect(Collectors.toMap(VendorEntity::getId, v -> v));

        List<VendorMaterialEntity> materials = vendorMaterialRepository.findByVendorIdIn(vendorIds);
        List<Map<String, Object>> response = new ArrayList<>();

        for (VendorMaterialEntity material : materials) {
            Map<String, Object> row = new LinkedHashMap<>(mapper.toVendorMaterialMap(material));
            VendorEntity vendor = vendorMap.get(material.getVendorId());
            if (vendor != null) {
                row.put("vendor", Map.of(
                        "id", vendor.getId(),
                        "vendor_name", vendor.getVendorName()
                ));
            }
            response.add(row);
        }
        return response;
    }

    public List<Map<String, Object>> getVendorMaterials(UUID vendorId) {
        return vendorMaterialRepository.findByVendorIdOrderByPartDescriptionAsc(vendorId)
                .stream()
                .map(mapper::toVendorMaterialMap)
                .toList();
    }

    private void saveVendorMaterials(UUID vendorId, Object materialsValue) {
        if (!(materialsValue instanceof List<?> materials) || materials.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        List<VendorMaterialEntity> rows = new ArrayList<>();
        for (Object raw : materials) {
            if (!(raw instanceof Map<?, ?> mapAny)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) mapAny;

            String partDescription = trim(asString(map.get("part_description")));
            String materialGrade = trim(asString(map.get("material_grade")));
            String dimension = trim(asString(map.get("dimension")));

            if (partDescription == null && materialGrade == null && dimension == null) {
                continue;
            }

            VendorMaterialEntity row = new VendorMaterialEntity();
            row.setId(UUID.randomUUID());
            row.setVendorId(vendorId);
            row.setPartDescription(partDescription == null ? "" : partDescription);
            row.setMaterialGrade(materialGrade == null ? "" : materialGrade);
            row.setDimension(dimension == null ? "" : dimension);
            row.setCreatedAt(now);
            row.setUpdatedAt(now);
            rows.add(row);
        }

        if (!rows.isEmpty()) {
            vendorMaterialRepository.saveAll(rows);
        }
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private String trim(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private UUID asUuid(Object value) {
        if (value == null) return null;
        if (value instanceof UUID uuid) return uuid;
        try {
            return UUID.fromString(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }

    private Double asDouble(Object value, Double fallback) {
        if (value == null) return fallback;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }

    private List<String> asStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Object item : list) {
            if (item != null) {
                out.add(String.valueOf(item));
            }
        }
        return out;
    }

    private String[] asStringArray(Object value) {
        if (!(value instanceof List<?> list)) {
            return new String[0];
        }
        List<String> items = new ArrayList<>();
        for (Object item : list) {
            if (item != null) {
                items.add(String.valueOf(item));
            }
        }
        return items.toArray(new String[0]);
    }
}
