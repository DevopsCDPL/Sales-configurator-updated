package com.forge.operations.service;

import com.forge.operations.entity.ClientEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class ClientParityService {
    private final ClientRepository clientRepository;
    private final OperationAccessPolicy accessPolicy;

    public ClientParityService(ClientRepository clientRepository,
                               OperationAccessPolicy accessPolicy) {
        this.clientRepository = clientRepository;
        this.accessPolicy = accessPolicy;
    }

    public List<ClientEntity> getAllClients(Map<String, String> filters, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);

        Specification<ClientEntity> spec = (root, query, cb) -> cb.isNull(root.get("deletedAt"));
        if (companyScope != null) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("companyId"), companyScope));
        }

        String search = filters == null ? null : trim(filters.get("search"));
        if (search != null) {
            String pattern = "%" + search.toLowerCase(Locale.ROOT) + "%";
            spec = spec.and((root, query, cb) -> cb.or(
                    cb.like(cb.lower(root.get("clientName")), pattern),
                    cb.like(cb.lower(root.get("pocName")), pattern),
                    cb.like(cb.lower(root.get("pocEmail")), pattern)
            ));
        }

        return clientRepository.findAll(spec, Sort.by(Sort.Direction.ASC, "clientName"));
    }

    public ClientEntity getClientById(UUID id, AuthenticatedUser user) {
        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        return (companyScope == null
                ? clientRepository.findByIdAndDeletedAtIsNull(id)
                : clientRepository.findByIdAndCompanyIdAndDeletedAtIsNull(id, companyScope))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Client not found"));
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

    public ClientEntity createClient(Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        String clientName = trim(asString(payload.get("client_name")));
        if (clientName == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Client name is required");
        }

        UUID companyScope = accessPolicy.resolveCompanyScope(user);
        UUID companyId = companyScope != null ? companyScope : asUuid(payload.get("company_id"));

        Instant now = Instant.now();
        ClientEntity row = new ClientEntity();
        row.setId(UUID.randomUUID());
        row.setClientName(clientName);
        row.setAddress(trim(asString(payload.get("address"))));
        row.setPocName(trim(asString(payload.get("poc_name"))));
        row.setPocEmail(trim(asString(payload.get("poc_email"))));
        row.setPocPhone(trim(asString(payload.get("poc_phone"))));
        row.setTaxId(trim(asString(payload.get("tax_id"))));
        row.setPaymentTerms(trim(asString(payload.get("payment_terms"))));
        row.setPosition(trim(asString(payload.get("position"))));
        row.setNotes(trim(asString(payload.get("notes"))));
        row.setCcList(asMapList(payload.get("cc_list")));
        row.setCompanyId(companyId);
        row.setCreatedBy(user.id());
        row.setIsActive(true);
        row.setCreatedAt(now);
        row.setUpdatedAt(now);

        return clientRepository.save(row);
    }

    public ClientEntity updateClient(UUID id, Map<String, Object> payload, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");

        ClientEntity row = getClientById(id, user);

        if (payload.containsKey("client_name")) {
            String value = trim(asString(payload.get("client_name")));
            if (value == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Client name cannot be empty");
            }
            row.setClientName(value);
        }
        if (payload.containsKey("address")) row.setAddress(trim(asString(payload.get("address"))));
        if (payload.containsKey("poc_name")) row.setPocName(trim(asString(payload.get("poc_name"))));
        if (payload.containsKey("poc_email")) row.setPocEmail(trim(asString(payload.get("poc_email"))));
        if (payload.containsKey("poc_phone")) row.setPocPhone(trim(asString(payload.get("poc_phone"))));
        if (payload.containsKey("tax_id")) row.setTaxId(trim(asString(payload.get("tax_id"))));
        if (payload.containsKey("payment_terms")) row.setPaymentTerms(trim(asString(payload.get("payment_terms"))));
        if (payload.containsKey("position")) row.setPosition(trim(asString(payload.get("position"))));
        if (payload.containsKey("notes")) row.setNotes(trim(asString(payload.get("notes"))));
        if (payload.containsKey("cc_list")) row.setCcList(asMapList(payload.get("cc_list")));

        if (("main_admin".equals(user.role()) || "platform_admin".equals(user.role())) && payload.containsKey("company_id")) {
            row.setCompanyId(asUuid(payload.get("company_id")));
        }

        row.setUpdatedAt(Instant.now());
        return clientRepository.save(row);
    }

    public Map<String, Object> deleteClient(UUID id, AuthenticatedUser user) {
        accessPolicy.requireNodeAuthorize(user, "main_admin", "admin");
        ClientEntity row = getClientById(id, user);
        row.setDeletedAt(Instant.now());
        row.setDeletedBy(user.id());
        row.setUpdatedAt(Instant.now());
        clientRepository.save(row);
        return Map.of("message", "Client moved to recycle bin");
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

    private List<String> asStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (Object item : list) {
            if (item != null) {
                result.add(String.valueOf(item));
            }
        }
        return result;
    }
}
