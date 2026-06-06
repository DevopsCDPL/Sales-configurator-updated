package com.forge.operations.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class EnterpriseModuleHttpMethodParityTest {

    @Test
    void exposesExpectedHttpMethodAndPathPairs() {
        Set<String> routes = new LinkedHashSet<>();
        collect(routes, ClientParityController.class);
        collect(routes, VendorParityController.class);
        collect(routes, ProjectParityController.class);
        collect(routes, DocumentParityController.class);
        collect(routes, FileManagerParityController.class);
        collect(routes, RecycleBinParityController.class);

        assertHas(routes, "GET /api/clients");
        assertHas(routes, "GET /api/clients/{id}");
        assertHas(routes, "POST /api/clients");
        assertHas(routes, "PUT /api/clients/{id}");
        assertHas(routes, "DELETE /api/clients/{id}");

        assertHas(routes, "GET /api/vendors");
        assertHas(routes, "GET /api/vendors/materials/all");
        assertHas(routes, "GET /api/vendors/{id}");
        assertHas(routes, "POST /api/vendors");
        assertHas(routes, "PUT /api/vendors/{id}");
        assertHas(routes, "DELETE /api/vendors/{id}");

        assertHas(routes, "GET /api/projects/workflow");
        assertHas(routes, "GET /api/projects/next-quotation-number");
        assertHas(routes, "GET /api/projects/next-project-number");
        assertHas(routes, "GET /api/projects");
        assertHas(routes, "GET /api/projects/{id}");
        assertHas(routes, "POST /api/projects");
        assertHas(routes, "PUT /api/projects/{id}");
        assertHas(routes, "PATCH /api/projects/{id}/status");
        assertHas(routes, "PATCH /api/projects/{id}/advance-workflow");
        assertHas(routes, "POST /api/projects/{id}/copy");
        assertHas(routes, "PATCH /api/projects/{id}/select-revision");
        assertHas(routes, "PATCH /api/projects/{id}/traveler-type");
        assertHas(routes, "DELETE /api/projects/{id}");
        assertHas(routes, "GET /api/projects/{id}/analytics");
        assertHas(routes, "POST /api/projects/{id}/analytics");
        assertHas(routes, "POST /api/projects/{id}/commission");

        assertHas(routes, "GET /api/documents/project/{projectId}");
        assertHas(routes, "GET /api/documents/{id}");
        assertHas(routes, "GET /api/documents/{id}/view");
        assertHas(routes, "GET /api/documents/{id}/download");
        assertHas(routes, "POST /api/documents/project/{projectId}/quotation");
        assertHas(routes, "POST /api/documents/project/{projectId}/work-order");
        assertHas(routes, "POST /api/documents/project/{projectId}/traveller");
        assertHas(routes, "POST /api/documents/project/{projectId}/coc");
        assertHas(routes, "POST /api/documents/project/{projectId}/packing-list");
        assertHas(routes, "POST /api/documents/project/{projectId}/upload");
        assertHas(routes, "PATCH /api/documents/{id}/finalize");
        assertHas(routes, "POST /api/documents/merge");
        assertHas(routes, "DELETE /api/documents/{id}");

        assertHas(routes, "GET /api/file-manager/tree");
        assertHas(routes, "GET /api/file-manager/browse");
        assertHas(routes, "GET /api/file-manager/r2/projects");
        assertHas(routes, "GET /api/file-manager/r2/project-files");
        assertHas(routes, "GET /api/file-manager/r2/view");
        assertHas(routes, "GET /api/file-manager/r2/download");
        assertHas(routes, "GET /api/file-manager/r2/signed-url");
        assertHas(routes, "DELETE /api/file-manager/r2/file");
        assertHas(routes, "GET /api/file-manager/folders/by-path");
        assertHas(routes, "GET /api/file-manager/folders/{id}");
        assertHas(routes, "GET /api/file-manager/documents");
        assertHas(routes, "GET /api/file-manager/parts");
        assertHas(routes, "GET /api/file-manager/inventory");
        assertHas(routes, "GET /api/file-manager/projects");
        assertHas(routes, "POST /api/file-manager/upload");
        assertHas(routes, "POST /api/file-manager/ensure-project-folders");
        assertHas(routes, "POST /api/file-manager/ensure-procurement-folders");
        assertHas(routes, "PATCH /api/file-manager/documents/{id}/status");
        assertHas(routes, "GET /api/file-manager/documents/{id}/download");
        assertHas(routes, "GET /api/file-manager/documents/{id}/view");
        assertHas(routes, "GET /api/file-manager/view-by-path");
        assertHas(routes, "DELETE /api/file-manager/documents/{id}");

        assertHas(routes, "GET /api/recycle-bin");
        assertHas(routes, "POST /api/recycle-bin/{module}/{id}/restore");
        assertHas(routes, "DELETE /api/recycle-bin/{module}/{id}");
        assertHas(routes, "POST /api/recycle-bin/bulk-restore");
        assertHas(routes, "POST /api/recycle-bin/bulk-delete");
    }

    private static void collect(Set<String> routes, Class<?> controller) {
        RequestMapping classMapping = controller.getAnnotation(RequestMapping.class);
        String[] classPaths = extract(classMapping == null ? null : classMapping.path(), classMapping == null ? null : classMapping.value());

        for (Method method : controller.getDeclaredMethods()) {
            MappingSpec spec = extractMethodSpec(method);
            if (spec == null) {
                continue;
            }
            for (String base : classPaths) {
                for (String child : spec.paths()) {
                    routes.add(spec.httpMethod() + " " + normalize(base, child));
                }
            }
        }
    }

    private static MappingSpec extractMethodSpec(Method method) {
        GetMapping get = method.getAnnotation(GetMapping.class);
        if (get != null) return new MappingSpec("GET", extract(get.path(), get.value()));

        PostMapping post = method.getAnnotation(PostMapping.class);
        if (post != null) return new MappingSpec("POST", extract(post.path(), post.value()));

        PutMapping put = method.getAnnotation(PutMapping.class);
        if (put != null) return new MappingSpec("PUT", extract(put.path(), put.value()));

        PatchMapping patch = method.getAnnotation(PatchMapping.class);
        if (patch != null) return new MappingSpec("PATCH", extract(patch.path(), patch.value()));

        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (delete != null) return new MappingSpec("DELETE", extract(delete.path(), delete.value()));

        return null;
    }

    private static String[] extract(String[] primary, String[] secondary) {
        if (primary != null && primary.length > 0) {
            return normalizeArray(primary);
        }
        if (secondary != null && secondary.length > 0) {
            return normalizeArray(secondary);
        }
        return new String[]{""};
    }

    private static String[] normalizeArray(String[] values) {
        String[] out = new String[values.length];
        for (int i = 0; i < values.length; i++) {
            out[i] = values[i] == null ? "" : values[i].trim();
        }
        return out;
    }

    private static String normalize(String base, String child) {
        String left = base == null ? "" : base.trim();
        String right = child == null ? "" : child.trim();

        if (left.isBlank() && right.isBlank()) {
            return "/";
        }

        if (left.endsWith("/")) left = left.substring(0, left.length() - 1);
        if (!left.startsWith("/") && !left.isBlank()) left = "/" + left;

        if (!right.isBlank() && !right.startsWith("/")) {
            right = "/" + right;
        }

        String merged = (left + right).replaceAll("//+", "/");
        return merged.isBlank() ? "/" : merged;
    }

    private static void assertHas(Set<String> routes, String expected) {
        assertTrue(routes.contains(expected), "Missing route mapping: " + expected);
    }

    private record MappingSpec(String httpMethod, String[] paths) {
    }
}