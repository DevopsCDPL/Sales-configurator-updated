# PHASE D — BOM, Copper Estimator, Pricing & Quotation Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Client:** Tier Power Systems, LLC (TPS)
**Phase:** D of F (BOM, Copper, Pricing, Quotation)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** Phase A (component lines, price states, completeness), Phase B (bus schedule, support spacing, frames), Phase C (review stage, gates)
**Blocks:** Phase E (true-up consumes reconciliation; submittal consumes drawings), Phase F (accepted quote → order confirmation)

---

## 0. Critical Implementation Rules (STRICT)

1. `pricingEngine.js` math is NOT modified — CALC_VERSION 1.1.0 results must remain reproducible. New cost components (copper line, freight, adders) enter through the EXISTING adder/line mechanisms the engine already supports.
2. `bomEngine.js` is replaced by `bomEngineV2.js` behind flag `CONFIGURATOR_V2_BOM`; v1 retained for parity testing. Both must produce identical totals for migrated v1 configurations (adapter path).
3. All [SEED] values live in Company Settings → Costing (editable), never hardcoded.
4. Copper estimator is a pure module; COMEX access stays in `marketDataService.js` (existing).
5. Issued quotation revisions are immutable — no code path may mutate an issued revision.

## 1. Locked Decisions

| # | Decision | Resolution |
|---|---|---|
| D1-1 | BOM views | Single row stream, two aggregations: eBOM (by switchboard/section — engineering & SolidWorks) and mBOM (by part number with where-used — purchasing). |
| D1-2 | Auto-quantities | Generator functions for bussing, glastic, joint hardware, labels, filler plates, lugs. Traceable: each row carries generatorId + inputs hash. |
| D1-3 | BOM versioning | BOM snapshot frozen per quotation revision. |
| D2-1 | Copper model | Two-pass: parametric estimate at quote (§4), SolidWorks exact true-up at engineering release (§5). |
| D2-2 | Copper commercial terms | Escalation clause: quote validity days [SEED 15], COMEX snapshot date printed, auto-text clause. Company setting, can be disabled. |
| D3-1 | Pricing strategy | Existing GM% / desired-price kept unchanged. Category margin tiers deferred (not requested by client, engine is client-validated). |
| D3-2 | Freight | Flat per-board line adder [company setting]; manual override per quote. |
| D4-1 | Revisions | Quotation revision chain, immutable when issued, line-level diff, reason required per revision. |
| D4-2 | Submittal | Final Document Merge = quote PDF (with SLD page) + BOM summary (optional) + component datasheets + drawings (Phase E). |

## 2. BOM Engine v2 (`bomEngineV2.js`)

### 2.1 Row model

Extends Phase A `configurator_bom_items` with: `switchboard_id`, `section_id` (nullable), `scope`, `source` (`user|auto|builder|standard|generator`), `generator_id` (nullable), `generator_inputs_hash` (nullable), `price_status`, `copper_weight_lbs` (nullable).

### 2.2 Compilation walk

```
for each switchboard:
  boardParams → board-level generator rows (§2.3)
  for each section:
    deviceLines → device rows (+ builder accessories exploded for reporting)
    section componentLines → rows
    section generators (labels, filler plates, lugs, riser bus)
  board componentLines → rows
  labour: per-component hour buckets (existing) + laborAdjustments → labour rows
output: rows[] → eBOM view (group: switchboard → section → category)
              → mBOM view (group: part_number; where-used list; qty rollup)
```

### 2.3 Auto-quantity generators (pure functions, Engineering Standards inputs)

| Generator | Inputs | Output rows |
|---|---|---|
| GEN-BUS-MAIN | bus schedule row, Σ section widths | phase bars (qty = bars × 3), neutral bars (× neutral%), ground bus bar |
| GEN-BUS-RISER | per-section largest device rating → schedule row, bus-zone height | riser bars per section |
| GEN-GLASTIC | SCCR → support spacing row, run lengths | supports qty = ceil(run/spacing)+1 per run |
| GEN-HW-JOINT | bar joints count (runs, splices per section boundary) | joint kits (bolts/Belleville washers) [SEED kit per joint] |
| GEN-LABEL | sections, R2/R3 rules | arc-flash label × section, nameplate × board |
| GEN-FILLER | layout remaining space per section | filler plates qty (R4) |
| GEN-LUG | terminations (devices × poles, cable entry plan) | lugs qty [v1: devices × poles × 1 [SEED]; refined with cable sizing later] |

Generator rows: `source='generator'`, re-computed on every BOM compile; manual qty override allowed → row flips to `user` with `meta.overriddenFrom`.

### 2.4 Views & exports

- eBOM: UI tree + XLSX export (per switchboard).
- mBOM: UI table + XLSX export; feeds procurement module (Phase F) — column set matches existing procurement import.

## 3. Company Settings → Costing (NEW settings group)

| Key | Default [SEED] | Use |
|---|---|---|
| COPPER_FAB_FACTOR | 1.15 | scrap/offcut multiplier |
| COPPER_CONTINGENCY_PCT | 10 | estimator contingency |
| COPPER_TRUEUP_THRESHOLD_PCT | 5 | reconciliation flag threshold |
| COPPER_STUB_LEN_IN | 24 | per-device per-phase stub length |
| QUOTE_VALIDITY_DAYS | 15 | copper clause validity |
| COPPER_CLAUSE_ENABLED | true | print escalation clause |
| FREIGHT_PER_BOARD_USD | 0 (off) | flat freight adder |
| ADDER_TEMPLATES | startup, commissioning, warranty-ext | optional quote adders |

## 4. Copper Estimator (`copper-estimator.ts`, pure)

### 4.1 Geometry model (all inches, lbs; ρ_Cu = 0.323 lb/in³)

```
barArea        = thickness × width                      (from bus schedule row)
mainRun_in     = Σ section widths
mainBus_lbs    = barsPerPhase × barArea × mainRun × 3 × 0.323
neutral_lbs    = barsPerPhase × barArea × mainRun × 0.323 × (neutral% / 100)
ground_lbs     = groundBarArea × mainRun × 0.323
riser_lbs(sec) = riserBars × riserBarArea × busZoneHeight(frame) × 3 × 0.323
stub_lbs(dev)  = stubBarArea(deviceRating→schedule) × COPPER_STUB_LEN_IN × poles × 0.323
raw_lbs        = mainBus + neutral + ground + Σ risers + Σ stubs
est_lbs        = raw_lbs × COPPER_FAB_FACTOR
copper_cost    = est_lbs × COMEX_spot(snapshot) × (1 + COPPER_CONTINGENCY_PCT/100)
```

### 4.2 Integration

- Runs at Review stage + on any topology/bus change (Event Engine step after layout).
- Emits BOM rows (category `BUSSING`, `source='generator'`, `copper_weight_lbs` set) replacing manual bussing picking for bar stock; lugs/supports remain their own generators. Manual bussing additions still possible (special shapes).
- Quote line: "Copper bus structure (estimated)" — weight, $/lb, snapshot date, `price_status=ESTIMATED`.
- COMEX snapshot pinned to the quotation revision (re-quote may refresh; refresh logged).
- Existing `copper_weight_per_unit` field on sections feeds from estimator outputs (keeps pricingEngine input contract intact).

### 4.3 Aluminum

`busMaterial=Al`: ρ = 0.098 lb/in³, Al market price source [SEED: manual price setting until a feed is added], density rule 750 A/in².

## 5. True-up & Reconciliation (consumes Phase E)

1. SolidWorks job returns `exact_copper_lbs` (+ per-section breakdown when available).
2. Reconciliation record: `configurator_copper_reconciliations` — config id, quote revision, est_lbs, exact_lbs, delta_pct, copper $ delta, status `ok|review|approved`.
3. `|delta| ≤ threshold` → status ok, exact weight stored for analytics; quote untouched.
4. `|delta| > threshold` → status review + notification to management role: margin impact = Δlbs × snapshot $/lb. If revision still Draft → one-click apply (creates updated copper line). If Issued → decision: new revision or absorb (logged either way).
5. Analytics: rolling estimator accuracy (est vs exact) per board type — feeds [SEED] tuning.

## 6. Pricing Additions (no engine math changes)

1. Copper line enters as section/board line item through existing `line_items` mechanism.
2. Freight: board-level adder line (from setting, editable per quote).
3. Adder templates (startup/commissioning/extended warranty): one-click optional lines.
4. Issue gates (from Phases A/C) enforced at Issue action: validations, completeness, labour>0, price states FIRM-or-override, SLD ok.
5. Quote totals display: cost / price / GM% / GM$ (existing), + copper exposure box (est lbs, $/lb, validity date).

## 7. Quotation Revision Control

### 7.1 Model

`configurator_quotations` extended: `revision` (int, 0-base), `parent_quotation_id`, `status` (`draft|issued|accepted|rejected|superseded`), `revision_reason` (required for rev > 0), `issued_at/by`, `bom_snapshot_id`, `comex_snapshot_id`, `document_id` (PDF).

### 7.2 Rules

- Draft: recomputable freely. Issue → freezes: BOM snapshot, COMEX snapshot, PDF rendered, row immutable.
- New revision: clone last revision → edit → issue; previous auto-`superseded`.
- Accepted: configuration `status=locked` (Phase A); unlocking requires management role + reason (audit) — this is the change-order entry point (ERP Phase F).
- Diff view: any two revisions — lines added/removed, qty changes, price changes, total delta, copper delta.

### 7.3 Quote document additions

- SLD page (Phase C SVG → PDF page).
- Copper escalation clause text (when enabled): validity days, snapshot date, adjustment basis.
- Optional BOM summary appendix (category rollup, not full mBOM).

## 8. Submittal Package (Final Document Merge v2)

Ordered merge: cover (existing) → quotation PDF → SLD → BOM summary (optional) → component datasheets (File Manager links by component) → drawings (Phase E, when present) → custom uploads. Per-document include/exclude checklist; output stored as Document row (existing pipeline).

## 9. Acceptance Criteria

1. BOM parity: migrated v1 configurations → identical totals via bomEngineV2 adapter (release blocker).
2. Generators: reference board (MTM 2000A, 5 sections) produces correct bar/support/label/filler/lug quantities by hand-check; all generator rows traceable.
3. Copper estimator: hand-calculated reference (worked example in tests) matches to 0.1 lb; estimate recomputes on width/bus/topology change.
4. Copper quote line shows weight/$lb/snapshot date; revision pins snapshot; refresh logged.
5. Reconciliation: simulated SolidWorks return inside threshold → ok; outside → review + margin impact + management notification; issued revisions never silently change.
6. Freight + adder templates appear as editable lines; totals correct via existing engine.
7. Revisions: issue freezes (PDF + snapshots); diff view correct on a 3-revision chain; accept locks configuration.
8. Submittal merge produces ordered single PDF with selected documents.
9. eBOM/mBOM XLSX exports open clean in Excel; mBOM aggregation correct (where-used verified).

## 10. Out of Scope

- SolidWorks job queue, payload, drawing return → Phase E
- Order confirmation, procurement handoff of mBOM, change orders → Phase F
- Cable sizing → lug refinement (post-v1)
