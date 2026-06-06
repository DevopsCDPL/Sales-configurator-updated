package com.forge.operations.service;

import com.forge.configurator.entity.DocumentEntity;
import com.forge.configurator.entity.ProjectEntity;
import com.forge.operations.entity.ClientEntity;
import com.forge.operations.entity.VendorEntity;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ParityMapperSerializationTest {

    private final ParityMapper mapper = new ParityMapper();

    @Test
    void emitsSnakeCaseKeysForClientVendorProjectAndDocument() {
        ClientEntity client = new ClientEntity();
        client.setId(UUID.randomUUID());
        client.setClientName("Client A");

        VendorEntity vendor = new VendorEntity();
        vendor.setId(UUID.randomUUID());
        vendor.setVendorName("Vendor A");

        ProjectEntity project = new ProjectEntity();
        project.setId(UUID.randomUUID());
        project.setProjectName("Project A");

        DocumentEntity document = new DocumentEntity();
        document.setId(UUID.randomUUID());
        document.setFileName("a.pdf");

        Map<String, Object> clientMap = mapper.toClientMap(client);
        Map<String, Object> vendorMap = mapper.toVendorMap(vendor);
        Map<String, Object> projectMap = mapper.toProjectMap(project);
        Map<String, Object> documentMap = mapper.toDocumentMap(document);

        assertTrue(clientMap.containsKey("client_name"));
        assertTrue(vendorMap.containsKey("vendor_name"));
        assertTrue(projectMap.containsKey("project_name"));
        assertTrue(projectMap.containsKey("production_traveler_type"));
        assertTrue(documentMap.containsKey("file_name"));
        assertTrue(documentMap.containsKey("module_type"));
        assertTrue(documentMap.containsKey("reference_id"));
    }
}
