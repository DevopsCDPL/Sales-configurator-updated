package com.forge.configurator.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfiguratorControllerRouteContractTest {

    @Test
    void includesExpectedLegacyAndModernAliases() {
        Set<String> routes = collectRoutes();

        assertHas(routes, "/api/quotation/health");

        assertHas(routes, "/api/configurator/components");
        assertHas(routes, "/api/components");

        assertHas(routes, "/api/configurator/categories");
        assertHas(routes, "/api/categories");

        assertHas(routes, "/api/configurator/configurations");
        assertHas(routes, "/api/configs");

        assertHas(routes, "/api/configurator/preview");
        assertHas(routes, "/api/quotation/preview");

        assertHas(routes, "/api/configurator/compile");
        assertHas(routes, "/api/quotation/compile");

        assertHas(routes, "/api/configurator/quotations");
        assertHas(routes, "/api/quotation");

        assertHas(routes, "/api/configurator/quotations/{id}");
        assertHas(routes, "/api/quotation/{id}");

        assertHas(routes, "/api/configurator/quotations/{id}/mark-sold");
        assertHas(routes, "/api/quotation/{id}/mark-sold");

        assertHas(routes, "/api/configurator/quotations/{id}/pdf");
        assertHas(routes, "/api/quotation/{id}/pdf");

        assertHas(routes, "/api/configurator/system-parameters");
        assertHas(routes, "/api/quotation/system-parameters");

        assertHas(routes, "/api/configurator/system-sections/{n}");
        assertHas(routes, "/api/quotation/system-sections/{n}");

        assertHas(routes, "/api/configurator/market/copper");
        assertHas(routes, "/api/market/copper");

        assertHas(routes, "/api/configurator/drawing-generation/health");
        assertHas(routes, "/api/solidworks/health");

        assertHas(routes, "/api/configurator/drawing-generation/create");
        assertHas(routes, "/api/solidworks/create");

        assertHas(routes, "/api/configurator/drawing-generation/jobs");
        assertHas(routes, "/api/solidworks/jobs");

        assertHas(routes, "/api/configurator/drawing-generation/jobs/{jobId}");
        assertHas(routes, "/api/solidworks/jobs/{jobId}");

        assertHas(routes, "/api/configurator/drawing-generation/jobs/{jobId}/files");
        assertHas(routes, "/api/solidworks/jobs/{jobId}/files");

        assertHas(routes, "/api/configurator/drawing-generation/jobs/{jobId}/download");
        assertHas(routes, "/api/solidworks/jobs/{jobId}/download");
    }

    private static void assertHas(Set<String> routes, String path) {
        assertTrue(routes.contains(path), "Missing route mapping: " + path);
    }

    private static Set<String> collectRoutes() {
        Set<String> routes = new LinkedHashSet<>();
        for (Method method : ConfiguratorController.class.getDeclaredMethods()) {
            GetMapping get = method.getAnnotation(GetMapping.class);
            if (get != null) {
                addRoutes(routes, get.value(), get.path());
            }

            PostMapping post = method.getAnnotation(PostMapping.class);
            if (post != null) {
                addRoutes(routes, post.value(), post.path());
            }

            PutMapping put = method.getAnnotation(PutMapping.class);
            if (put != null) {
                addRoutes(routes, put.value(), put.path());
            }

            DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
            if (delete != null) {
                addRoutes(routes, delete.value(), delete.path());
            }
        }
        return routes;
    }

    private static void addRoutes(Set<String> routes, String[] values, String[] paths) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                routes.add(value);
            }
        }
        for (String path : paths) {
            if (path != null && !path.isBlank()) {
                routes.add(path);
            }
        }
    }
}
