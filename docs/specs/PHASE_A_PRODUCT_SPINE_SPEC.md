# PHASE A — Product Spine & Data Model Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Phase:** A of F (Product Spine & Data Model)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** none (this is the foundation phase)
**Blocks:** Phases B (US Standards Rule-Pack), C (Flow & Auto-Population), D (BOM/Costing), E (SolidWorks)

---

## 0. Critical Implementation Rules (STRICT)

1. This spec defines ONLY the changes explicitly listed. Additive implementation only.
2. PRESERVE all existing functionality. The pricing engine (`pricingEngine.js`), labour engine, BOM engine, and quotation compiler are NOT modified in this phase — they receive a new input shape via an adapter, and **quote totals for existing configurations must be numerically identical pre/post migration**.
3. The 12-module logic engine (`frontend/src/configurator/lib/*`) is NOT modified in this phase (Phase B will).
4. No assumptions. If a conflict arises with existing behavior, prefer existing behavior and flag it.
5. All new code paths behind feature flag `CONFIGURATOR_V2_SPINE` until parity is verified.

---

## 1. Purpose

Fix the structural collapse caused by merging two paradigms: the **section-scoped System Design engine** and the **global per-step component shopping flow** (`stepLines`). After Phase A, every component line in a configuration is traceable to either the board or a specific section — which is the prerequisite for per-section BOM, SolidWorks per-section assembly automation, accurate copper estimation, and complete quotations.

## 2. Locked Decisions

| # | Decision | Resolution |
|---|---|---|
| A1-1 | Multiple switchgear per project | Yes. Card-grid UI: each card = one Switchboard. "New Configuration" (blank) / "Load Configuration" (clone saved SG). Permanent "+" card to add boards. Card state persists across sessions. |
| A1-2 | Component scoping | Single `componentLines[]` schema with `scope: board \| section(n)`. Default scope per category, user-overridable per line. Global `stepLines` retired (migrated). |
| A1-3 | Enclosure scope default | Section-scoped (each vertical section = a structure). Override to board for wallmount/single-section jobs. |
| A1-4 | Section count | Dynamic 1..N. Soft limit from Settings key `MAX_SECTIONS` (default 10). No hardcoded section tabs, no `section1` special case. |
| A1-5 | Labour | Derived from per-component labour-hour buckets (existing engine) + manual labour adjustment lines with reason. Quotation HARD-BLOCKED if total labour = 0. Labour tab becomes a review/adjust panel, not a picker. |
| A2-1 | CB catalog source | Migrate from frontend TS files to DB. ~80 client-priced CBs imported as FIRM. Builder-generated SKUs enter as PENDING_RFQ. |
| A2-2 | Price states | `FIRM \| ESTIMATED \| PENDING_RFQ` on every component + on every component line (snapshot). RFQ loop: generated catalog numbers → Awaiting-Price queue → export RFQ → enter price → FIRM. |
| A2-3 | Quotation price gate | Quote computable with ESTIMATED lines (flagged). Customer-facing issue requires all lines FIRM or estimator override with logged reason. |
| A2-4 | Accessories | Builder-generated breakers: accessories are catalog-number positions (one SKU, one price). Imported/legacy breakers: accessories = priced child SKUs linked via compatibility table. Multi-select. |
| A2-5 | Builders roadmap | Schneider (exists, validate) → ABB → Eaton → Siemens. Same position-engine pattern, data-pack per manufacturer. |
| A2-6 | Standards regime | `standardsRegime: UL \| IEC` on rule tables and catalog rows. US/UL active now; IEC rows retained, hidden when board regime = UL. |
| A3-1 | Compatibility | Three sources: (1) builder position constraints for generated CBs; (2) `ConfiguratorComponentCompatibility` frame-match for imported CBs + accessories; (3) attribute rules for everything else (e.g., enclosure depth ≥ breaker depth + clearance). Severity `BLOCK \| WARN`. |
| A-S | Safety | Safety items are first-class: ground bus, arc-flash labels (NEC 110.16), SCCR label, key interlocks, shutters, IR windows, barriers, door interlock switches. Category `SAFETY` added; mandatory-category rules in Completeness Engine. Rule logic in Phase B6. |

## 3. Current State Being Replaced

- `ConfiguratorState` special-cases `section1*` fields and holds sparse records for sections 2..6 — replaced by a uniform `sections[]` collection.
- `stepLines: Record<stepKey, SelectedComponentLine[]>` — global buckets with no section traceability — replaced by `componentLines[]` with scope.
- CB catalog hardcoded in `frontend/src/configurator/data/circuitBreakerV2Data.ts` (+ABB file) — replaced by DB catalog (existing `configurator_components` table) with typed specs.
- Free-text dimensions (e.g., "Fixed 3P -301 x 276 x 209mm") — replaced by numeric `dims` fields (inches) parsed on import.
- Labour as a catalogue picking step — replaced by derived Labour Review panel.

## 4. Domain Model

```
Project
└── Configuration (CFG-xxxx, revision-controlled)         [exists]
    └── Switchboard [1..n]                                  [NEW]
        ├── boardParameters   (system params; US tables in Phase B)
        ├── Section [1..N]    (dynamic, MAX_SECTIONS soft limit)
        │   ├── setup         (name, type, function)
        │   ├── electrical    (load definition, protection)
        │   ├── layout        (position/mounting; rules Phase B)
        │   ├── deviceLines   (breakers incl. builder SKUs + accessories)
        │   └── computed      (effectiveCurrent, validation, layout fit)
        ├── componentLines[]  (scope = board | sectionId)
        └── outputs           (SLD, BOM rollup, copper est, costing, quotation)
```

### 4.1 New/changed entities

**`configurator_switchboards`** (NEW)
- `id` UUID PK
- `configuration_id` FK → configurator_configurations, CASCADE
- `board_index` int (card order)
- `name` string (user label, default "Switchboard N")
- `standards_regime` enum `UL|IEC`, default `UL`
- `board_type` string (PCC/MCC/Switchboard/Panelboard… vocabulary finalized Phase B)
- `status` enum `draft|complete|locked`
- `board_data` JSONB (boardParameters envelope)
- `cloned_from_switchboard_id` UUID nullable (Load-Configuration provenance)
- timestamps

**`configurator_sections`** (REWORK of ConfiguratorSystemSection)
- `id` UUID PK, `switchboard_id` FK CASCADE
- `section_index` int (1..N, unique per board)
- `setup` JSONB (name/type/function)
- `electrical` JSONB
- `layout` JSONB
- `computed` JSONB (engine outputs — denormalized cache)
- timestamps

**`configurator_component_lines`** (NEW — replaces stepLines + per-section breaker arrays)
- `id` UUID PK
- `switchboard_id` FK CASCADE
- `scope` enum `board|section`
- `section_id` FK nullable (required when scope=section)
- `component_id` FK → configurator_components, nullable (null = ad-hoc/manual line)
- `category` string (denormalized)
- `part_number`, `description` snapshots
- `quantity` decimal, `unit` string
- `unit_cost` decimal snapshot; `price_status` enum `FIRM|ESTIMATED|PENDING_RFQ` snapshot
- `labor_hours` JSONB snapshot `{cu,asm,cnt,qc,tst,eng,cad}`
- `source` enum `user|auto|builder|standard`
- `builder_payload` JSONB nullable (decoder positions for generated catalog numbers)
- `meta` JSONB
- timestamps

**`configurator_components`** (EXTEND — no breaking changes)
- ADD `price_status` enum default `FIRM`
- ADD `standards_regime` enum `UL|IEC` nullable (null = regime-agnostic, e.g. hardware)
- ADD `dims_h_in`, `dims_w_in`, `dims_d_in` decimal nullable
- ADD `weight_lbs` decimal nullable
- ADD `pct_rated` enum `80|100` nullable (CB only)
- ADD `ul_listing` string nullable (UL489/UL1066/UL891…)
- ADD `spec_schema_version` string
- Per-category JSON Schemas validated on import/save (CB schema mandatory fields: ratedCurrentA int, interruptingKA int, poles, mounting `Fixed|Drawout`, operationType, tripUnitType; dims+weight required for layout engine participation)

**`configurator_price_rfqs`** (NEW)
- `id`, `component_id` FK, `catalog_number`, `manufacturer`, `status` enum `open|sent|received|cancelled`, `requested_by`, `requested_at`, `sent_at`, `received_price` decimal nullable, `received_at`, `notes`
- On `received`: component price updated, `price_status→FIRM`, effective date stamped; all component lines referencing the SKU at ESTIMATED are flagged `requote_review=true` in meta.

**`configurator_completeness_rules`** (NEW)
- `id`, `board_type` string|`*`, `category` string, `requirement` enum `REQUIRED|CONDITIONAL|OPTIONAL`, `condition_expr` string nullable (evaluated against board+sections state), `severity` enum `BLOCK|WARN`, `message`
- Seeded defaults (board_type `*`): ENCLOSURE per section REQUIRED; ≥1 incomer device REQUIRED; BUSSING board REQUIRED; LUGS REQUIRED; SAFETY ground-bus REQUIRED; LABOR total > 0 REQUIRED (BLOCK); labels/nameplates REQUIRED (WARN until Phase B finalizes).

**Settings**: ADD `MAX_SECTIONS` (int, default 10).

### 4.2 Default scope per category

| Category | Default scope |
|---|---|
| CIRCUIT BREAKER, ENCLOSURE, CURRENT/VOLTAGE TRANSFORMER, CONTROLS, LIGHT, SWITCH, POWER SUPPLY, GLASTIC, TERMINALS, LUGS, WIRE CABLE, SAFETY | section |
| BUSSING (main bus; vertical risers auto-per-section in Phase D), SPD, ATS, CAMLOCK, CONDUIT, STANDARD PRODUCT, freight/adders | board |
| LABOR | derived — not a picker |

## 5. Frontend State Changes

New `ConfiguratorStateV2`:

```ts
interface ConfiguratorStateV2 {
  envelopeVersion: 2;
  switchboards: SwitchboardState[];   // card order
  activeSwitchboardIndex: number;
}
interface SwitchboardState {
  id: string;
  name: string;
  standardsRegime: 'UL' | 'IEC';
  boardParameters: SystemParameters;          // unchanged shape (Phase B revises content)
  sections: SectionState[];                    // dynamic length, uniform
  componentLines: ComponentLine[];             // scope-tagged
  laborAdjustments: LaborAdjustmentLine[];     // manual labour lines w/ reason
  stepNotes: Partial<Record<StepKey, string>>;
}
interface SectionState {
  sectionIndex: number;
  definition: SectionDefinition;               // unchanged shape
  electrical: ElectricalProtection;
  layoutHardware: LayoutHardware;
  deviceLines: ComponentLine[];                // breakers (scope implicit = this section)
  computed?: SectionComputedState;
}
interface ComponentLine {
  lineId: string;
  scope: 'board' | 'section';
  sectionIndex?: number;
  componentId?: string;
  category: string;
  partNumber?: string; name?: string;
  quantity: number;
  unitPrice?: number;
  priceStatus: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
  source: 'user' | 'auto' | 'builder' | 'standard';
  builderPayload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}
```

- `configSerialize/configHydrate` gain `envelopeVersion`. Hydrating a v1 blob runs `migrateV1toV2()` (see §9) transparently; v1 is never written back.
- `section1*` actions/fields removed; reducer operates on `sections[index]` uniformly.
- All engines receive section arrays — no behavioral change expected (verify with parity tests).

## 6. UX Changes

1. **Configuration cards screen** (per Configuration): grid of Switchboard cards + permanent "+" card. Card menu: Open, Rename, Duplicate, Delete (soft). "+" → modal: *New Configuration* (blank board) | *Load Configuration* (picker listing saved switchboards in the company — current project first, then library — clones full state, stamps `cloned_from`).
2. **Section tabs**: rendered from `sections[]`, "Add Section" appends until `MAX_SECTIONS`; remove section with confirmation (component lines on that section are flagged orphaned, not silently deleted — user must reassign or delete).
3. **Catalog step pickers** (Enclosure, Controls, …): "Add to Config" gains a scope selector chip — `Board | Section 1..N` — pre-set to category default; section-scoped steps default to the last active section.
4. **Labour tab → Labour Review panel**: derived hours by bucket (CU/ASM/CNT/QC/TST/ENG/CAD) per section + board, source breakdown, plus "Add manual labour line" (bucket, hours, reason required). Zero-labour state renders blocking banner.
5. **Awaiting Price queue** (per company): list of PENDING_RFQ SKUs with generated catalog numbers, export to XLSX (RFQ list), inline price entry on receipt.
6. **Completeness panel** on Preview/Quotation step: checklist of completeness rules with pass/fail/waive (waiver requires reason, logged to audit).

## 7. Catalog Migration (CB data)

1. One-time importer: parse `circuitBreakerV2Data.ts` + `circuitBreakerV2AbbData.ts` → `configurator_components` rows, `component_type=CIRCUIT_BREAKER`, `standards_regime=IEC` (they are IEC models), `price_status=PENDING_RFQ` where price "N/A".
2. Dimension parser: regex free-text dims → numeric mm → convert to inches (2dp). Unparseable rows: `dims_* = null`, import report lists them.
3. Client's 80 priced CBs: XLSX import template (generated in this phase) → FIRM rows, `standards_regime=UL` where confirmed UL-listed.
4. Frontend `data/*.ts` files retired behind the feature flag; CB selection reads `/api/configurator/components?category=CIRCUIT%20BREAKER&regime=UL`.
5. Builder-generated SKUs: on "Add to Config" from the Part Number Builder, upsert component row (catalog number = part_number, `source=builder`, `price_status=PENDING_RFQ` unless price known) + create RFQ row + add component line with `builder_payload`.

## 8. Estimated Price Model (interim pricing)

- `priceEstimate(component)` = interpolation over FIRM CBs of same manufacturer+frame family by ratedCurrentA (linear between nearest known ratings; extrapolation capped at ±25% with flag). If no family data: manual estimate entry only.
- Estimated values stored on the line (`priceStatus=ESTIMATED`, `meta.estimateBasis`).
- Quotation UI shows per-line badge; quote header shows count of non-FIRM lines.

## 9. Migration & Backward Compatibility

1. Sequelize migrations: create new tables; extend components; seed completeness rules + `MAX_SECTIONS`.
2. Data migration script per existing configuration: create Switchboard #1 from `config_data`; `systemParameters→board_data`; `section1*`+`sections.*` → uniform section rows; `selectedBreakers` → section deviceLines; `stepLines[step]` → componentLines with category-default scope (all board, since v1 had no section info — flagged `meta.migratedScope=true` for estimator review); stepNotes carried.
3. **Parity gate (release blocker):** for every migrated configuration, run quotation compiler on v1 path and v2 adapter path — totals must match to the cent. Automated test over all existing client configurations.
4. Feature flag `CONFIGURATOR_V2_SPINE`; v1 UI remains until parity sign-off; single release window for the client cutover.

## 10. Acceptance Criteria (Definition of Done)

1. Create 2+ switchboards via cards; full state persists across logout/login; card 1 reopens SG 1, card 2 reopens SG 2.
2. Load Configuration clones a saved board with all sections, device lines, component lines, labour adjustments.
3. Sections addable/removable 1..MAX_SECTIONS; no `section1` special-casing remains in state code.
4. Component line added from any catalog step lands with correct scope; section BOM rollup and board BOM rollup both correct.
5. Builder-generated CB → component row + RFQ row + PENDING_RFQ line; price receipt flips to FIRM and flags dependent configs.
6. Quotation: blocked at 0 labour; blocked on failed REQUIRED completeness rules (waivable with reason); ESTIMATED lines flagged; customer-issue gate enforces FIRM-or-override.
7. Migration parity test green across all existing configurations (totals identical).
8. All existing IEC CB data present in DB, hidden when regime=UL; client's 80 priced CBs imported FIRM.

## 11. Out of Scope (later phases)

- US parameter tables, NEC load calc, bus sizing, layout rules in inches, safety rule logic → **Phase B**
- Wizard flow, auto-population rule expansion, SLD/line-up view → **Phase C**
- Section-scoped BOM compilation changes, copper estimator, pricing additions, quotation revisioning → **Phase D**
- SolidWorks job queue + payload contract → **Phase E**
- ERP handoff integration points → **Phase F**
