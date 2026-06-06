# Phase 7 — Configurator Component Management UI + Recycle Bin Integration

**Branch:** `feature/configuration-migration`
**Status:** Implementation complete, awaiting review.

---

## 1. Source Analysis (legacy `config/`)

### `config/src/pages/AddComponent.tsx`
- Single page covering create + (effectively) edit through a flat `Partial<NewComponentInput>` form plus a 21-field `breakerSpecs: Record<BreakerSpecField,string>` map.
- Submit pipeline:
  1. Uppercases `category`.
  2. Detects breaker categories via `category.includes('CIRCUIT BREAKER') || category === 'BREAKERS' || === 'BREAKER'`.
  3. Pre-submit duplicate check by name + category.
  4. Derives `labor_cost` from sum of `lbr_*` if blank.
  5. Mirrors `mat_cost → material_cost → price`.
  6. Builds `specifications` JSON only for breaker categories.
  7. Emits `tps:category-updated` `CustomEvent` after create.
- Admin-gated client-side; hard refresh of categories from multiple endpoints.

### `config/src/pages/Components.tsx`
- 25-row paginated list, search box, category filter, edit dialog, immediate (no-confirm) delete, in-table breaker-spec editing inside the edit dialog.

### Decisions taken when porting to Forge
| Aspect | Legacy | Forge port | Reason |
|---|---|---|---|
| Layout | Material-UI flat form | MUI 5 sections + Accordion for specifications | Aligns with `RawMaterialMasterPage` / `PartsMasterPage` style |
| Notifications | local `toast` state | `useNotification()` (Forge) | Single notification system |
| Delete UX | Immediate, no confirm | Confirm dialog → soft delete | Matches Forge safety bar |
| Edit | Modal dialog inside list page | Dedicated route `/components/:id/edit` | Deep-linkable, reuses Add form |
| Category refresh | 4-source merge | Single `/configurator/categories` (already canonicalized server-side in Phase 4) | DRY |
| Breaker specs | Editable on inactive categories | Disabled until breaker category | Parity with backend semantics |
| Recycle Bin | None / parallel idea | Existing Forge recycle-bin via `paranoid:true` | "DO NOT create parallel inconsistent architecture" |

---

## 2. Backend changes (additive only)

### `backend/src/services/recycleBinService.js`
- Imported `ConfiguratorComponent` from `../models`.
- Added module to `MODEL_MAP`:
  ```js
  configurator_components: { model: ConfiguratorComponent, nameField: 'name', label: 'Components' }
  ```
- No new routes, no new controllers — list / restore / permanent-delete inherited from existing
  `recycleBinService.{list, restore, permanentDelete, bulkRestore, bulkPermanentDelete}` and the
  `recycleBinRoutes.js` `:module` URL pattern.

### `backend/src/controllers/configuratorController.js`
- `deleteComponent` now stamps `deleted_by = req.user.id` before `row.destroy()` so the recycle bin can attribute the action (was previously left null).

### Cascading
- `ConfiguratorComponentCompatibility.component_id` and `.compatible_component_id` already declared `onDelete: 'CASCADE'`; permanent delete therefore works without a custom cascade helper.

---

## 3. Frontend additions

### Service — `frontend/src/services/configuratorService.ts`
- New types: `NewComponentInput`, `ConfiguratorCategoryCount`.
- New methods: `createComponent`, `updateComponent`, `deleteComponent`, `componentCategoryCounts`, `upsertCategory`.

### Pages
| File | Purpose |
|---|---|
| `frontend/src/pages/ComponentsPage.tsx` | Paginated list (25/pg), debounced search (300 ms), category + active filters, edit / delete confirm. |
| `frontend/src/pages/AddComponentPage.tsx` | Create + edit (`/components/new` and `/components/:id/edit`). Identity, Pricing, Labour Hours, Specifications (collapsible, breaker-only). Pre-submit duplicate check, dirty-state guard (`beforeunload` + nav confirm), admin gate (UI hint; backend `requireAdmin` enforces). |
| `frontend/src/pages/RecycleBinPage.tsx` | Added `configurator_components` entry to `MODULE_CONFIG` (Memory icon, label "Components"). Tab + table render driven by `MODULE_CONFIG`, so no further changes needed. |

### Sidebar — `frontend/src/components/Layout/Layout.tsx`
- Imported `Memory as ComponentsIcon`.
- Under **Database** section, after Parts Master:
  ```tsx
  {canSeeSidebarItem(user?.role, '/components', userIsCoAdmin) &&
    renderNavItem(<ComponentsIcon />, 'Components', '/components', c)}
  ```
- "Add Component" intentionally **not** added as a separate sidebar entry (Add button lives on the Components list page; matches Forge convention used by Vendors / Clients).

### Routing — `frontend/src/App.tsx`
```tsx
<Route path="components"           element={<RBACRoute path="/components"><ComponentsPage /></RBACRoute>} />
<Route path="components/new"       element={<RBACRoute path="/components"><AddComponentPage /></RBACRoute>} />
<Route path="components/:id/edit"  element={<RBACRoute path="/components"><AddComponentPage /></RBACRoute>} />
```

---

## 4. API surface used

| Endpoint | Method | Notes |
|---|---|---|
| `/api/configurator/components` | GET | List w/ q, category, is_active, skip, limit |
| `/api/configurator/components` | POST | Create (admin) |
| `/api/configurator/components/:id` | GET | Read |
| `/api/configurator/components/:id` | PUT | Update (admin) |
| `/api/configurator/components/:id` | DELETE | Soft delete (admin) — now stamps deleted_by |
| `/api/configurator/categories` | GET | Category list for filters/autocomplete |
| `/api/recycle-bin?module=configurator_components` | GET | List soft-deleted components |
| `/api/recycle-bin/configurator_components/:id/restore` | POST | Restore |
| `/api/recycle-bin/configurator_components/:id` | DELETE | Permanent delete (main_admin only) |

**No new routes added.** All component recycle-bin operations reuse the existing module-driven router.

---

## 5. Validation matrix

| Field / rule | Where enforced |
|---|---|
| `name` required | Client (`AddComponentPage`) + server (`express-validator`) |
| Numeric ≥ 0 (`price`, `material_cost`, `labor_cost`, `mat_cost`, all `lbr_*`) | Client form |
| Pricing mirror (`mat_cost → material_cost → price` when blank) | Client (parity with legacy) |
| Labor cost auto-derive from `lbr_*` sum when blank | Client |
| Specifications only persisted for breaker categories | Client (`isBreakerCategory`) |
| Duplicate name + category warning (create only) | Client pre-submit |
| Dirty-state guard | `beforeunload` + cancel/back confirms |
| Admin gate | UI hint + server `requireAdmin` |

---

## 6. Recycle Bin flow

1. Admin clicks delete on `/components` → `DELETE /api/configurator/components/:id` → row soft-deleted, `deleted_by` stamped.
2. Owner / Co-Owner navigates to `/recycle-bin` → "Components" tab populated automatically because `MODEL_MAP` and `MODULE_CONFIG` both contain `configurator_components`.
3. Restore → `POST /api/recycle-bin/configurator_components/:id/restore` → `deleted_at` cleared, `is_active=true`, audit logged.
4. Permanent delete (Owner only) → `DELETE /api/recycle-bin/configurator_components/:id` → cascade through compatibility rows (FK `ON DELETE CASCADE`), audit logged.

---

## 7. Build verification

```
> react-scripts build
Compiled with warnings.

File sizes after gzip:
  870.14 kB  build/static/js/main.6f0c61a4.js   (Phase 6 baseline: 860.42 kB; Δ +9.72 kB)
  32.75 kB   build/static/js/631.7bfc4f05.chunk.js
  ...
```

Warnings are pre-existing `no-unused-vars` lint hints in unrelated files. **No errors.** **No new warnings introduced by Phase 7 files.**

---

## 8. Responsive verification

- `ComponentsPage`: filter row uses `Stack direction={{ xs: 'column', md: 'row' }}`; table is wrapped in `TableContainer` for horizontal scroll on small screens.
- `AddComponentPage`: every field uses `Grid item xs={12} md={…}`; collapses to a single column on phones; Accordion for specifications keeps the page compact.

---

## 9. Deviations from spec

1. **Add Component sidebar entry** — folded into the Components page (FAB-style "Add" button) instead of a separate sidebar row, matching `VendorsPage` / `ClientsPage` conventions.
2. **CSV import** present in legacy `AddComponent.tsx` was **not** ported in this phase; the legacy `dbService.importComponentsCsv` has no Forge equivalent yet. Tracking this as a follow-up if required.
3. **MUI DataGrid** — used `Table` (matching existing Forge admin pages) instead of `DataGrid`, since Forge has not adopted `@mui/x-data-grid` elsewhere; introducing it here for one page would be an unwarranted dependency.

---

## 10. Acceptance criteria checklist

- [x] Components list with search, pagination, category + active filters.
- [x] Edit + soft-delete actions (with confirm).
- [x] Add / edit form with category, part number, costs, labour, specifications.
- [x] Specifications gated to breaker categories.
- [x] Validation (required name, non-negative numerics, duplicate warning).
- [x] Dirty-state guard.
- [x] Recycle Bin integration (no parallel system; reused existing infra).
- [x] Sidebar entry under Database.
- [x] RBAC enforced (UI + backend).
- [x] Build passes.

Awaiting approval before commit.
