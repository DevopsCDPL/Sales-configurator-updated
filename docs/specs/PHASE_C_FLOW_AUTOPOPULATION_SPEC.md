# PHASE C — Configuration Flow & Auto-Population Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Client:** Tier Power Systems, LLC (TPS)
**Phase:** C of F (Configuration Flow & Auto-Population)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** Phase A (spine), Phase B (US tables, rules, Engineering Standards)
**Blocks:** Phase D (review stage hosts copper/labour/quote), Phase E (SLD + layout feed SolidWorks payload)

---

## 0. Critical Implementation Rules (STRICT)

1. This phase builds UX flow + the auto-population rule catalog on top of Phases A/B. It does NOT modify calculation modules (10), validation modules (05/06/08/12), or pricing.
2. `field-intelligence.ts` is the ONLY engine extended (rule catalog §5). The line-up proposal engine (§4) is a NEW pure module (`lineup-proposal.ts`) executed via the Event Engine — it never mutates state directly, it returns proposals.
3. All auto-set values must be traceable: every auto-filled field carries `{source: ruleId, locked: boolean}`; every user override is logged (who/when/rule overridden).
4. Soft gating only — no stage may hard-block navigation. Only quotation issue is gated (§7).
5. Feature flag: `CONFIGURATOR_V2_FLOW`.

## 1. Locked Decisions

| # | Decision | Resolution |
|---|---|---|
| C-1 | Entry point | Requirements Intake screen with feeder schedule grid (paste-from-Excel). Approved. |
| C-2 | Line-up proposal | In v1, greedy algorithm (no optimization). Auto mode proposes; Manual mode builds by hand with field-level auto-fill. |
| C-3 | SLD | Auto-generated read-only one-line diagram (SVG) from configuration topology; exports PNG/PDF into submittal. No interactive editing in v1 — configuration is the single source of truth. |
| C-4 | Navigation | Soft gating. Browse anywhere; quotation issue gated on validation + completeness + labour > 0 + price-state gate (Phases A/B). |

## 2. Stage Model (over existing tabs — tabs survive, grouped and gated)

| Stage | Name | Contents | Done-when |
|---|---|---|---|
| 1 | Requirements Intake | NEW screen (§3) | intake saved with ≥1 feeder row or manual skip |
| 2 | System Parameters | existing System Parameters tab, auto-populated | no BLOCK validations on board params |
| 3 | Line-up Designer | sections overview + proposal actions + SLD view (§4, §6) | ≥1 MAIN, all sections frame-fitted |
| 4 | Detail Design | per-section tabs (CB, Electrical, Layout) + board steps (Enclosure auto/confirm, Bussing, Glastic, SPD/ATS, Controls, CT/VT, Conduit, Wire, Camlock, Standard BOM) | no BLOCK validations |
| 5 | Review & Quote | validation panel, completeness checklist, Labour review, copper estimate (Phase D), quotation | gates §7 |

Progress header replaces the current stepper: 5 stage chips with status `empty | partial | done | blocked` computed from validation-priority output + completeness engine. Clicking a chip navigates; nothing is locked.

## 3. Stage 1 — Requirements Intake (NEW)

Stored as `switchboard.intake` (JSONB). Re-editable any time; "Re-propose line-up" action (§4.4) consumes it.

### 3.1 Board-level intake fields

- `applicationType`: Data Center | Industrial | Commercial | Infrastructure | Utility | Oil & Gas
- `boardType`: SWITCHBOARD_UL891 | GEN_PARALLELING | PDU | RPP | DOCKING_STATION
- `voltageSystem`: from Phase B §3.1 table (filtered by Voltage Checklist)
- `serviceEntrance`: Yes/No
- `utilityFaultKA`: numeric or `Unknown` → AP-04 conservative default
- `sourceScheme`: Single Main | Main-Tie-Main | Multi-source (gen paralleling)
- `environment`: Indoor | Outdoor; `specialEnvironment`: None | Corrosive | Marine | Dusty
- `totalLoadHint`: optional numeric (kW/kVA/A) — used only if feeder schedule empty
- `targetDeliveryDate`, `notes`: pass-through (capacity planner, Phase F)

### 3.2 Feeder Schedule grid

One row per feeder. Columns:

`#`, `description`, `loadType` (General | Motor | Lighting | HVAC | Capacitor | Spare | Space), `loadInputMode` (kW|kVA|A|HP), `loadValue`, `powerFactor` (default 0.85), `continuous` (default Yes), `poles` (2|3, default 3), `qty` (default 1), `notes`

- **Paste-from-Excel:** TSV clipboard parse into rows with column-mapping preview dialog (same pattern as any grid import; reject report inline).
- `Spare` rows: no load, device space reserved + device included (auto: same frame as nearest sized neighbor or user-set rating). `Space` rows: bucket/provision only, no device.
- Validation: loadValue > 0 for load rows; HP only when Motor; qty ≥ 1.
- The grid is intake data — it generates section/electrical state but remains the editable origin (re-propose diffs against it).

## 4. Line-up Proposal Engine (`lineup-proposal.ts`, NEW, pure)

### 4.1 Inputs

intake (§3), Engineering Standards (bus schedule, frame library, ladders), catalog (devices + dims + prices + states), Phase B rule outputs.

### 4.2 Algorithm (greedy, deterministic)

```
1. For each feeder row × qty:
   designCurrent per Module 10 v2 (HP→FLA; continuous split; PF)
   candidateDevices = Module 07 filter (voltage, AIC, role=FEEDER, 80/100% rule)
   pick: cheapest FIRM-priced candidate; else cheapest ESTIMATED; tag PENDING if none priced
2. Main(s):
   totalLoad = Σ FEEDER designCurrents (per Module 08 definition)
   mainBusRating = next ladder step ≥ totalLoad   (override: intake.totalLoadHint if larger)
   sourceScheme = Single → 1 MAIN; Main-Tie-Main → 2 MAIN + 1 TIE (each MAIN ≥ totalLoad/2,
     TIE ≥ max(main loads) per Module 08 Step 5); Multi-source → 1 MAIN per source (gen paralleling)
   main device = Module 07 filter role=MAIN (ACB/ICCB per rules; R5/R6 trip-unit filters applied NOW)
3. Bus: bus schedule row for mainBusRating (Phase B §5.1); SCCR = utilityFaultKA rounded UP to ladder;
   AP-04 if Unknown
4. Bin-packing (greedy, top-down):
   sort devices: MAINs first (dedicated section if frame height > 50% usable [SEED]), then TIE,
   then feeders descending height
   for each device: place into first open section with (remaining usable height ≥ device height
   + clearance) AND (frame maxBusRating ≥ mainBusRating) AND handle-height rule satisfied;
   else open new section with smallest fitting frame from Frame Library
   respect MAX_SECTIONS; overflow → proposal error "exceeds section limit"
5. Emit proposal: sections[] (frame, role, devices w/ position), boardParams patch,
   per-section electrical prefill (from feeder rows), warnings[]
```

### 4.3 Application

Proposal is presented as a **diff preview** (sections to create, devices to place, params to set) → user Accepts (state mutated via Event Engine actions, all lines `source:'auto'`) or edits first. Nothing applies silently.

### 4.4 Re-propose

Re-running after intake edits: preserves manual overrides (per-field override map from §5) and user-added lines; diff shows adds/removes/changes; conflicts (manual edit vs new proposal) listed explicitly, user picks per item. In Manual design mode, re-propose is available but never auto-runs.

## 5. Auto-Population Rule Catalog (field-intelligence extension)

Every rule: `{id, trigger, target, directive (autoFill|filter|lock|recommend|hide), value/source, mode}`. `mode: Auto` = fill+lock (unlock = logged override); `mode: Manual` = recommend only. Catalog v1 (extendable data, not code):

**Intake → System Parameters**
- AP-01 voltageSystem → systemVoltage/phase/wires set+locked; breaker voltage+slash filter active
- AP-02 applicationType=Data Center → neutralRating=200%, metering default MFM, NEMA 1/12, recommend 480Y/277
- AP-03 environment=Outdoor → NEMA filter {3R,4,4X}; R10 heater rule armed
- AP-04 utilityFaultKA=Unknown → SCCR=65kA [SEED default], WARN "verify utility fault data before release"
- AP-05 utilityFaultKA known → SCCR = next ladder ≥ value; locked
- AP-06 serviceEntrance=Yes → R6/R7 armed; main trip-unit GFP filter
- AP-07 specialEnvironment Corrosive/Marine → NEMA=4X locked (R11)
- AP-08 totalFeederLoad → mainBusRating = next ladder step; locked in Auto
- AP-09 boardType=PDU/RPP → neutralRating=200% locked; recommend K-rated/200% neutral wireway notes
- AP-10 sourceScheme=Main-Tie-Main → sections MAIN×2+TIE enforced; R9 armed

**System → Sections / devices**
- AP-11 mainBusRating → bus schedule row → bussing BOM prefill (bars, plating) [Phase D quantities]
- AP-12 SCCR → AIC filter every device; glastic spacing row; bracing check armed
- AP-13 sectionRole=MAIN/TIE → Load Definition hidden (B5 fix); breakerType filter ACB/ICCB
- AP-14 sectionRole=FEEDER + loadType=Motor → HP input mode; FLA lookup; motor-rated trip filter
- AP-15 mounting=Drawout → R8 items armed; depth check uses drawout dims
- AP-16 frame selection → enclosure component line auto-added per section (scope=section, source=auto)
- AP-17 metering choice MFM → CT requirement=Required, CT type=Metering/Both auto
- AP-18 ctRequirement=Required → CT ratio recommended from section designCurrent (next std ratio ≥ 1.25×I [SEED])
- AP-19 continuous load + 80%-rated candidate → designCurrent check per B §4.4 (filter, not warn)
- AP-20 deviceFrame ≥1200A → R5 trip-unit ERMS/ZSI filter

**Layout**
- AP-21 device list per section → auto-suggest smallest fitting frame (Auto: set+locked)
- AP-22 remaining space in section → filler plate qty (R4)
- AP-23 cableEntry=Bottom → bottomCableZone reserved; lug/termination prefill at bottom
- AP-24 accessType from frame row → locked accessType field

**Commercial/safety**
- AP-25 R1–R3 always-on auto-add items (ground bus, labels, nameplate)
- AP-26 quote currency/freight defaults from company settings
- AP-27 every auto-added line: source=auto, removable only with waiver

Catalog stored as data (`auto-rules.ts` registry) — adding a rule must not require touching engine plumbing.

## 6. Generated SLD (`sld-generator.ts`, NEW, pure)

- Input: switchboard topology (sections, roles, parentSection, devices, ratings, bus segments from TIE placement).
- Output: SVG. Layout: horizontal bus line per bus segment; MAIN devices above bus with source stubs; TIE between segments; FEEDER drops below in section order; labels: device designation (auto: M1, T1, F1..Fn), frame/rating/trip, section ref, board title block (project, CFG rev, voltage, bus, SCCR).
- Symbols: simplified ANSI one-line symbols (breaker = square/slash convention used in US one-lines).
- Regenerated as the final Event Engine pipeline step (always current, never stale).
- Export: PNG + PDF (server-side via existing pdf service); auto-included in Final Document Merge / submittal package.
- The SLD tab replaces notes-only view: diagram + the existing notes/attachments retained below.

## 7. Gating (soft)

- Browse: unrestricted, all stages, all tabs.
- Quotation **issue** (customer-facing) requires ALL: Level-1/2 validations clear (Module 12), completeness rules pass or waived (Phase A), labour total > 0, price gate (all FIRM or override), SLD generated without topology errors.
- Quotation **compute/preview**: always allowed (flagged draft watermark if gates failing).
- Stage chips show blocking reasons on hover (from validation-priority + completeness outputs).

## 8. UX Notes

- Tab strip persists under stage header; section-scoped tabs render inside section context (Section N selector), board tabs at board level — scope selector from Phase A §6.3 remains for manual lines.
- Intake screen is also the fastest path for repeat business: Load Configuration (Phase A) + edited intake + Re-propose = re-quote in minutes.
- Field-level override affordance: lock icon → click → confirm dialog (reason optional in Manual, required in Auto) → field unlocks, override logged, rule chip shows "overridden".

## 9. Acceptance Criteria

1. Demo path: intake (paste 20-row feeder schedule from Excel) → accept proposal → review → draft quote in under 30 minutes by a non-developer.
2. Proposal engine: 5 reference cases (single main 800A; MTM 2000A; data-center PDU 480Y/277 200%N; motor-heavy industrial; mixed with spares) produce line-ups passing ALL Phase B validations with zero manual fixes.
3. Determinism: same intake → identical proposal (snapshot tests).
4. Re-propose preserves manual overrides and user lines; conflict list shown; nothing applied silently.
5. Every auto-filled field shows rule source; overrides logged with user/timestamp; Auto-mode override requires reason.
6. SLD renders for all 5 reference cases; PNG/PDF export; included in document merge; regenerates on any topology change.
7. Soft gates verified: navigation never blocked; quote issue blocked exactly per §7 with human-readable reasons.
8. Quote parity guard: existing configurations untouched by new flow produce identical totals.

## 10. Out of Scope

- Copper estimator math, labour/quote enhancements → Phase D
- SolidWorks payload (consumes layout + SLD topology) → Phase E
- Intake→CRM linkage, capacity planner consumption of targetDeliveryDate → Phase F
