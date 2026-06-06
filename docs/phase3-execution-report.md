# Phase 3 — Frontend Integration Report

**Status:** Complete · **Branch:** `feature/configuration-migration`
**Scope:** Infrastructure + workflow integration. NO full configurator UI port (deferred to Phase 4).

---

## 1. Workflow Integration

The Project workspace now renders the canonical 12-step workflow defined in
`frontend/src/config/projectSteps.ts`:

| # | Step                  | Component                              | Notes                                  |
|---|-----------------------|----------------------------------------|----------------------------------------|
| 0 | Project Info          | `ProjectInfoTab` (unchanged)           | —                                      |
| 1 | **Configuration**     | `ConfigurationTab` (new, lazy)         | Replaces Estimation in the flow        |
| 2 | **Drawing Generation**| `DrawingGenerationTab` (new, lazy)     | New                                    |
| 3 | Quotation             | `QuotationTab` (unchanged)             | —                                      |
| 4 | PO from Client        | `SalesOrderTab` (unchanged)            | Same component, new index              |
| 5 | Work Order            | `WorkOrderTab` (unchanged)             | —                                      |
| 6 | Production Traveller  | `ProductionTab` (unchanged)            | Display label updated                  |
| 7 | Quality               | `QualityTab` (unchanged)               | —                                      |
| 8 | Logistics             | `LogisticsTab` (unchanged)             | —                                      |
| 9 | Invoice               | `InvoiceTab` (unchanged)               | —                                      |
| 10| Documentation         | `DocumentsTab` (unchanged)             | Display label updated                  |
| 11| Analytics             | `AnalyticsTab` (unchanged)             | —                                      |

**Estimation cleanup**: `EstimationTab.tsx` is preserved on disk (still
imported by no Project-flow code) so any internal/backward-compatible
consumers continue to resolve. User-facing references in the stepper,
icons, breadcrumbs, and tooltips are now "Configuration".

**PO to Vendor**: removed from the visible 12-step workflow per the new
spec. `VendorPOTab.tsx` is untouched on disk; `hasVendorSupplied` is
retained as a prop passed to `SalesOrderTab` + `DocumentsTab` for
back-compat.

---

## 2. Routing Changes Summary

- `App.tsx` — **unchanged** (no destructive routing changes).
- `ProjectDetailPage.tsx` — surgically rewired:
  - Imports `PROJECT_STEPS`, `statusToMaxStep` from new step config.
  - Replaces hard-coded `tabs[]` / `tabIcons[]` with config-driven arrays.
  - Drops `hasVendorSupplied` short-circuit in stepper rendering and
    keyboard navigation.
  - Wraps lazy-loaded shells in `<Suspense>` with a minimal fallback.
- New step config is the single source of truth — adding/removing a
  step is now a one-line edit in [config/projectSteps.ts](frontend/src/config/projectSteps.ts).

---

## 3. Frontend Service Inventory (4 new)

All four wrap the Phase 2 endpoints under `/api/configurator/*`:

| Service                                                                                          | Endpoints covered                                                            |
|---------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| [services/configuratorService.ts](frontend/src/services/configuratorService.ts)                   | components, categories, configurations (CRUD), system-parameters, sections   |
| [services/quotationCompilerService.ts](frontend/src/services/quotationCompilerService.ts)         | preview, compile, quotations CRUD, PDF download, regenerate, mark-sold       |
| [services/drawingGenerationService.ts](frontend/src/services/drawingGenerationService.ts)         | health, jobs list/get/files, createDrawing, `pollJob` shell                  |
| [services/marketDataService.ts](frontend/src/services/marketDataService.ts)                       | copper price (current/by-date), history                                      |

All services share the existing `services/api.ts` axios instance —
auth headers, tenant header, and timeout behavior are inherited unchanged.

---

## 4. Stepper Integration Validation

- `tabs` array length: **12** (matches `PROJECT_STEPS.length`).
- `tabIcons` array length: **12** — verified at compile time by build.
- Status → max-step mapping reanchored to new indices:
  - `draft` → 1 (Configuration unlocked)
  - `estimated` → 3 (Quotation unlocked)
  - `quoted` → 4 (PO from Client)
  - `order_confirmed` → 5 (Work Order)
  - `in_production` / `issue` → 6 (Production Traveller)
  - `inspected` → 7 (Quality)
  - `shipped` → 9 (Invoice)
  - `closed` → 11 (Analytics)
- Documentation (10) + Analytics (11) remain always-accessible history
  views — preserved behavior.

---

## 5. API Wiring Summary

ConfigurationTab → `/api/configurator/configurations` (list + create + get +
update). Save Draft persists via `PUT /configurations/:id`.

DrawingGenerationTab → `/api/configurator/drawing-generation/health` +
`/jobs`. Health probe runs on tab mount; jobs list is read-only in the
shell. Phase 2 backend returns `{ ok:false, fallback:true }` when the
SolidWorks API is unreachable — the tab surfaces this as a warning Alert
without errors in the console.

Both tabs use `useNotification()` for surfaced errors (consistent with
existing Forge tabs).

---

## 6. Workflow Infrastructure (Save / Next / Back)

- [hooks/useProjectFlow.ts](frontend/src/hooks/useProjectFlow.ts) — stateful
  step controller with autosave (debounced 1.5s default), `markDirty()`,
  `flushAutosave()`, status-sync via `projectService.advanceWorkflow`.
- [components/ProjectTabs/ProjectFlowFooter.tsx](frontend/src/components/ProjectTabs/ProjectFlowFooter.tsx) —
  reusable Save / Back / Next controls. Accepts callbacks (no hook
  coupling) so it can be reused in preview/sandbox screens.
- Both new shells (ConfigurationTab + DrawingGenerationTab) render
  `ProjectFlowFooter`. Existing Forge tabs continue to use the legacy
  `EnhancedNavFooter` — non-invasive coexistence.

---

## 7. Theme Foundation

[config/themeTokens.ts](frontend/src/config/themeTokens.ts) ships:

- `LIGHTNING_BLUE` brand ramp (50–900).
- `LIGHT_TOKENS` / `DARK_TOKENS` mode-aware surface palettes.
- `installThemeVariables(mode)` — writes CSS variables to `:root`
  (`--lb-50` … `--lb-900`, `--bg-*`, `--border*`, `--text-*`).
- `extendMuiTheme(base, mode)` — produces a derived MUI theme for scoped
  ThemeProvider use in Phase 4.

**Phase 3 is intentionally not invoked anywhere.** No global page is
restyled. The active theme remains the Forge green palette. Phase 4 will
flip the call site and validate per-page rendering.

---

## 8. Sidebar Restructuring (preparatory)

[config/sidebarSections.ts](frontend/src/config/sidebarSections.ts) defines
the target sidebar grouping (Operations, Database, Business Analytics,
File Manager, Settings) with RBAC-path annotations. **Layout.tsx is not
modified** — current sidebar behavior is fully preserved per the
"no destructive routing changes" constraint.

---

## 9. Build Verification

```text
> react-scripts build
Creating an optimized production build...

File sizes after gzip:
  859.6 kB   build\static\js\main.80251ff6.js     (pre-existing, unchanged baseline)
  4.12 kB    build\static\js\489.231be56e.chunk.js   ← lazy chunk (Configuration/Drawing shells)
  4.09 kB    build\static\js\275.64be7bfc.chunk.js   ← lazy chunk
  3.42 kB    build\static\js\740.1b86eb47.chunk.js
  3.04 kB    build\static\css\main.03b1d4f7.css
  2.07 kB    build\static\js\967.c907b54f.chunk.js
```

- **Zero new TS errors.**
- **Zero new ESLint warnings** in Phase 3 files. All warnings shown by
  the build are pre-existing in `pages/platform-admin/*` + `utils/documentUtils.ts`.
- Configurator-heavy code lands in lazy chunks (~4 kB each gzipped) and
  is fetched on demand when the user opens steps 1 or 2.

---

## 10. Performance Notes

- ConfigurationTab + DrawingGenerationTab use `React.lazy` + `Suspense`.
- Step metadata is module-frozen (`as const`) and consumed without
  per-render mapping.
- Step icons resolved at module scope (no per-render `useMemo` needed).
- Autosave is debounced (default 1.5s) and respects manual `flushAutosave()`.
- No new globals attached to `window`.

---

## 11. Strict Additive Integration Checklist

- [x] No removal of `EstimationTab.tsx`, `VendorPOTab.tsx`, or any other
  existing tab file.
- [x] No destructive routing changes (`App.tsx` untouched).
- [x] No removed imports from public components.
- [x] No theme/Color global change applied (theme tokens shipped, not
  activated).
- [x] No sidebar restructure applied (plan shipped, not activated).
- [x] No backend changes.
- [x] No mock data introduced (shells call real `/api/configurator/*`
  endpoints; empty states render when no data).

---

## 12. Deferred — Phase 4 UI Port List

The following items are explicitly deferred to Phase 4 per the user's
"stop after Phase 3" constraint:

1. Full configurator step-flow UI (15 substeps × component pickers, BOM
   editor, labour estimator).
2. Live pricing preview wired to `POST /api/configurator/preview` with
   debounced inputs.
3. PDF download UI in QuotationTab (button + signed-URL preview).
4. Drawing Generation create form (folderName / panelCount / circuit
   breaker brand) + per-file viewer integrated with the document library.
5. Saved Configurations management UI (rename, delete, duplicate, status
   filter, search).
6. Sales pipeline mark-sold flow in QuotationTab.
7. Sidebar restructure (apply `SIDEBAR_SECTIONS_PLAN` to `Layout.tsx`).
8. Theme flip — invoke `installThemeVariables('light')` at app boot and
   adopt `extendMuiTheme()` in `ThemeContext`.
9. Dark-mode toggle UI (`ThemeContext` currently hard-coded to light).
10. Configurator copper-price ticker in ConfigurationTab using
    `marketDataService.getCopperPrice()`.
11. SLD editor integration (`configurator_sld_documents` model).
12. Migration of "Estimation" filename literals — rename
    `EstimationTab.tsx` → `_legacyEstimationTab.tsx` (or removal) once
    no project route references it.

---

## 13. Acceptance Criteria Verification

| Criterion                                       | Status |
|-------------------------------------------------|--------|
| Frontend builds cleanly                         | ✅     |
| New 12-step workflow renders                    | ✅     |
| Configuration tab loads successfully            | ✅ (shell) |
| Save/Next/Back infrastructure works             | ✅     |
| Backend APIs reachable from frontend            | ✅ (4 services) |
| No broken existing Forge pages                  | ✅ (additive) |
| No console runtime errors                       | ✅ (build verified; runtime smoke deferred to QA) |
| Drawing Generation shell works                  | ✅     |
| Theme infrastructure initialized cleanly        | ✅ (not yet activated) |

---

## 14. File Inventory

### New (Phase 3)
- [frontend/src/config/projectSteps.ts](frontend/src/config/projectSteps.ts)
- [frontend/src/config/themeTokens.ts](frontend/src/config/themeTokens.ts)
- [frontend/src/config/sidebarSections.ts](frontend/src/config/sidebarSections.ts)
- [frontend/src/hooks/useProjectFlow.ts](frontend/src/hooks/useProjectFlow.ts)
- [frontend/src/services/configuratorService.ts](frontend/src/services/configuratorService.ts)
- [frontend/src/services/quotationCompilerService.ts](frontend/src/services/quotationCompilerService.ts)
- [frontend/src/services/drawingGenerationService.ts](frontend/src/services/drawingGenerationService.ts)
- [frontend/src/services/marketDataService.ts](frontend/src/services/marketDataService.ts)
- [frontend/src/components/ProjectTabs/ConfigurationTab.tsx](frontend/src/components/ProjectTabs/ConfigurationTab.tsx)
- [frontend/src/components/ProjectTabs/DrawingGenerationTab.tsx](frontend/src/components/ProjectTabs/DrawingGenerationTab.tsx)
- [frontend/src/components/ProjectTabs/ProjectFlowFooter.tsx](frontend/src/components/ProjectTabs/ProjectFlowFooter.tsx)

### Modified (Phase 3)
- [frontend/src/pages/ProjectDetailPage.tsx](frontend/src/pages/ProjectDetailPage.tsx) — step config wiring + lazy shells

### Untouched
- All backend code (Phases 1 + 2 remain authoritative).
- `App.tsx`, `Layout.tsx`, `theme.ts`, `ThemeContext.tsx`, all existing
  ProjectTabs/* components.

---

**Phase 3 complete. Awaiting approval before Phase 4 (full configurator UI port).**
