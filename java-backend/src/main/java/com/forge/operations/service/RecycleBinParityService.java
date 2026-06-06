package com.forge.operations.service;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.VendorEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.VendorRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class RecycleBinParityService {
    private final ClientRepository clientRepository;
    private final VendorRepository vendorRepository;
    private final ProjectRepository projectRepository;
    private final OperationAccessPolicy accessPolicy;
    private final ParityMapper mapper;

    public RecycleBinParityService(ClientRepository clientRepository,
                                   VendorRepository vendorRepository,
                                   ProjectRepository projectRepository,
                                   OperationAccessPolicy accessPolicy,
                                   ParityMapper mapper) {
        this.clientRepository = clientRepository;
        this.vendorRepository = vendorRepository;
        this.projectRepository = projectRepository;
        this.accessPolicy = accessPolicy;
        this.mapper = mapper;
    }

    public Map<String, Object> list(String module,
                                    String search,
                                    int page,
                                    int limit,
                                    AuthenticatedUser user) {
        accessPolicy.requireCoAdmin(user);
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        List<String> modules;
        if (module == null || module.isBlank()) {
            modules = List.of("clients", "vendors", "projects");
        } else if ("procurement".equals(module)) {
            modules = List.of();
        } else {
            modules = List.of(module);
        }

        Map<String, Object> output = new LinkedHashMap<>();
        for (String mod : modules) {
            switch (mod) {
                case "clients" -> output.put(mod, listClients(companyScope, search, page, limit));
                case "vendors" -> output.put(mod, listVendors(companyScope, search, page, limit));
                case "projects" -> output.put(mod, listProjects(companyScope, search, page, limit));
                default -> {
                    // Keep parity behavior stable for unknown modules.
                }
            }
        }
        return output;
    }

    public Map<String, Object> restore(String module, UUID id, AuthenticatedUser user) {
        accessPolicy.requireCoAdmin(user);
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        return switch (module) {
            case "clients" -> restoreClient(id, companyScope);
            case "vendors" -> restoreVendor(id, companyScope);
            case "projects" -> restoreProject(id, companyScope);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown module: " + module);
        };
    }

    public Map<String, Object> permanentDelete(String module, UUID id, AuthenticatedUser user) {
        accessPolicy.requireMainAdmin(user);

        return switch (module) {
            case "clients" -> forceDeleteClient(id);
            case "vendors" -> forceDeleteVendor(id);
            case "projects" -> forceDeleteProject(id);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "Unknown module: " + module);
        };
    }

    public Map<String, Object> bulkRestore(List<Map<String, Object>> items, AuthenticatedUser user) {
        accessPolicy.requireCoAdmin(user);
        int restored = 0;
        int failed = 0;

        for (Map<String, Object> item : items) {
            try {
                String module = String.valueOf(item.get("module"));
                UUID id = asUuid(item.get("id"));
                if (id == null) {
                    failed++;
                    continue;
                }
                restore(module, id, user);
                restored++;
            } catch (Exception ex) {
                failed++;
            }
        }

        return Map.of(
                "message", restored + " item(s) restored",
                "restored", restored,
                "failed", failed
        );
    }

    public Map<String, Object> bulkPermanentDelete(List<Map<String, Object>> items, AuthenticatedUser user) {
        accessPolicy.requireMainAdmin(user);
        int deleted = 0;
        int failed = 0;

        for (Map<String, Object> item : items) {
            try {
                String module = String.valueOf(item.get("module"));
                UUID id = asUuid(item.get("id"));
                if (id == null) {
                    failed++;
                    continue;
                }
                permanentDelete(module, id, user);
                deleted++;
            } catch (Exception ex) {
                failed++;
            }
        }

        return Map.of(
                "message", deleted + " item(s) permanently deleted",
                "deleted", deleted,
                "failed", failed
        );
    }

    private Map<String, Object> listClients(UUID companyScope, String search, int page, int limit) {
        Pageable pageable = PageRequest.of(Math.max(0, page - 1), Math.max(1, limit), Sort.by(Sort.Direction.DESC, "deletedAt"));

        Specification<ClientEntity> spec = (root, query, cb) -> cb.isNotNull(root.get("deletedAt"));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (trim(search) != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("clientName")), pattern));
        }

        Page<ClientEntity> rows = clientRepository.findAll(spec, pageable);
        List<Map<String, Object>> items = rows.getContent().stream().map(mapper::toClientMap).toList();
        return Map.of("items", items, "total", rows.getTotalElements());
    }

    private Map<String, Object> listVendors(UUID companyScope, String search, int page, int limit) {
        Pageable pageable = PageRequest.of(Math.max(0, page - 1), Math.max(1, limit), Sort.by(Sort.Direction.DESC, "deletedAt"));

        Specification<VendorEntity> spec = (root, query, cb) -> cb.isNotNull(root.get("deletedAt"));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (trim(search) != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("vendorName")), pattern));
        }

        Page<VendorEntity> rows = vendorRepository.findAll(spec, pageable);
        List<Map<String, Object>> items = rows.getContent().stream().map(mapper::toVendorMap).toList();
        return Map.of("items", items, "total", rows.getTotalElements());
    }

    private Map<String, Object> listProjects(UUID companyScope, String search, int page, int limit) {
        Pageable pageable = PageRequest.of(Math.max(0, page - 1), Math.max(1, limit), Sort.by(Sort.Direction.DESC, "deletedAt"));

        Specification<ProjectEntity> spec = (root, query, cb) -> cb.isNotNull(root.get("deletedAt"));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }
        if (trim(search) != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.like(cb.lower(root.get("projectName")), pattern));
        }

        Page<ProjectEntity> rows = projectRepository.findAll(spec, pageable);
        List<Map<String, Object>> items = rows.getContent().stream().map(mapper::toProjectMap).toList();
        return Map.of("items", items, "total", rows.getTotalElements());
    }

    private Map<String, Object> restoreClient(UUID id, UUID companyScope) {
        ClientEntity row = clientRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        if (companyScope != null && row.getCompanyId() != null && !Objects.equals(row.getCompanyId(), companyScope)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You can only restore records in your own company");
        }

        row.setDeletedAt(null);
        row.setDeletedBy(null);
        row.setIsActive(true);
        row.setUpdatedAt(Instant.now());
        clientRepository.save(row);
        return Map.of("message", "Client restored successfully");
    }

    private Map<String, Object> restoreVendor(UUID id, UUID companyScope) {
        VendorEntity row = vendorRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        if (companyScope != null && row.getCompanyId() != null && !Objects.equals(row.getCompanyId(), companyScope)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You can only restore records in your own company");
        }

        row.setDeletedAt(null);
        row.setDeletedBy(null);
        row.setIsActive(true);
        row.setUpdatedAt(Instant.now());
        vendorRepository.save(row);
        return Map.of("message", "Vendor restored successfully");
    }

    private Map<String, Object> restoreProject(UUID id, UUID companyScope) {
        ProjectEntity row = projectRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        if (companyScope != null && row.getCompanyId() != null && !Objects.equals(row.getCompanyId(), companyScope)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "You can only restore records in your own company");
        }

        row.setDeletedAt(null);
        row.setDeletedBy(null);
        row.setUpdatedAt(Instant.now());
        projectRepository.save(row);
        return Map.of("message", "Project restored successfully");
    }

    private Map<String, Object> forceDeleteClient(UUID id) {
        ClientEntity row = clientRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        try {
            clientRepository.delete(row);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to permanently delete: " + ex.getMessage());
        }
        return Map.of("message", "Client permanently deleted");
    }

    private Map<String, Object> forceDeleteVendor(UUID id) {
        VendorEntity row = vendorRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        try {
            vendorRepository.delete(row);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to permanently delete: " + ex.getMessage());
        }
        return Map.of("message", "Vendor permanently deleted");
    }

    private Map<String, Object> forceDeleteProject(UUID id) {
        ProjectEntity row = projectRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found"));
        if (row.getDeletedAt() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Deleted record not found");
        }
        try {
            projectRepository.delete(row);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to permanently delete: " + ex.getMessage());
        }
        return Map.of("message", "Project permanently deleted");
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

    private String trim(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
