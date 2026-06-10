# PHASE B — US Standards Rule-Pack Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Client:** Tier Power Systems, LLC (TPS) — UL 891 switchboard manufacturer
**Phase:** B of F (US Standards Rule-Pack)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** Phase A (product spine, typed catalog, regime field)
**Blocks:** Phase C (auto-population rules consume these tables), Phase D (copper estimator consumes bus schedule)

---

## 0. Critical Implementation Rules (STRICT)

1. This phase MODIFIES the 12-module logic engine (`frontend/src/configurator/lib/*`) — it is the only phase allowed to. Each change below names its target module.
2. Pricing/labour/BOM/quotation engines are NOT modified.
3. All rule values marked **[SEED]** are engineering-typical defaults shipped so the configurator works day 1. They are stored in the Engineering Standards module (editable data, not code) and remain flagged `verified: false` until TPS engineering signs off. **No [SEED] value may be hardcoded.**
4. UL rule-pack is active when `switchboard.standardsRegime = UL`. IEC behavior is retained dormant behind the regime flag (existing data stays readable). No dual-regime UI in v1.
5. Feature flag: `CONFIGURATOR_V2_RULES`.

## 1. Locked Decisions

| # | Question | Resolution |
|---|---|---|
| B-Q1 | Board types in scope | **UL 891 rule-pack only.** `board_type` vocabulary from TPS product line: `SWITCHBOARD_UL891`, `GEN_PARALLELING` (UL 891 construction), `PDU`, `RPP`, `DOCKING_STATION`. UL 508A control panels EXCLUDED from the configurator (different standard, different product). UL 1558 not built — TPS does not manufacture it. Drawout ACBs are allowed within UL 891 as individually-mounted devices. |
| B-Q2 | Load calc rule | **Split rule:** `designCurrent = 1.25 × continuous + 1.00 × non-continuous` (NEC 210.19/215.2). `continuousLoad` defaults to **Yes** (conservative). Motor loads via NEC Table 430.250 FLA lookup. 80%/100%-rated breaker logic per §4.4. |
| B-Q3 | Bus schedule | **Engineering Standards module** (new Settings area): company-level, versioned, editable tables seeded with [SEED] values + XLSX import. Saved once, reused across all projects. |
| B-Q4 | Frame sizes | Same Engineering Standards module — Frame Library table. Ship with [SEED] placeholder frames; TPS replaces with their real fabrication standards later (build now, enhance later — explicitly accepted). |
| B-Q5 | Service entrance | **In scope v1.** A board-level flag `serviceEntrance: boolean` triggering the rule bundle: SUSE labeling requirement, main bonding jumper + neutral disconnect means on BOM, NEC 230.95 GFP rule (§8 R6). Low cost, high correctness. |
| B-Q6 | Arc-resistant construction | **Dropped.** Arc-resistant ratings (ANSI C37.20.7) apply to metal-clad switchgear, not UL 891 switchboards. NEC 240.87 arc-energy-reduction rule (§8 R5) is kept — it applies regardless of construction. |

## 2. Engineering Standards Module (NEW — Settings → Engineering Standards)

Company-scoped, versioned reference data consumed by the engines. Each table: editable grid UI + XLSX import/export + `verified` flag per row + audit trail. Tables:

1. **Voltage Systems** (§3.1)
2. **Bus Schedule** (§5.1)
3. **Bus Support Spacing** (§5.2)
4. **Frame Library** (§6.1)
5. **Motor FLA Table** (NEC 430.250 values, read-only seed)
6. **Standard Ratings Ladders** (bus amp ladder, SCCR ladder — read-only seed, extendable)
7. **Safety Items Map** (§8 — rule → auto-added SKU mapping, editable so TPS binds rules to their actual part numbers)

Versioning: editing a table creates a new version; existing configurations pin the version they were designed against (re-open does not silently re-rule an old quote).

## 3. B1 — US Parameter Tables (replaces IEC dropdowns)

Target: System Parameters UI + `field-intelligence.ts` option sources. All options served from Engineering Standards / regime tables, not hardcoded arrays.

### 3.1 Voltage systems (replaces systemVoltage + phase pair)

| Code | V L-L | V L-N | Ø/Wires | Notes |
|---|---|---|---|---|
| 208Y/120 | 208 | 120 | 3Ø4W | wye |
| 240D | 240 | — | 3Ø3W | delta |
| 240/120-1 | 240 | 120 | 1Ø3W | single phase |
| 240HL | 240 | 120 | 3Ø4W | high-leg delta [SEED — confirm TPS sells] |
| 480Y/277 | 480 | 277 | 3Ø4W | wye — dominant |
| 480D | 480 | — | 3Ø3W | |
| 600Y/347 | 600 | 347 | 3Ø4W | [SEED — confirm] |
| 600D | 600 | — | 3Ø3W | [SEED — confirm] |

- `frequency` = 60 Hz, locked, hidden from UI.
- Selecting a voltage system auto-sets phase/wires; the old separate Phase dropdown is removed (Module 01 UI change).
- Breaker filtering (Module 07): `breakerRatedVoltage ≥ V L-L` AND slash-rating rule — a slash-rated breaker (e.g., 480Y/277V) is valid ONLY on solidly-grounded wye systems of matching configuration; straight-rated (480V) valid on any. Requires catalog attribute `voltageRating: straight | slash`.

### 3.2 Ratings ladders

- **SCCR (kA):** 10, 14, 18, 22, 25, 35, 42, 50, 65, 85, 100, 125, 150, 200.
- **Main bus (A):** 400, 600, 800, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000.
- **Branch/feeder device ladder (A):** 15–6000 standard NEC 240.6 ladder: 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000. Module 10 rounding uses THIS ladder (replaces the 13-value IEC list).

### 3.3 Enclosure & environment

- NEMA types replace IP: `1, 12, 3R, 4, 4X`. Installation Location filters: Indoor → 1/12; Outdoor → 3R/4/4X. Special Environment: Corrosive/Marine → 4X (stainless). **`Hazardous Area` option REMOVED** from Special Environment and Installation Location (UL 891 boards do not serve classified locations; engine must refuse, not quote).
- Ambient: 40 °C base per UL 891; >40 °C entry triggers derating warning (derating math Phase D refinement).
- Dimensions UI: inches everywhere. Section Width/Depth/Height dropdowns replaced by Frame Library selection (§6).

### 3.4 Board Setup field changes (Module 01 UI)

- `switchboardType` options = board_type vocabulary (B-Q1).
- `standards` dropdown: locked to `UL 891` when regime=UL (display-only).
- ADD `serviceEntrance: Yes|No` (default No).
- ADD `neutralRating` options: `100%`, `200%` (50%/150% removed — not US practice for these products; 200% required option for PDU/RPP/data-center nonlinear loads).

## 4. B2 — Load Calculation Engine v2 (Module 10 rewrite)

### 4.1 Inputs (per section, FEEDER-role only)

- `loadInputMode: kW | kVA | A | HP` (HP only when loadType=Motor)
- `loadValue: number` (free numeric input — dropdown REMOVED)
- `powerFactor: number` default 0.85 (used for kW; ignored for kVA/A)
- `continuousLoad: Yes | No` default **Yes**
- `demandFactor`, `diversityFactor`: retained, free numeric 0.1–1.0 (validated), default 1.0
- `userDefinedCurrent` (Design Current Override — §7.3)

### 4.2 Current derivation

```
3Ø:  I = kW × 1000 / (√3 × V_LL × PF)     |  I = kVA × 1000 / (√3 × V_LL)
1Ø:  I = kW × 1000 / (V_LL × PF)           |  I = kVA × 1000 / V_LL
A:   I = loadValue
HP (Motor): I = FLA from NEC 430.250 table lookup (V system, HP); largest motor in section × 1.25 (NEC 430.24)
AdjustedI = I × demandFactor × diversityFactor
designCurrent = continuous ? 1.25 × AdjustedI : 1.00 × AdjustedI
(mixed loads later: section v1 = one load definition, matching current UI)
recommendedRating = next rating ≥ designCurrent on NEC 240.6 ladder (§3.2)
effectiveCurrent = MAX(userDefinedCurrent, designCurrent)   [unchanged override semantics]
```

### 4.3 Removed

- Blanket 1.25 multiplier on everything (replaced by §4.2).
- kW dropdown (5..2000), demand/diversity dropdowns → numeric inputs with validation.

### 4.4 80%/100%-rated breaker rule (Modules 06 + 07)

- `pct_rated = 80` (default if attribute missing): valid if `rating ≥ designCurrent` (designCurrent already embeds 125% continuous).
- `pct_rated = 100`: valid if `rating ≥ AdjustedI` (NEC 210.19 exception — no 125% on continuous for 100%-rated assemblies). Filter and validation use this; recommended-breaker highlight prefers the cheaper passing option.

## 5. B3 — Bus Sizing

### 5.1 Bus Schedule table (Engineering Standards) — [SEED all rows]

| Rating (A) | Material | Bars/phase | Bar size (in) | Density check |
|---|---|---|---|---|
| 400 | Cu | 1 | 1/4 × 2 | 800 A/in² ✓ |
| 600 | Cu | 1 | 1/4 × 3 | 800 ✓ |
| 800 | Cu | 1 | 1/4 × 4 | 800 ✓ |
| 1200 | Cu | 2 | 1/4 × 3 | 800 ✓ |
| 1600 | Cu | 2 | 1/4 × 4 | 800 ✓ |
| 2000 | Cu | 3 | 1/4 × 4 | ~667 ✓ |
| 2500 | Cu | 4 | 1/4 × 4 | ~625 ✓ |
| 3000 | Cu | 4 | 1/4 × 5 | 600 ✓ |
| 4000 | Cu | 5 | 1/4 × 6 | ~533 ✓ |

Rules engine: chosen `mainBusRating` → bus schedule row → bar config (consumed by Phase D copper estimator: cross-section × run lengths × density 0.323 lb/in³ Cu). Density sanity rule: Cu ≤ 1000 A/in² [SEED], Al ≤ 750 A/in² [SEED]; schedule rows exceeding density fail validation. Temperature rise: 65 °C over 40 °C ambient per UL 891 (informational constraint on the table, testing is TPS's UL file domain).

### 5.2 Bus support spacing vs SCCR — [SEED]

| SCCR | Max support spacing (in) |
|---|---|
| ≤ 50 kA | 14 |
| 65 kA | 10 |
| 100 kA | 6 |
| 200 kA | 4 |

Drives GLASTIC auto-quantity (Phase D BOM): supports per bus run = ceil(runLength / spacing) + 1. Bracing rule (Module 05 addition): board SCCR must be ≤ bus bracing rating from schedule row.

### 5.3 Neutral & ground

- Neutral bus = 100% (same schedule row as phase) or 200% (double bars) per `neutralRating`.
- Ground bus: mandatory every board, `1/4 × 2` Cu full length [SEED]. Auto-added BOM item (§8 R1).

## 6. B4 — Layout Rules v2 (Module 09 rewrite)

### 6.1 Frame Library (Engineering Standards) — [SEED placeholder rows until TPS data]

Columns: `frameCode`, `width_in` (20/24/30/36/42 [SEED]), `depth_in` (24/36/48/60 [SEED]), `height_in` (90 std, 78 alt [SEED]), `usableDeviceHeight_in`, `topBusZone_in`, `bottomCableZone_in`, `accessType` (Front/Front&Rear), `maxBusRating_A`, `drawoutCapable: bool`, `notes`, `verified`.

### 6.2 Rules (all consume catalog dims from Phase A schema — NO hardcoded device sizes)

1. Section frame chosen from Frame Library (user picks or auto-suggest smallest fitting frame in Auto mode).
2. Vertical fit: Σ(device heights + interdevice clearance [SEED 4"]) ≤ `usableDeviceHeight_in`. BLOCK on violation.
3. Width fit: device width + side gutters [SEED 2× 4"] ≤ width. BLOCK.
4. Depth fit: device depth (+ drawout adder from catalog drawout dims) ≤ depth. BLOCK.
5. Handle height: highest operating-handle centerline ≤ 79 in above base (NEC 240.24(A) 6 ft 7 in). BLOCK.
6. Bottom cable entry → `bottomCableZone_in` reserved (no device intrusion); top entry → `topBusZone_in`. BLOCK.
7. Wire bending space: v1 reserve = cable zone from frame row (full NEC 312.6 conductor-size lookup deferred to Phase D when cable sizes are known). WARN-level only in v1.
8. Module 04 UI: Compartment Size + Stacking dropdowns REMOVED; replaced by read-only computed Layout Summary card (frame, fit %, remaining height, violations).
9. Output adds `requiredFrameCode`, `usedHeight_in`, `remainingHeight_in` to layout result (SolidWorks payload consumes these in Phase E).

## 7. B5 — Contradiction Fixes (engine + UI)

1. **Canonical section role enum** (`MAIN | FEEDER | TIE | METERING | AUX | BLANK`) in Modules 05/06/07/08; UI Section Type maps to it: Incomer→MAIN, Outgoing/Feeder/Motor Feeder→FEEDER (motor flag), Bus Coupler/Tie→TIE, +Metering/Aux/Blank added. "Feeder Type" block in Electrical & Protection DELETED (Module 03 UI). `parentSection` retained (SLD topology, Phase C).
2. **Module 04 vs 09:** resolved per §6.2.8 — layout is system-driven, no manual dimension dropdowns.
3. **userDefinedCurrent:** "Section Rated Current" renamed **Design Current Override (A)** — numeric, optional; locked & showing computed designCurrent in Auto mode; editable in Manual mode with WARN if < designCurrent (existing Module 06 Step 2 semantics now have a real UI home).
4. **Double-count fix:** `TotalSystemLoad = Σ effectiveCurrent of FEEDER-role sections only` (Module 08 Step 2 definition adopted by Module 05 Step 1; Module 05 consumes Module 08's aggregate — computed once). Field-intelligence hides Load Definition fields for MAIN/TIE/BLANK roles.
5. **Terminology:** mounting = `Fixed | Drawout` single field (Layout tab). Operation Type = mechanism only: `Manual | Electrically Operated`. "Withdrawable", duplicate "Fixed" in Operation Type removed. CB catalog attribute names aligned (`mounting`, `operationType`).

## 8. B6 — Safety & Compliance Rule Pack (NEW engine table: safety-rules.ts + Safety Items Map)

| # | Trigger | Action | Severity |
|---|---|---|---|
| R1 | Always | Auto-add ground bus + equipment ground lugs (board scope, category SAFETY) | BLOCK if removed without waiver |
| R2 | Always | Auto-add arc-flash warning label (NEC 110.16) per section | BLOCK |
| R3 | Always | Auto-add SCCR + ratings nameplate (UL 891 marking) | BLOCK |
| R4 | Unused mounting space in any section | Auto-add filler plates (qty from layout remaining-space) | WARN |
| R5 | Any device frame ≥ 1200 A | Trip unit must provide arc-energy reduction (ERMS/ZSI) — NEC 240.87. Filter trip-unit options in CB selection + builder; validate on existing lines | BLOCK |
| R6 | serviceEntrance AND 480Y/277 AND main ≥ 1000 A | Main trip unit must include Ground Fault (LSIG) — NEC 230.95. Filter + validate | BLOCK |
| R7 | serviceEntrance | Auto-add SUSE label, main bonding jumper, neutral disconnect means | BLOCK |
| R8 | Any drawout device | Auto-add shutters + racking interlock + door interlock items | BLOCK |
| R9 | TIE section present | Key-interlock scheme required; validate ≥2 MAIN sections exist (existing Module 05 Step 6) + auto-add key interlock SKU pair | BLOCK |
| R10 | Outdoor (3R/4/4X) | Auto-add space heater + thermostat per section | WARN (default-added, removable with reason) |
| R11 | Corrosive/Marine | Force NEMA 4X stainless enclosure filter | BLOCK |

Auto-added items resolve to TPS part numbers via the **Safety Items Map** (Engineering Standards) — rule fires → SKU + qty formula. Unmapped rule → ad-hoc BOM line with description, flagged for mapping. All auto-added lines: `source: 'auto'`, removable only with logged waiver (Completeness Engine integration from Phase A).

## 9. Acceptance Criteria

1. Regime=UL board shows only US tables (voltage systems, NEMA, inch frames, NEC ladder); no IEC value reachable in UI.
2. Load calc unit tests: ≥20 hand-calculated cases (3Ø/1Ø, kW/kVA/A/HP, continuous split, demand/diversity, motor FLA) match to 0.1 A.
3. 80% vs 100%-rated filtering proven by test: same load, 100%-rated option admits smaller frame.
4. R5 (240.87) and R6 (230.95) demonstrably filter trip-unit options and block violating configs.
5. Engineering Standards module: edit → version bump; old configurations pin old version; XLSX import/export round-trips.
6. All [SEED] rows visibly flagged unverified in UI until TPS sign-off.
7. Contradiction fixes verified: no Feeder Type block, no Compartment Size/Stacking dropdowns, single mounting field, FEEDER-only system load aggregation (test: incomer with stray load data does not inflate total).
8. Hazardous Area option absent; corrosive→4X enforced.
9. Quote parity guard: configurations not touching new fields still produce identical totals.

## 10. Client Data Sign-off Register (TPS)

| Item | Owner | Template |
|---|---|---|
| Bus schedule (real bar configs + support spacings) | TPS engineering | XLSX sheet "Bus Schedule" |
| Frame library (real fabrication frames) | TPS engineering | XLSX sheet "Frame Library" |
| Safety items map (rule → TPS part numbers) | TPS engineering | in-app grid |
| 80 priced CBs (Phase A §7.3) | TPS purchasing | XLSX sheet "CB Price List" |
| Voltage systems actually sold; 600V class yes/no | TPS sales | checklist |
| UL file constraints (densities, rise limits) | TPS engineering | review of [SEED] flags |

## 11. Out of Scope

- Auto-population/wizard UX and SLD → Phase C
- Copper estimator, glastic/bussing auto-BOM quantities, NEC 312.6 full lookup, ambient derating math → Phase D
- SolidWorks payload → Phase E
