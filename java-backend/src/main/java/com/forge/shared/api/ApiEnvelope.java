package com.forge.shared.api;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ApiEnvelope {
    private ApiEnvelope() {
    }

    public static Map<String, Object> success(Object data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", data);
        return body;
    }

    public static Map<String, Object> success(Object data, String key, Object value) {
        Map<String, Object> body = success(data);
        body.put(key, value);
        return body;
    }

    public static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("message", message);
        return body;
    }
}
