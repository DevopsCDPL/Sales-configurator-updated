# Cost & Engineering Standards Module — Specification

Goal: make EVERY engineering/cost value tenant-configurable from the UI with industry defaults.
Nothing hardcoded; engines read only from standards. This is also the foundation of tenant separation.

Principle: **defaults preserve today's behaviour** — seeding the current values means existing
quotes don't move; tenants then tune. Every standards row carries `seed:true, verified:false`
until the tenant confirms, and unverified values are flagged on internal views.

---

## PART 1 — FULL AUDIT (every value that drives a number)

Status: **STD** = already a standards table · **SEED-CODE** = hardcoded constant that MUST move to standards ·
**DUP** = duplicated across files (consolidate) · **NOT-WIRED** = standards row exists but engine ignores it.

| # | Value | Current location | Status | Target group |
|---|-------|------------------|--------|--------------|
| 1 | Bus schedule (rating→thk×w×bars) | engineeringStandardsSeed `bus_schedule` | STD | Copper & Bus |
| 2 | Bus support spacing vs kA | `bus_support_spacing` | STD | Glastic/Support |
| 3 | Frame library (dims, rating, drawout) | `frame_library` | STD | Enclosure |
| 4 | Motor FLA (NEC 430.250) | `motor_fla` | STD | Load calc |
| 5 | Voltage systems (VLL, phase/wire) | `voltage_systems` | STD | Load calc |
| 6 | Ratings ladders (SCCR, main bus, NEC 240.6) | `ratings_ladders` | STD | Ratings |
| 7 | Safety items map (R-rules) | `safety_items_map` | STD | Safety |
| 8 | Packing settings (envelopes, fill, clearance) | `packing_settings` table **+** lineup-proposal.ts consts | **NOT-WIRED + DUP** | Layout |
| 9 | Component auto-rules (CR-01..24) | `component_rules` (self-healed) | STD | Rules |
| 10 | Labour rates ×7 buckets | costingDefaults `lbr_*_rate` | STD | Pricing |
| 11 | Overhead % | costingDefaults `overhead_pct` | STD | Pricing |
| 12 | Default GM % | costingDefaults `default_gm_pct` | STD | Pricing |
| 13 | Copper $/lb base | costingDefaults `copper_price_per_lb` (+ COMEX snapshot) | STD | Copper & Bus |
| 14 | Copper fab factor 1.15 | costingDefaults **AND** copperEstimator DEFAULT_SETTINGS | **DUP** | Copper & Bus |
| 15 | Copper contingency 10% | costingDefaults **AND** copperEstimator | **DUP** | Copper & Bus |
| 16 | Cu density 0.323 / Al 0.098 lb/in³ | copperEstimator.js + copper-estimator.ts consts | **SEED-CODE** → copper_grades | Copper & Bus |
| 17 | Stub length 24 in | copperEstimator DEFAULT_SETTINGS | SEED-CODE | Copper & Bus |
| 18 | Ground bus 0.25"×2" | bomEngineV2.js + v2BomService groundBar | **SEED-CODE + DUP** | Copper & Bus |
| 19 | Joint kit 1/joint | bomEngineV2.js literal | SEED-CODE | Bussing hardware |
| 20 | Lug 1/pole | bomEngineV2.js literal | SEED-CODE | Terminations |
| 21 | Inter-device clearance 4 in | lineup-proposal INTERDEVICE_CLEARANCE_IN | SEED-CODE | Layout |
| 22 | Device envelopes (feeder 9 / main 20 / tie 20 in) | lineup-proposal DEVICE_ENVELOPE_IN | SEED-CODE | Layout |
| 23 | Max section fill 0.8 | lineup-proposal MAX_FILL_PCT | SEED-CODE | Layout |
| 24 | Main dedicated pct 0.5 | lineup-proposal MAIN_DEDICATED_PCT | SEED-CODE | Layout |
| 25 | Default SCCR 65 kA | lineup-proposal DEFAULT_SCCR_KA | SEED-CODE | Ratings |
| 26 | Continuous factor 1.25 | load-calculation-v2.ts literal | SEED-CODE | Load calc |
| 27 | Default power factor 0.85 | load-calculation-v2.ts literal | SEED-CODE | Load calc |
| 28 | Motor 1.25 (NEC 430.24) | load-calculation-v2.ts literal | SEED-CODE | Load calc |
| 29 | Top bus / bottom cable zone (12/16 in) | frame_library rows (per frame) | STD (verify) | Enclosure |
| 30 | Breaker class thresholds (Power→ACB, Dip/TM→MCCB) | backfill-cb-specs heuristic | SEED-CODE | Breaker rules |
| 31 | 80% vs 100% rated default | pctRated literal 80 | SEED-CODE | Breaker rules |
| 32 | Roundup factor (sell price) | costingDefaults `roundup_factor` | STD | Pricing |
| 33 | Plating adder (tin/silver) | — none yet | MISSING | Copper & Bus |
| 34 | Enclosure cost model (fab vs buy) | — none yet (frames unpriced) | MISSING | Enclosure |
| 35 | NEMA cost multiplier | — none yet | MISSING | Enclosure |

Net: **17 SEED-CODE / DUP / NOT-WIRED items to migrate**, **3 MISSING to add** (plating, enclosure cost model, NEMA), plus the **copper_grades** table (item 16) the user requested.

---

## PART 2 — TARGET STANDARDS SCHEMA (the "standard sheet")

All stored per tenant (company_id), versioned (N+1 on save), `seed/verified` flags. Grouped:

### Group 1 — Copper & Bus
- `copper_grades` (NEW): rows { grade, density_lb_in3, default:bool }. e.g. C110 ETP 0.323, C101 0.323, Aluminium 6101 0.098. UI: dropdown; selected grade's density feeds the estimator.
- `copper_cost`: { comex_source: 'live'|'manual', manual_price_per_lb, fabrication_adder_per_lb, plating: { tin_adder_per_lb, silver_adder_per_lb }, escalation_threshold_pct }. Delivered $/lb = COMEX(live) + fab adder + plating adder.
- `copper_estimator`: { fab_factor (1.15), contingency_pct (10), stub_len_in (24) }. (Consolidate the duplicate — remove from copperEstimator DEFAULT_SETTINGS, read here.)
- `ground_bus`: { thk_in (0.25), w_in (2) }.

### Group 2 — Bus schedule & bracing (existing, surface for edit)
- `bus_schedule`, `bus_support_spacing`, `neutral_schedule` — already tables; ensure full CRUD UI.

### Group 3 — Enclosure / Frames
- `frame_library` (existing): confirm dims/rating/drawout/zones editable.
- `enclosure_costing` (NEW): { model: 'fabricated'|'purchased', steel_price_per_lb, gauge_structure, gauge_covers, fab_hours_per_frame OR by_weight, nema_multipliers: {n1,n3r,n4,n4x}, finish_adder }. ← unblocks frame cost (the open decision).

### Group 4 — Layout / Packing (wire the existing table!)
- `packing_settings` (exists, NOT wired): { feeder_envelope_in (9), main_envelope_in (20), tie_envelope_in (20), max_fill_pct (0.8), interdevice_clearance_in (4), main_dedicated_pct (0.5), top_bus_zone_in, bottom_cable_zone_in }. ← lineup-proposal + SectionEditor + elevation must READ this, not code constants.

### Group 5 — Load calc & ratings
- `load_calc` (NEW): { continuous_factor (1.25), default_power_factor (0.85), motor_factor (1.25), default_continuous (true) }.
- `ratings_ladders` (exists): SCCR, main bus, NEC 240.6 device. + `default_sccr_kA` (65).
- `motor_fla`, `voltage_systems` (exist).

### Group 6 — Breaker selection rules
- `breaker_rules` (NEW): { default_pct_rated (80|100), acb_threshold_A, mccb_max_A, drawout_rule, sccr_basis: 'fully'|'series', class_by_name_patterns (the backfill heuristic, now editable), standard_accessories[] }.
- `component_rules` (exists): the CR-* qty rules.

### Group 7 — Pricing & commercial
- `cost_settings` (consolidate costingDefaults): 7 labour rates, overhead_pct, default_gm_pct, roundup_factor.
- Per-component margin override stays on the component (specifications.marginPct).

### Group 8 — Terminations / hardware factors
- `termination_factors` (NEW): { lugs_per_pole (1), joint_kits_per_joint (1) }. (Move bomEngineV2 literals here.)

### Group 9 — Proposal / BOQ
- `proposal_settings` (NEW, tenant): { boards_per_block (4), page_orientation, customer_visible_fields[], terms_clause_set, letterhead_ref }. ← tenant separation for the customer doc.

---

## PART 3 — ENGINE WIRING (remove every constant)

- copperEstimator: density from selected `copper_grades`; fab/contingency/stub from `copper_estimator`; ground bus from `ground_bus`. Delete the local DEFAULT_SETTINGS + density consts.
- lineup-proposal: envelopes/fill/clearance/main-dedicated from `packing_settings`; default SCCR from `ratings_ladders`. Delete consts. (Frontend reads via the standards the candidateProvider/proposal already loads.)
- load-calculation-v2: factors/PF from `load_calc`. Delete literals.
- bomEngineV2: ground bus, joint kit, lug factors from standards. Delete literals.
- backfill/breaker selection: thresholds from `breaker_rules`.
- pricing/quote: already reads costingDefaults → repoint to consolidated `cost_settings`.
All reads go through one accessor (`getStandards(companyId)`), cached per request, with the seed defaults as fallback so nothing breaks if a table is empty.

---

## PART 4 — UI (Database → Engg Standards, expanded)

Keep the existing StandardsPanel table-picker; expand to the 9 groups above as a left-rail of sections,
each a form/table editor on the right (locked standard table format). Special widgets:
- **Copper grade** dropdown → shows density (read-only) → live COMEX price badge + adders → computed delivered $/lb preview.
- **Enclosure costing** model toggle (fabricated/purchased) revealing the right fields.
- Every numeric field: label, unit suffix, default shown as placeholder, validation range, and a "seed/verified" toggle so the tenant marks it confirmed.
- Save = new version (N+1), audit who/when. "Reset to default" per field.

---

## PART 5 — BUILD PHASES (no rework order)

1. **Schema + accessor + defaults**: create the new tables (copper_grades, copper_cost, copper_estimator, ground_bus, enclosure_costing, packing wiring, load_calc, breaker_rules, termination_factors, proposal_settings) via additive migration, seeded with the CURRENT values (zero behaviour change). One `getStandards()` accessor.
2. **Wire engines**: repoint each engine to the accessor; delete constants; re-run the validation harness (must stay green — same defaults = same numbers).
3. **UI**: expand StandardsPanel to all groups + copper-grade/COMEX widget + enclosure model.
4. **Verify + flags**: unverified values flagged on BOM/quote/proposal outputs.

After this, TPS's returned questionnaire values are simply entered as their tenant standards — no code change. Vendor #2 sets their own. This block also de-hardcodes the cost spine = the tenant-separation foundation.
