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

class EnterpriseModuleRouteContractTest {

    @Test
    void exposesExpectedParityRoutes() {
        Set<String> routes = new LinkedHashSet<>();
        collect(routes, ClientParityController.class);
        collect(routes, VendorParityController.class);
        collect(routes, ProjectParityController.class);
        collect(routes, DocumentParityController.class);
        collect(routes, FileManagerParityController.class);
        collect(routes, RecycleBinParityController.class);

        assertHas(routes, "/api/clients");
        assertHas(routes, "/api/clients/{id}");

        assertHas(routes, "/api/vendors");
        assertHas(routes, "/api/vendors/materials/all");
        assertHas(routes, "/api/vendors/{id}");

        assertHas(routes, "/api/projects/workflow");
        assertHas(routes, "/api/projects/next-quotation-number");
        assertHas(routes, "/api/projects/next-project-number");
        assertHas(routes, "/api/projects");
        assertHas(routes, "/api/projects/{id}");
        assertHas(routes, "/api/projects/{id}/status");
        assertHas(routes, "/api/projects/{id}/advance-workflow");
        assertHas(routes, "/api/projects/{id}/copy");
        assertHas(routes, "/api/projects/{id}/select-revision");
        assertHas(routes, "/api/projects/{id}/traveler-type");
        assertHas(routes, "/api/projects/{id}/analytics");
        assertHas(routes, "/api/projects/{id}/commission");

        assertHas(routes, "/api/documents/project/{projectId}");
        assertHas(routes, "/api/documents/{id}");
        assertHas(routes, "/api/documents/{id}/view");
        assertHas(routes, "/api/documents/{id}/download");
        assertHas(routes, "/api/documents/project/{projectId}/quotation");
        assertHas(routes, "/api/documents/project/{projectId}/work-order");
        assertHas(routes, "/api/documents/project/{projectId}/traveller");
        assertHas(routes, "/api/documents/project/{projectId}/coc");
        assertHas(routes, "/api/documents/project/{projectId}/packing-list");
        assertHas(routes, "/api/documents/project/{projectId}/upload");
        assertHas(routes, "/api/documents/{id}/finalize");
        assertHas(routes, "/api/documents/merge");

        assertHas(routes, "/api/file-manager/tree");
        assertHas(routes, "/api/file-manager/browse");
        assertHas(routes, "/api/file-manager/r2/projects");
        assertHas(routes, "/api/file-manager/r2/project-files");
        assertHas(routes, "/api/file-manager/r2/view");
        assertHas(routes, "/api/file-manager/r2/download");
        assertHas(routes, "/api/file-manager/r2/signed-url");
        assertHas(routes, "/api/file-manager/r2/file");
        assertHas(routes, "/api/file-manager/folders/by-path");
        assertHas(routes, "/api/file-manager/folders/{id}");
        assertHas(routes, "/api/file-manager/documents");
        assertHas(routes, "/api/file-manager/parts");
        assertHas(routes, "/api/file-manager/inventory");
        assertHas(routes, "/api/file-manager/projects");
        assertHas(routes, "/api/file-manager/upload");
        assertHas(routes, "/api/file-manager/ensure-project-folders");
        assertHas(routes, "/api/file-manager/ensure-procurement-folders");
        assertHas(routes, "/api/file-manager/documents/{id}/status");
        assertHas(routes, "/api/file-manager/documents/{id}/download");
        assertHas(routes, "/api/file-manager/documents/{id}/view");
        assertHas(routes, "/api/file-manager/view-by-path");

        assertHas(routes, "/api/recycle-bin");
        assertHas(routes, "/api/recycle-bin/{module}/{id}/restore");
        assertHas(routes, "/api/recycle-bin/{module}/{id}");
        assertHas(routes, "/api/recycle-bin/bulk-restore");
        assertHas(routes, "/api/recycle-bin/bulk-delete");
    }

    private static void collect(Set<String> routes, Class<?> controller) {
        RequestMapping classMapping = controller.getAnnotation(RequestMapping.class);
        String[] classPaths = extract(classMapping == null ? null : classMapping.path(), classMapping == null ? null : classMapping.value());

        for (Method method : controller.getDeclaredMethods()) {
            String[] methodPaths = extractMethodPaths(method);
            if (methodPaths == null) {
                continue;
            }
            for (String base : classPaths) {
                for (String child : methodPaths) {
                    routes.add(normalize(base, child));
                }
            }
        }
    }

    private static String[] extractMethodPaths(Method method) {
        GetMapping get = method.getAnnotation(GetMapping.class);
        if (get != null) return extract(get.path(), get.value());

        PostMapping post = method.getAnnotation(PostMapping.class);
        if (post != null) return extract(post.path(), post.value());

        PutMapping put = method.getAnnotation(PutMapping.class);
        if (put != null) return extract(put.path(), put.value());

        PatchMapping patch = method.getAnnotation(PatchMapping.class);
        if (patch != null) return extract(patch.path(), patch.value());

        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (delete != null) return extract(delete.path(), delete.value());

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
}
