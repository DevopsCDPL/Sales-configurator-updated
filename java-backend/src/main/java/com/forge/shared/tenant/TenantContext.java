package com.forge.shared.tenant;

import java.util.UUID;

public final class TenantContext {
    private static final ThreadLocal<State> HOLDER = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(State state) {
        HOLDER.set(state);
    }

    public static State get() {
        return HOLDER.get();
    }

    public static UUID companyId() {
        State state = HOLDER.get();
        return state == null ? null : state.companyId();
    }

    public static void clear() {
        HOLDER.remove();
    }

    public record State(UUID companyId, boolean platformAdmin, UUID activeCompanyId) {
    }
}
