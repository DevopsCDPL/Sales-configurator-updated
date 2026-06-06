# Configuration Migration Analysis (Phase 0)

> Branch: `feature/configuration-migration`
> Source spec: [Sales Configurator ENHANCEMENTS PH4.pdf](../Sales%20Configurator%20ENHANCEMENTS%20PH4.pdf) — extracted text in [docs/_pdf_extract.txt](_pdf_extract.txt)
> Source project: [config/](../config) (Sales Configurator — React + Vite + TS frontend, FastAPI + SQLAlchemy backend)
> Target project: Forge — [frontend/](../frontend) (React + MUI + TS) and [backend/](../backend) (Express + Sequelize JS)

This document is the canonical Phase 0 deliverable. **No production code is altered until each subsequent phase finishes with a green build.**

---

## 1. PDF Specification — Distilled Requirements

| # | Requirement | Affected Forge surface |
|---|-------------|------------------------|
| R1 | Duplicate Forge app, integrate configuration module under former Estimation slot | `frontend/src/pages/ProjectDetailPage.tsx`, sidebar |
| R2 | Insert configuration module into estimation module (replace it) | `ProjectTabs/EstimationTab.tsx` |
| R3 | Theme: dark + lightning-blue, exactly like configurator | `theme.ts`, `index.css`, `ThemeContext` |
| R4 | New project flow: Project Info → **Configuration** → Drawing Generation → Quotation → PO from Client → Work Order → Production Traveller → Quality → Logistics → Invoice → Documentation → Analytics | Stepper in `ProjectDetailPage.tsx` |
| R5 | Top progress bar with **Save / Next / Back** on every project step | New shared component (`ProjectFlowFooter`) replacing/wrapping `EnhancedNavFooter` |
| R6 | Configuration sub-flow (15 steps): System Design → Enclosure → Bussing → Glastic → Cam Lock & Panel → SPD & ATS → Controls → CT/VT/CPT → Conduit & Fittings → Wire & Cable → Standard BOM → Labour → +Comp → SLD → Preview → Quotation | New `ConfigurationTab` host with inner stepper |
| R7 | "+Comp", "SLD", "Preview", "Quotation" — previously inside quotation, now standalone Configuration sub-tabs (and the project-level Quotation step still exists as the customer-facing PDF generator) | Splits configurator quotation into reusable sub-views + a project-flow Quotation step |
| R8 | Rename **Start New Estimation** → **Start New Configuration**; Load Configuration & Saved Configurations behave like the configurator | `EstimationTab` create-flow + `SavedConfiguration` page port |
| R9 | Settings tabs as in image: Default Settings | T&C / Notes | Security & Notification | `SettingsPage.tsx` reorg |
| R10 | Database area sub-tabs: Comex Copper | Components | Raw Material | Saved Configuration | Vendor Data | Client Data | New `DatabasePage` (or sidebar group) |
| R11 | Buttons (Save, Next, Back) relocated to top-right per screenshots | All project tabs |

Pages 9–18 of the PDF reiterate "UI works exactly like Forge unless specified, we are just changing the location of the buttons" — so post-Configuration tabs (PO, WO, Production, Quality, Logistics, Invoice, Documentation, Analytics) keep Forge logic and only get button-position + theme changes.

---

## 2. High-Level Architecture Mapping

### 2.1 Source (Sales Configurator)
- **Frontend:** React 18 + Vite + TS, react-router data API, **shadcn/radix UI primitives + Tailwind**, **HSL CSS-variable dark theme** with electric-blue accents, jsPDF + autotable for PDFs, Three.js + GLTF for 3D viewer, IndexedDB cache, no Redux (local state + service layer + heavy `localStorage`).
- **Backend:** FastAPI 0.105, SQLAlchemy 2 (Postgres via psycopg), Alembic, JWT (jose) + OAuth2 (Google/MS), reportlab + Jinja2 templates, ngrok-bridged SolidWorks API, GROQ-backed "Cassandra" assistant.

### 2.2 Target (Forge)
- **Frontend:** React + TS, react-router-dom v6, **MUI v5 + emotion**, MUI X DataGrid/DatePickers, recharts, axios, pdf-lib, react-hook-form, ajv. Currently **light theme only** (see `frontend/src/theme.ts`, primary `#1F7A63`).
- **Backend:** Express 4 + Sequelize 6 on Postgres, JWT (`jsonwebtoken`), pdfkit + pdf-lib, Cloudflare R2 (S3-compatible) via AWS SDK v3, helmet/compression/pino-http, multer, multi-tenant (`company_id` scoping middleware in `tenant.js`/`tenantScope.js`).

### 2.3 Layering parity required after migration
| Layer | Source location (config) | Forge target location |
|------|--------------------------|----------------------|
| API client | `config/src/lib/db-service.ts`, `config/src/lib/config.ts` | `frontend/src/services/configurationService.ts` (NEW), wired to existing axios instance pattern |
| Domain types | `config/src/lib/db-service.ts`, `config/src/types/quotation.ts`, `SystemDesignPanel.tsx` exports | `frontend/src/types/configuration.ts` (NEW), augmenting `frontend/src/types/index.ts` |
| Workflow engine | `config/src/lib/event-engine.ts`, `config/src/lib/field-intelligence.ts`, `config/src/hooks/useFieldIntelligence.ts` | Ported as-is into `frontend/src/lib/configurator/*` |
| Pricing / BOM / labour | `config/backend/app/services/quotation_calc.py`, `component_import.py` + inline logic in `app/routers/quotation.py` | `backend/src/services/configurator/{pricingEngine.js, bomEngine.js, labourEngine.js, quotationCompiler.js}` |
| Persistence | SQLAlchemy models in `config/backend/app/models/{base_models.py, switchgear_components.py}` | New Sequelize models in `backend/src/models/configurator/*` |
| PDF | reportlab + Jinja2 (`config/backend/app/templates/quotation_template.html`) | pdfkit/pdf-lib via `backend/src/utils/pdfGenerator.js` extension or jsPDF on FE (configurator already does FE PDF) |
| File storage | Local generated dir in `config/backend/app/generated/` | Existing R2 via `r2StorageService.js` |

---

## 3. Source Frontend Inventory (`config/`)

### 3.1 Routes (from `config/src/App.tsx`)
| Route | Page | Notes |
|-------|------|-------|
| `/` | `Index.tsx` → `ConfiguratorLayout` | The full configurator workflow host |
| `/orders` | `Orders.tsx` | Drops in Forge as project-flow data, not a separate page |
| `/quotation-history` | `QuotationHistory.tsx` | Folds into Forge `FileManager` + existing quotations |
| `/saved-configuration` | `SavedConfiguration.tsx` | Becomes Database → Saved Configuration tab |
| `/quotation/new` | `QuotationGenerator.tsx` | Replaced by Configuration sub-step + project-level Quotation tab |
| `/quotation/client-details` | `ClientDetails.tsx` | Already covered by Forge `Client` flows |
| `/components`, `/components/new` | `Components.tsx`, `AddComponent.tsx` | Database → Components |
| `/comex-copper` | `EpicorExtract.tsx` | Database → Comex Copper |
| `/insights` | `SalesInsights.tsx` | Folds into Forge Business Analytics |
| `/cassandra` | `CassandraCenter.tsx` | Optional — gated; can be deferred |
| `/drawing-automation` | `DrawingAutomation.tsx` | Becomes Project-flow → Drawing Generation tab |
| `/users` | `UsersManagement.tsx` | Forge already has its own |

### 3.2 Critical components to port
| Component | File | Role |
|-----------|------|------|
| `ConfiguratorLayout` | `config/src/components/ConfiguratorLayout.tsx` (~2400 LOC) | The workflow engine: dynamic step model, category-driven component fetch, save/load, intelligence pipeline. **The single most important port.** |
| `SystemDesignPanel` | `config/src/components/SystemDesignPanel.tsx` (~500+ LOC) | Defines `SystemParameters`, `SectionDefinition`, `ElectricalProtection`, `LayoutHardware` types and editor |
| `MultiBreakerEngine` | `config/src/components/MultiBreakerEngine.tsx` | Breaker-block editor used inside Circuit Breakers steps |
| `ThreeDViewer` | `config/src/components/ThreeDViewer.tsx` | GLTF preview — **deferred** (risk-isolated; behind feature flag) |
| `QuotationEditModal` | `config/src/components/QuotationEditModal.tsx` | Inline edits for quote items |
| Field intelligence | `config/src/lib/field-intelligence.ts` + `hooks/useFieldIntelligence.ts` | Auto-fill / reset directives |
| Event engine | `config/src/lib/event-engine.ts` | `executePipeline` deterministic ordering |
| `QuotationGenerator` | `config/src/pages/QuotationGenerator.tsx` (~2800 LOC) | Quotation pricing + PDF + compare mode. **Split into +Comp / SLD / Preview / Quotation tabs.** |

### 3.3 Hooks
- `config/src/hooks/use-mobile.tsx`, `use-toast.ts` — UI infra; replaced by MUI equivalents.
- `config/src/hooks/useFieldIntelligence.ts` — **PORT VERBATIM** (logic-only).

### 3.4 LocalStorage / IndexedDB keys (must continue to work or be migrated to backend)
| Key | Source | Migration target |
|-----|--------|------------------|
| `tier-power-systems-user` / `-token` / `-token-exp` | `auth-service.ts` | Replaced by Forge `AuthContext` JWT |
| `tier-power-systems-configurations`, `tps-config-favorites` | `SavedConfiguration.tsx` | Persist server-side via new `/api/configurator/configurations` |
| `tps-quotation-snapshots`, `tps-quotation-pricing`, `tps-quotation-rates` | `db-service.ts` | Migrate snapshots into new `configurator_quotation_snapshots` table OR keep client-side parity cache |
| `tps-clients`, `tps-client-details-draft:*` | `ClientDetails.tsx` | Reuse Forge `clients` table (already exists) |
| `tps-copper-snapshot-latest` | `EpicorExtract.tsx` | New `comex_copper_snapshots` table |
| `salesconfig.savedCatalogs.v1`, `show3DViewer` | `ConfiguratorLayout.tsx` | Keep client-side; safe to retain in localStorage |

---

## 4. Source Backend Inventory (`config/backend`)

### 4.1 Routers / endpoints (FastAPI)
| Router (`app/routers/*.py`) | Key endpoints (verbatim where possible) |
|-----------------------------|------------------------------------------|
| `auth` | `POST /token`, `POST /login`, `GET /me`, `POST /forgot-password`, `POST /reset-password`, `GET/PATCH /users`, OAuth2 (Google, MS) |
| `components` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /bulk`, `POST /import-csv`, `GET /category/:category`, `GET /:id/compatible`, `GET /check-compatibility`, `DELETE /by-name`, `GET /stats/category-counts` |
| `categories` | `GET /`, `POST /upsert`, `POST /rebuild` |
| `configs` | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `orders` | `GET /`, `POST /`, `GET /:id`, `PATCH /:id/status`, `POST /:id/cancel` |
| `quotation` | `GET /?skip&limit&q&year&customer&sold`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/mark-sold`, `GET /:id/pdf`, `POST /:id/pdf` |
| `market` | `GET /copper?date=...` |
| `cassandra` | `POST /chat` |
| `solidworks` | `GET /health`, `POST /create`, `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/files`, `GET /jobs/:id/download` |
| (system params) | `GET/PUT /system-parameters/`, `GET/PUT /system-sections/:n` |

### 4.2 Models (SQLAlchemy)
- `base_models.py`
  - `ComponentCategory(id, name, normalized_name unique, created_at)`
  - `User(...)` — superseded by Forge `User` (with mapping of `is_super_admin`, `can_access_cassandra` flags onto Forge custom roles)
  - `Configuration(id, name, description, user_id FK, config_data JSON, created_at, updated_at)`
  - `SystemParameters(id, user_id FK unique, data JSON, created_at, updated_at)`
- `switchgear_components.py`
  - `Component(id, part_number unique, name, category, mat_cost, lbr_cu, lbr_asm, lbr_cnt, lbr_qc, lbr_tst, lbr_eng, lbr_cad, date, comments, subcategory, type, description, price, labor_cost, material_cost, specifications JSON, image_url, is_active, created_at, updated_at, component_type)` + self-many-to-many `compatible_with`
  - `CAMLOCKConnector(id FK, color, amperage, voltage, material, thread_size, panel_thickness, mounting, standards)` — polymorphic on `component_type`

### 4.3 Alembic migrations
1. `add_excel_fields` — Excel cost columns on `components`
2. `add_component_categories_20250923` — `component_categories` table
3. `add_phone_number_20260122` — User.phone_number
4. `add_bom_spec_20260123` — `quotations.bom_spec` (JSON)
5. `add_superadmin_20260315` — User.is_super_admin, can_access_cassandra
6. `add_position_20260421` — User.position

### 4.4 Services
- `category_utils.py` — name normalization
- `component_import.py` — CSV upsert + part-number generation
- `quotation_calc.py` — quotation maths (rates, totals, BOM compilation, margin/markup)
- Inline logic inside `app/routers/quotation.py` for PDF assembly via reportlab + `app/templates/quotation_template.html`

### 4.5 External integrations
- **Comex copper price** (`COMEXLIVE_COPPER_URL`) → port to Forge as cron-able fetch service
- **SolidWorks ngrok bridge** — keep proxied through new Forge route; URL via env
- **GROQ Cassandra** — defer (gated)

---

## 5. Target Forge Backend Inventory (current state)

### 5.1 Models (relevant to integration — Sequelize)
| Model | Table | Notes |
|------|-------|-------|
| `Project` | `projects` | UUID PK; `status` ENUM (`draft, estimated, quoted, order_confirmed, in_production, inspected, shipped, closed`); has `quotation_number`, `quote_info` JSONB, `packages_json` JSONB, `po_number`, `production_traveler_type` |
| `Estimate`, `EstimateItem` | `estimates`, `estimate_items` | Existing Forge cost-estimation model. Needs to host configurator BOM OR be deprecated in favour of new `Configuration` model (decision below). |
| `Client`, `Vendor` | — | Already present; reused for configurator client/vendor management |
| `Document` (+ `NewDocument`) | — | Used for stored PDFs/files |
| `RawMaterial`, `Material`, `Part`, `PartDimension`, `PartTemplate` | — | Forge already has master-data layer; **`Part` overlaps semantically with configurator `Component` but is structurally different** — we will namespace configurator components separately to avoid breaking inventory/procurement |
| `WorkOrder`, `SalesOrder`, `QualityRecord`, `ProjectAnalytics`, `ActivityTimeline` | — | Preserved, not touched |
| `Vendor*`, `Procurement*` (RFQ/PO/Quote) | — | Preserved |
| `Setting`, `SystemModuleConfig`, `Permission`, `CustomRole` | — | Preserved; settings UI relocation only |

### 5.2 Project workflow state
- `Project.status` enum + `STATUS_WORKFLOW` and `STEP_TO_STATUS` maps in [backend/src/services/projectService.js](../backend/src/services/projectService.js).
- Migration step 4 below: **add `'configured'` status** (replacing semantic of `'estimated'` for new projects; `'estimated'` retained for backward-compat of any pre-existing data — though spec allows dropping, we keep ENUM additive to avoid breaking other queries).

### 5.3 Document numbering
- [backend/src/utils/documentNumberGenerator.js](../backend/src/utils/documentNumberGenerator.js) + [backend/src/services/documentNumberingService.js](../backend/src/services/documentNumberingService.js) — type-driven (e.g., `QT-` for quotation). **Add a `CONFIGURATION` type** (`CFG-` prefix) so saved configurations get human-readable IDs.

### 5.4 PDF + storage
- [backend/src/utils/pdfGenerator.js](../backend/src/utils/pdfGenerator.js) (pdfkit) + [pdfTemplate.js](../backend/src/utils/pdfTemplate.js) — extend with `generateConfiguratorQuotation(...)`.
- [backend/src/services/r2StorageService.js](../backend/src/services/r2StorageService.js) — reused as-is for storing generated quotation PDFs.

---

## 6. Target Forge Frontend Inventory (current state)

### 6.1 Stepper (source of project-flow truth)
- [frontend/src/pages/ProjectDetailPage.tsx](../frontend/src/pages/ProjectDetailPage.tsx) defines the 11-step array. Required change: relabel step 2 `Estimation`→`Configuration`, **insert** `Drawing Generation` between Configuration and Quotation.

After Phase 3 the stepper becomes:
```
Project Info → Configuration → Drawing Generation → Quotation → PO from Client →
Work Order → Production Traveller → Quality → Logistics → Invoice → Documentation → Analytics  (12 steps)
```

### 6.2 Estimation surface to refactor
| File | Action |
|------|--------|
| [frontend/src/components/ProjectTabs/EstimationTab.tsx](../frontend/src/components/ProjectTabs/EstimationTab.tsx) | **Replace** with `ConfigurationTab.tsx` hosting the 15-step inner stepper |
| [frontend/src/services/estimateService.ts](../frontend/src/services/estimateService.ts) | Keep for the legacy fallback OR rename → `configurationService.ts`. Decision: keep file path + extend with new endpoints; add a parallel `configuratorService.ts` for new endpoints. |
| [frontend/src/types/index.ts](../frontend/src/types/index.ts) | Augment with Configuration types; do not delete existing Estimate types yet (other tabs reference them) |
| [frontend/src/components/ProjectTabs/{InvoiceTab,WorkOrderTab,AnalyticsTab,QualityTab,ProductionTab}.tsx](../frontend/src/components/ProjectTabs) | Update label-only references from "Estimation" to "Configuration"; preserve data wiring |
| [frontend/src/components/CommandPalette.tsx](../frontend/src/components/CommandPalette.tsx) | Update command labels |
| [frontend/src/utils/calculations.ts](../frontend/src/utils/calculations.ts), [utils/documentUtils.ts](../frontend/src/utils/documentUtils.ts) | Rename document type strings as needed |

### 6.3 Theme target
- Today: MUI light palette, primary `#1F7A63`, no dark mode.
- After Phase 6: dark base + lightning-blue accents matching configurator HSL tokens in [config/src/index.css](../config/src/index.css). MUI palette will get a custom `dark` mode wired through `ThemeContext`. CSS variable bridge in `frontend/src/index.css` aligns with configurator names so component visual parity is one-shot.

---

## 7. Estimation → Configuration Replacement Mapping

| Forge "Estimation" surface | Becomes |
|----------------------------|---------|
| Stepper label `Estimation` | `Configuration` |
| `ProjectTabs/EstimationTab` (cost line items) | `ProjectTabs/ConfigurationTab` (15-step configurator host) |
| `Project.status='estimated'` | `Project.status='configured'` (additive enum value; old kept for backwards) |
| `Estimate` + `EstimateItem` rows | Backed by **new** `Configuration` (header) + reuse of `EstimateItem` for compiled BOM rows OR new `ConfigurationItem` (Decision below). **Decision:** introduce `Configuration` and `ConfigurationItem` as net-new tables; `Estimate`/`EstimateItem` are dropped from the project flow but tables remain (no destructive migration needed because spec allows but does not require dropping). The `ConfigurationTab` writes only to the new tables. |
| "Start New Estimation" CTA | "Start New Configuration" |
| `/estimates/*` API namespace | `/api/configurator/*` (new) — Forge `/api/estimates` endpoints stay live for legacy data viewers but UI no longer triggers them |
| Quotation generated from Estimate | Quotation generated from Configuration via new compiler |

---

## 8. Configurator Dependency Graph (port priority)

```
ConfiguratorLayout (host)
 ├── SystemDesignPanel                         [PORT P1]
 │    └── types: SystemParameters,
 │             SectionDefinition,
 │             ElectricalProtection,
 │             LayoutHardware
 ├── Step components (Enclosure … Standard BOM)  [PORT P1 — driven by category data]
 ├── MultiBreakerEngine                          [PORT P2]
 ├── useFieldIntelligence ←── lib/field-intelligence.ts   [PORT P1 — pure]
 ├── lib/event-engine.executePipeline            [PORT P1 — pure]
 ├── lib/db-service                              [REPLACE with Forge axios services]
 ├── lib/idb-cache                               [PORT optional — performance only]
 └── lib/auth-service                            [DROP — Forge AuthContext owns auth]

QuotationGenerator (split)
 ├── +Comp tab    → ProjectTabs/configurator/AddComponentSubTab.tsx
 ├── SLD tab     → ProjectTabs/configurator/SldSubTab.tsx
 ├── Preview tab → ProjectTabs/configurator/PreviewSubTab.tsx
 └── Quotation   → ProjectTabs/configurator/QuotationSubTab.tsx (uses backend pricing engine)

Database area pages (sidebar group)
 ├── Components            (Components.tsx)
 ├── AddComponent          (AddComponent.tsx → "+Comp" already inside flow; this is admin master-data)
 ├── EpicorExtract         (Comex Copper)
 ├── SavedConfiguration    
 ├── RawMaterial           (uses Forge RawMaterial model)
 ├── VendorData            (uses Forge Vendor model)
 └── ClientData            (uses Forge Client model)
```

Pure / risk-low ports (no UI dependency): `lib/event-engine.ts`, `lib/field-intelligence.ts`, types in `quotation.ts`, all `quotation_calc.py` math.

---

## 9. API Mapping — `/api/configurator/*` (new, Forge backend)

| Source (FastAPI) | Target (Express, new) | Controller / service |
|------------------|-----------------------|----------------------|
| `GET /api/components/` (+ filters) | `GET /api/configurator/components` | `configuratorComponentController.list` |
| `GET /api/components/:id` | `GET /api/configurator/components/:id` | `.get` |
| `POST /api/components/` | `POST /api/configurator/components` | `.create` (admin) |
| `PUT /api/components/:id` | `PUT /api/configurator/components/:id` | `.update` |
| `DELETE /api/components/:id` | `DELETE /api/configurator/components/:id` | `.remove` |
| `POST /api/components/bulk` | `POST /api/configurator/components/bulk` | `.bulkCreate` |
| `POST /api/components/import-csv` | `POST /api/configurator/components/import-csv` | `.importCsv` (multer) |
| `GET /api/components/category/:c` | `GET /api/configurator/components/category/:c` | `.byCategory` |
| `GET /api/components/:id/compatible` | `GET /api/configurator/components/:id/compatible` | `.compatible` |
| `GET /api/components/check-compatibility` | `GET /api/configurator/components/check-compatibility` | `.checkCompatibility` |
| `GET /api/components/stats/category-counts` | `GET /api/configurator/components/stats/category-counts` | `.categoryCounts` |
| `GET /api/categories/` | `GET /api/configurator/categories` | `configuratorCategoryController.list` |
| `POST /api/categories/upsert` | `POST /api/configurator/categories/upsert` | `.upsert` |
| `POST /api/categories/rebuild` | `POST /api/configurator/categories/rebuild` | `.rebuild` |
| `GET /api/configs/` | `GET /api/configurator/configurations` | `configurationController.list` |
| `GET /api/configs/:id` | `GET /api/configurator/configurations/:id` | `.get` |
| `POST /api/configs/` | `POST /api/configurator/configurations` | `.create` |
| `PUT /api/configs/:id` | `PUT /api/configurator/configurations/:id` | `.update` |
| `DELETE /api/configs/:id` | `DELETE /api/configurator/configurations/:id` | `.remove` |
| `GET /api/system-parameters/` | `GET /api/configurator/system-parameters` | `systemParametersController.get` |
| `PUT /api/system-parameters/` | `PUT /api/configurator/system-parameters` | `.upsert` |
| `GET /api/system-sections/:n` | `GET /api/configurator/system-sections/:n` | `systemSectionsController.get` |
| `PUT /api/system-sections/:n` | `PUT /api/configurator/system-sections/:n` | `.upsert` |
| `GET /api/quotation/` etc. | **Merged** into Forge quotation flow on `Project` (`POST /api/projects/:id/configurator-quotation`, `GET .../pdf`) | `projectQuotationController` extension |
| `GET /api/market/copper` | `GET /api/configurator/market/copper` | `marketController.copper` |
| SolidWorks routes | `GET /api/configurator/drawing/health`, `POST /api/configurator/drawing/jobs`, `GET /api/configurator/drawing/jobs/:id`, files/download mirror | `drawingAutomationController` (proxies SOLIDWORKS_API_URL) |

All routes mounted with existing auth + tenant middleware in `backend/src/index.js`.

---

## 10. Database Model Mapping — Sequelize tables to add

All new tables live under `backend/src/models/configurator/` and load via the existing `models/index.js` registry. All tables include `company_id UUID` for tenant scoping (matching Forge convention) and `created_at` / `updated_at`.

| New model | Table | Source (Python) | Notes |
|-----------|-------|-----------------|-------|
| `ConfiguratorComponentCategory` | `configurator_component_categories` | `ComponentCategory` | `(company_id, normalized_name)` unique |
| `ConfiguratorComponent` | `configurator_components` | `Component` (+ all Excel cost cols + JSON `specifications`) | `(company_id, part_number)` unique; `subtype_data` JSONB to absorb polymorphic CAMLOCK/etc. fields, avoiding STI in Sequelize |
| `ConfiguratorComponentCompatibility` | `configurator_component_compatibility` | `compatible_with` self-M2M | `(component_id, compatible_component_id)` |
| `ConfiguratorConfiguration` | `configurator_configurations` | `Configuration` | adds `project_id` FK (nullable — saved configs may exist without project), `code` (CFG-…), `is_template` boolean |
| `ConfiguratorSystemParameters` | `configurator_system_parameters` | `SystemParameters` | scoped per (`company_id`, `user_id`) |
| `ConfiguratorSystemSection` | `configurator_system_sections` | section definitions JSON | `(configuration_id, section_number)` PK |
| `ConfiguratorBomItem` | `configurator_bom_items` | derived from `bom_spec` JSON | rows for compiled BOM (used by quotation) |
| `ConfiguratorLabourLine` | `configurator_labour_lines` | from `quotation_calc.py` labour categories | per-configuration labour breakdown |
| `ConfiguratorQuotation` | `configurator_quotations` | `Quotation` w/ `bom_spec` | links to `Project` and `Configuration`; stores totals, margin, terms |
| `ConfiguratorQuotationItem` | `configurator_quotation_items` | `Quotation.items` JSON | normalized for reporting; mirror of JSON for query/index |
| `ConfiguratorComexCopperSnapshot` | `configurator_comex_copper_snapshots` | `tps-copper-snapshot-latest` | `(company_id, captured_on)` unique |
| `ConfiguratorSldDocument` | `configurator_sld_documents` | new (PDF spec) | stores SLD diagram payload + R2 ref |
| `ConfiguratorSavedView` | `configurator_saved_views` | "Saved Configurations" filters/views | optional |

Project-flow integration:
- Add column `Project.configuration_id` (nullable UUID FK → `configurator_configurations.id`) — set when user binds an existing saved configuration to a project.
- Extend `Project.status` ENUM with `configured` and `drawing_generated`.
- `documentNumberingService` config table receives a row for `CONFIGURATION` (prefix `CFG-`, length 4).

Migrations to create (Phase 1):
1. `2026XXXXXXXXXX-create-configurator-component-categories.js`
2. `…create-configurator-components.js`
3. `…create-configurator-component-compatibility.js`
4. `…create-configurator-configurations.js`
5. `…create-configurator-system-parameters-and-sections.js`
6. `…create-configurator-bom-and-labour.js`
7. `…create-configurator-quotations-and-items.js`
8. `…create-configurator-comex-copper-snapshots.js`
9. `…create-configurator-sld-documents.js`
10. `…alter-projects-add-configuration-id-and-status.js`

All migrations idempotent + reversible (down() drops the introduced columns/tables).

---

## 11. Quotation Flow Mapping

### Configurator (today)
1. `QuotationGenerator.tsx` reads `cfgId` query param, hydrates BOM from `Configuration.config_data`, fetches missing component costs.
2. User edits pricing, BOM, system, client, terms, timeline, elevations across tabs (Pricing | Quotation Details).
3. Save → `POST/PUT /api/quotation` (FastAPI) — also writes localStorage parity caches (`tps-quotation-snapshots/-pricing/-rates`).
4. PDF generated **client-side** via jsPDF + autotable, then uploaded back via `POST /api/quotation/:id/pdf` for archival.
5. Compare mode (`cfgId` + `cfgId2`) → combined PDF.

### Forge target
1. **Project-level Quotation tab** stays the customer-facing PDF generator. It now:
   - Pulls compiled BOM/pricing from the project's `Configuration` via new `GET /api/projects/:id/configurator-quotation/preview`.
   - Lets user override pricing, terms, margins (same shape as configurator).
   - Persists to `configurator_quotations` + items (and updates `projects.quotation_number`).
   - PDF generated server-side via `pdfkit` (`pdfGenerator.generateConfiguratorQuotation`) and uploaded to R2; URL stored in `Document` table.
2. **Configuration → Quotation sub-tab** is a *preview/draft* surface: shows compiled BOM + pricing inline so users can sanity-check before advancing the project.
3. **Compare mode** deferred (parity check item; not in PDF spec scope).

### Pricing engine
Port of `quotation_calc.py` to `backend/src/services/configurator/pricingEngine.js`:
- Inputs: `Configuration` (sections, layout, electrical), copper price snapshot, labour rates, margin/markup config.
- Outputs: `{ bom: BomLine[], labour: LabourLine[], totals: { material, labour, overhead, margin, grand }, breakdowns: {...} }`.
- Pure JS module — unit-testable.

---

## 12. BOM / Pricing / Labour Engine Mapping (Python → Node)

| Python (config/backend) | Node target | Responsibility |
|--------------------------|-------------|----------------|
| `app/services/quotation_calc.py` | `backend/src/services/configurator/pricingEngine.js` | totals, margins, taxes |
| Inline BOM compilation in `app/routers/quotation.py` | `backend/src/services/configurator/bomEngine.js` | from `Configuration.config_data` → normalized BOM lines |
| Labour breakdown derived from `Component.lbr_*` columns | `backend/src/services/configurator/labourEngine.js` | per-category labour aggregation |
| `app/services/component_import.py` | `backend/src/services/configurator/componentImportService.js` | CSV upsert + part-number generator |
| `app/services/category_utils.py` | `backend/src/services/configurator/categoryUtils.js` | `normalizeCategoryName` helper |
| `app/routers/quotation.py` PDF (reportlab + Jinja2) | `backend/src/utils/pdfGenerator.js` extension `generateConfiguratorQuotation` | server-side PDF |
| Comex copper fetch (`app/routers/market.py`) | `backend/src/services/configurator/comexCopperService.js` | scheduled fetch + snapshot persist |
| Field intelligence directives (frontend) | `frontend/src/lib/configurator/fieldIntelligence.ts` (port of TS as-is) | client-side only |
| `executePipeline` engine (frontend) | `frontend/src/lib/configurator/eventEngine.ts` | client-side only |

---

## 13. Component-Card Data Source Mapping

The PDF mandates: cards must come from real component data. Trace:

1. **UI**: `ConfiguratorLayout.tsx` builds dynamic step model from category metadata (`ConfiguratorLayout.tsx` ~ line 1106) and pulls cards by step category.
2. **Fetch**: cards rendered via `dbService.getComponentsByCategory(category)` → `GET /api/components/category/:category`.
3. **Backend**: `app/routers/components.py` queries `Component` table filtered by `category` (and `is_active`).
4. **Source of truth**: `components` table (seeded via `app/scripts/import_components_*.py` from CSV/Excel — `TPS_Estimate_23XX.xlsm`).
5. **Forge port**: identical contract — `GET /api/configurator/components/category/:c` → `configurator_components` table (seeded by Phase 1 import script that re-runs the CSV import inside Node).

No static/mock data is acceptable. Phase 1 will include the seed import script (`backend/scripts/seed_configurator_components.js`) that ingests the same CSV the Python service uses (or its export).

---

## 14. Workflow State Mapping

| Concept | Source | Forge target |
|---------|--------|--------------|
| Configurator step index | local `useState` in `ConfiguratorLayout` | local `useState` in `ConfigurationTab` (mirrors current pattern); persisted in `Configuration.config_data.activeStep` |
| Project status | n/a (configurator has its own `Configuration` rows) | `Project.status` ENUM augmented |
| Save / Next / Back | configurator save dialog | `ProjectFlowFooter` (new) at top-right per PDF screenshots; bound to `useProjectStepper(projectId)` hook |
| Saved configurations | `Configuration` table + `tps-config-favorites` LS | `configurator_configurations` table; favourites moved to `configurator_saved_views` |
| Drafts | localStorage drafts | server-side (`Configuration.is_draft = true`) + autosave debounce |

---

## 15. Python → Node Service Mapping (consolidated)

```
config/backend/app
├── main.py + config.py + database.py            → backend/src/index.js + src/config/database.js (existing)
├── auth/ (jose, OAuth2)                         → backend/src/middleware/auth.js (existing) + new SSO providers DEFERRED (out of PDF scope)
├── models/base_models.py                        → backend/src/models/configurator/{ConfiguratorConfiguration.js, ConfiguratorSystemParameters.js, ConfiguratorComponentCategory.js}
├── models/switchgear_components.py              → backend/src/models/configurator/{ConfiguratorComponent.js, ConfiguratorComponentCompatibility.js}
├── routers/components.py                        → backend/src/routes/configurator/componentRoutes.js + controllers/configurator/componentController.js
├── routers/categories.py                        → backend/src/routes/configurator/categoryRoutes.js + controllers/configurator/categoryController.js
├── routers/configs.py                           → backend/src/routes/configurator/configurationRoutes.js + controllers/configurator/configurationController.js
├── routers/orders.py                            → MERGED into existing Forge SalesOrder/Project flow; no new endpoints
├── routers/quotation.py                         → MERGED into Forge project quotation extensions: routes/configurator/projectQuotationRoutes.js + controllers/configurator/projectQuotationController.js
├── routers/market.py                            → routes/configurator/marketRoutes.js + services/configurator/comexCopperService.js
├── routers/cassandra.py                         → DEFERRED (gated; not in PDF scope)
├── routers/solidworks.py                        → routes/configurator/drawingRoutes.js + services/configurator/solidworksProxy.js
├── services/quotation_calc.py                   → services/configurator/pricingEngine.js
├── services/component_import.py                 → services/configurator/componentImportService.js
├── services/category_utils.py                   → services/configurator/categoryUtils.js
└── templates/quotation_template.html            → utils/pdfGenerator.js extension (no Jinja runtime; layout in JS)
```

---

## 16. Forge Integration Points

| Touchpoint | File | Change |
|-----------|------|--------|
| Sidebar nav | `frontend/src/components/Layout/Sidebar.tsx` | Replace items per PDF: My Account, Settings, Database (group), Operations (group), Dashboard, Projects, Procurement, Inventory, Business Analytics, File Manager. Save button moves to top bar. |
| Project stepper | `frontend/src/pages/ProjectDetailPage.tsx#L130` | New 12-step array, label rename, `Drawing Generation` insert |
| Project tab host | `frontend/src/pages/ProjectDetailPage.tsx` | Map index 1 → `ConfigurationTab`, index 2 → `DrawingGenerationTab` |
| Stepper footer | `frontend/src/components/ProjectTabs/_shared/ProjectFlowFooter.tsx` (NEW) | Save / Next / Back trio at top-right per PDF |
| Theme | `frontend/src/theme.ts`, `frontend/src/index.css`, `frontend/src/contexts/ThemeContext.tsx` | Add dark+lightning-blue palette; CSS variables aligned to configurator names |
| Settings tabs | `frontend/src/pages/SettingsPage.tsx` | `Default Settings | T&C / Notes | Security & Notification` |
| Database area | `frontend/src/pages/DatabasePage.tsx` (NEW) | Tabs: Comex Copper | Components | Raw Material | Saved Configuration | Vendor Data | Client Data |
| Backend route mount | `backend/src/index.js` | `app.use('/api/configurator', configuratorRoutes)` aggregator |
| Models registry | `backend/src/models/index.js` | Auto-load files in `configurator/` subdir; add associations to `Project` |
| Document numbering | `backend/src/services/documentNumberingService.js` | Add `CONFIGURATION` type registration |
| PDF | `backend/src/utils/pdfGenerator.js` | New `generateConfiguratorQuotation(project, configuration, pricing)` |
| Project status enum | `backend/src/models/Project.js` + migration | Add `'configured'`, `'drawing_generated'` |

---

## 17. Migration Risk Analysis

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| RISK-1 | `ConfiguratorLayout.tsx` (~2400 LOC) is monolithic — direct port could explode merge surface | High | High | Port in chunks: types → engine → step shells → category-driven rendering. Keep LOC in same file initially; refactor later. |
| RISK-2 | Configurator uses **shadcn/Tailwind** primitives; Forge uses **MUI** | Certain | Medium | Build a small adapter layer: replace shadcn `Card/Button/Tabs/Dialog` imports with MUI equivalents during port. Keep visual parity via theme tokens. |
| RISK-3 | Configurator React Query provider exists but unused — many flows use `localStorage`. Forge has no React Query | Medium | Low | Drop React Query usage; rely on Forge's existing axios + Context patterns for data. Server-side persistence replaces local drafts. |
| RISK-4 | Polymorphic `Component` (SQLAlchemy STI) won't map cleanly to Sequelize | Medium | Medium | Single `configurator_components` table with `subtype_data JSONB`. CAMLOCK fields go into JSONB. Frontend uses helper getters. |
| RISK-5 | Three.js GLTF viewer + SolidWorks ngrok dependencies | Medium | Low | Hide behind a feature flag; SolidWorks proxy returns stub when env not set. Drawing Generation tab works without SW server. |
| RISK-6 | Forge multi-tenant (`company_id`) — configurator has no concept | Certain | High | Every new model includes `company_id`; routes wrapped in `tenantScope` middleware. Seed scripts target a single company by env. |
| RISK-7 | Theme swap could break MUI components across the app (DataGrid, DatePickers, etc.) | Medium | High | Phase 6 ships dark theme behind `ThemeContext` toggle first; default to dark on Configuration pages and app-wide once visually verified. Keep light palette tokens for fallback. |
| RISK-8 | PDF parity (reportlab → pdfkit) — exact pixel parity is infeasible | Certain | Low | Match content + sections; do not aim for byte-identical PDFs. Spec only requires "Download Quotation" works. |
| RISK-9 | Existing Forge `Estimate` tables consumed by Invoice/WorkOrder/Analytics tabs | High | High | **Do not drop** — extend with read-only adapter that returns Configuration data shaped as legacy estimate for those tabs. Verify each downstream tab in Phase 4 acceptance. |
| RISK-10 | Document numbering generator is sequence-locked per company; adding new type must be atomic | Low | Medium | Use existing `documentNumberingService` API in a transaction. |
| RISK-11 | Comex copper external endpoint credentials/availability | Low | Low | Wrap in `try/catch`, surface "stale snapshot" UI when offline. |
| RISK-12 | "Cassandra" GROQ assistant uses `VITE_GROQ_API_KEY` exposed to client | High (security) | Low | Excluded from migration scope per PDF. If later required, proxy through Forge backend. |
| RISK-13 | Component compatibility check has O(n) round-trips today | Low | Low | Port as-is; index `(component_id, compatible_component_id)`. |
| RISK-14 | `Project.status` enum migration in Postgres requires special care | Medium | Medium | Use `ALTER TYPE … ADD VALUE` (idempotent guard) in migration; never drop existing values in this branch. |

---

## 18. Phased Execution Plan (binding)

| Phase | Scope | Build / acceptance gate |
|------|-------|------------------------|
| **0 (this doc)** | Mapping + branch + spec extraction | `git status` clean except this doc; doc reviewed |
| **1** | DB models + migrations + base routes (no UI). Seed script imports configurator components from CSV. | `cd backend && npm install && npm run migrate && npm test` green; `node backend/scripts/seed_configurator_components.js` succeeds |
| **2** | Backend services: pricing/BOM/labour/quotation engines + PDF + REST endpoints + auth wiring | Engine unit tests; `curl` smoke against new endpoints |
| **3** | Frontend rename + 12-step stepper + Configuration host shell + sidebar/theme scaffolding | `cd frontend && npm install && npm run build` green; navigation through 12 steps without runtime error |
| **4** | Configuration sub-flow UI (15 inner steps) wired to live data; Saved/Load Configuration; +Comp/SLD/Preview/Quotation sub-tabs | Manual flow walk-through; persisted draft round-trip |
| **5** | Project-level Quotation merge (PDF gen) + Drawing Generation tab + Database area pages | Generate quotation PDF from a real configuration; view in File Manager |
| **6** | Theme migration: dark + lightning-blue applied globally with safe fallback | App-wide visual sweep; existing Forge pages render correctly |
| **7** | Build + typecheck + e2e smoke + parity validation report | `npm run build` (backend + frontend); written validation report appended to this doc |

Each phase ends with: green build, manual acceptance, commit on `feature/configuration-migration`. Only after acceptance does the next phase begin.

---

## 19. Open Decisions Resolved (no further questions needed)

1. **Existing Estimate tables** — kept (additive migration only); Configuration uses new tables.
2. **`Project.status` enum** — extended additively (`configured`, `drawing_generated`).
3. **Polymorphic Component** — flattened with `subtype_data JSONB`.
4. **Auth** — Forge `User` is canonical; configurator's `User` model not migrated. SSO providers deferred.
5. **PDF library** — pdfkit (server-side) is canonical; client-side jsPDF dropped.
6. **React Query** — not introduced; Forge axios + Context is canonical.
7. **Cassandra AI / 3D viewer** — deferred; feature-flagged.

---

## 20. Phase 1 Readiness Checklist

- [x] Branch `feature/configuration-migration` created off `PH4`.
- [x] PDF spec extracted to [docs/_pdf_extract.txt](_pdf_extract.txt).
- [x] Source frontend mapped (`config/`).
- [x] Source backend mapped (`config/backend/`).
- [x] Forge frontend mapped (`frontend/`).
- [x] Forge backend mapped (`backend/`).
- [x] DB model mapping defined (10 new tables + Project alterations).
- [x] API mapping defined (`/api/configurator/*`).
- [x] Pricing/BOM/labour engine mapping defined.
- [x] Risks enumerated (14).
- [x] Phased plan with green-build gates.
- [ ] User sign-off on this document (next step).

Once approved, Phase 1 begins with the migration files listed in §10.
