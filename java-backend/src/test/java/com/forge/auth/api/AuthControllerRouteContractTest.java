package com.forge.auth.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthControllerRouteContractTest {

    @Test
    void includesRequiredAuthParityRoutes() {
        Set<String> routes = collectRoutes();

        assertHas(routes, "/api/auth/login");
        assertHas(routes, "/api/auth/logout");
        assertHas(routes, "/api/auth/refresh");
        assertHas(routes, "/api/auth/me");
        assertHas(routes, "/api/auth/profile");
        assertHas(routes, "/api/auth/contact-admin");
        assertHas(routes, "/api/auth/verify-2fa");
        assertHas(routes, "/api/auth/register");
    }

    private static void assertHas(Set<String> routes, String path) {
        assertTrue(routes.contains(path), "Missing route mapping: " + path);
    }

    private static Set<String> collectRoutes() {
        Set<String> routes = new LinkedHashSet<>();
        String base = "";

        RequestMapping classMapping = AuthController.class.getAnnotation(RequestMapping.class);
        if (classMapping != null && classMapping.value().length > 0) {
            base = classMapping.value()[0];
        }

        for (Method method : AuthController.class.getDeclaredMethods()) {
            GetMapping get = method.getAnnotation(GetMapping.class);
            if (get != null) {
                addRoutes(routes, base, get.value(), get.path());
            }

            PostMapping post = method.getAnnotation(PostMapping.class);
            if (post != null) {
                addRoutes(routes, base, post.value(), post.path());
            }
        }
        return routes;
    }

    private static void addRoutes(Set<String> routes, String base, String[] values, String[] paths) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                routes.add(join(base, value));
            }
        }
        for (String path : paths) {
            if (path != null && !path.isBlank()) {
                routes.add(join(base, path));
            }
        }
    }

    private static String join(String base, String path) {
        if (path.startsWith("/")) {
            return base + path;
        }
        return base + "/" + path;
    }
}
