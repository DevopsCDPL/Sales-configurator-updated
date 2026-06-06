package com.forge.operations.service;

import com.forge.configurator.entity.ProjectEntity;
import com.forge.configurator.repository.ProjectRepository;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.repository.ClientRepository;
import com.forge.operations.repository.VendorRepository;
import com.forge.shared.api.ApiException;
import com.forge.shared.security.AuthenticatedUser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecycleBinParityServiceTest {

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private VendorRepository vendorRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private OperationAccessPolicy accessPolicy;

    @Mock
    private ParityMapper mapper;

    @InjectMocks
    private RecycleBinParityService service;

    @Test
    void restoreClientClearsDeletedMetadataWhenCompanyScopeMatches() {
        UUID companyId = UUID.randomUUID();
        UUID clientId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "owner@forge.test", "main_admin", companyId, "Forge", Map.of());

        ClientEntity row = new ClientEntity();
        row.setId(clientId);
        row.setCompanyId(companyId);
        row.setDeletedAt(Instant.now());
        row.setDeletedBy(UUID.randomUUID());
        row.setIsActive(false);

        when(accessPolicy.resolveCompanyScope(user)).thenReturn(companyId);
        when(clientRepository.findById(clientId)).thenReturn(Optional.of(row));

        Map<String, Object> result = service.restore("clients", clientId, user);

        assertEquals("Client restored successfully", result.get("message"));
        assertEquals(null, row.getDeletedAt());
        assertEquals(null, row.getDeletedBy());
        assertEquals(true, row.getIsActive());
        verify(clientRepository).save(row);
    }

    @Test
    void permanentDeleteRejectsWhenRequesterIsNotMainAdmin() {
        UUID projectId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "admin@forge.test", "admin", UUID.randomUUID(), "Forge", Map.of());

        doThrow(new ApiException(org.springframework.http.HttpStatus.FORBIDDEN, "Only Super Admin can permanently delete records"))
                .when(accessPolicy).requireMainAdmin(user);

        assertThrows(ApiException.class, () -> service.permanentDelete("projects", projectId, user));
    }

    @Test
    void permanentDeleteProjectRemovesSoftDeletedRecord() {
        UUID projectId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), "owner@forge.test", "main_admin", UUID.randomUUID(), "Forge", Map.of());

        ProjectEntity row = new ProjectEntity();
        row.setId(projectId);
        row.setDeletedAt(Instant.now());

        when(projectRepository.findById(projectId)).thenReturn(Optional.of(row));

        Map<String, Object> result = service.permanentDelete("projects", projectId, user);

        assertEquals("Project permanently deleted", result.get("message"));
        verify(projectRepository).delete(row);
    }
}
