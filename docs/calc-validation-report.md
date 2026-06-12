# Calculation Validation Report — UL 891 Switchboard Configurator

Independent reference-case audit of every calculation engine. Expected values
are **hand-computed** from the cited NEC table/section or UL 891 rule (arithmetic
shown in the harness comments), then asserted against live engine output. No
expected value was copied from engine output.

## Harnesses (executable)

| Harness | Engines covered | How to run | Result |
|---|---|---|---|
| `frontend/src/configurator/lib/__tests__/calc-validation.harness.js` | load-calc v1 + v2, NEC 240.6 ladder, copper-estimator.ts, lineup-proposal.ts | `cd frontend && npx tsc --outDir /tmp/cv --module commonjs --target ES2019 --esModuleInterop --skipLibCheck --moduleResolution node --resolveJsonModule src/configurator/lib/{us-standards,load-calculation-v2,load-calculation,copper-estimator,lineup-proposal,safety-rules}.ts && LIB=/tmp/cv node src/configurator/lib/__tests__/calc-validation.harness.js` | **52 / 52 pass** |
| `backend/src/services/configurator/__verify__/calc-validation.js` | copperEstimator.js, bomEngineV2.js, labourEngine.js, pricingEngine.js (+ v2QuoteService multi-unit logic) | `cd backend && node src/services/configurator/__verify__/calc-validation.js` | **53 / 53 pass** |

The repo CRA/babel test runner cannot parse the existing `engines-v2.test.ts`
(legacy `<any>` cast → babel SyntaxError, 0 tests collected), so the frontend
engines are validated via `tsc → CommonJS → node`, which executes the real
engine logic unmodified. Backend engines are plain CommonJS and run directly.

## Per-engine results

### 1. Load calculation (load-calculation-v2.ts / load-calculation.ts)
| Case | Rule | Hand value | Verdict |
|---|---|---|---|
| 100 kW 480Y/277 3Ø PF.9 cont. | I=kVA·1000/(√3·Vll·PF); ×1.25 (215.2); 240.6 | base 133.65 A, design 167.06 A, → 175 A | PASS |
| non-continuous | no 1.25 | design 133.65 → 150 A | PASS |
| 500 kVA 208Y/120 | I=kVA·1000/(√3·Vll) | 1387.86 A → 2000 A | PASS |
| 24 kW 240/120-1 1Ø PF1 | I=kVA·1000/Vll | 100 A → 125 A | PASS |
| 50 HP @460V | 430.250 FLA 65 A, 430.24 ×1.25, **no double 1.25** | 81.25 A → 90 A | PASS |
| demand 0.8 × diversity 0.9 | adjusted before 1.25 | 254.71 A → 300 A | PASS |
| breakerAdmits 80% vs 100% | 210.19(A)(1) Exc | 100%→adjusted, 80%→design | PASS |
| v1 legacy 3Ø/1Ø | √3 form, v1 ladder | 173.9 A→250 A; 43.48 A→63 A | PASS |

### 2. NEC 240.6(A) device ladder (us-standards.ts)
`deviceLadder_A` matches the authoritative 240.6(A) standard-ampere set
**exactly** (37 values). `nextLadder` rounds **UP** (101→110, 200→200 exact,
7000→null, 1→15). PASS.

### 3. Copper estimator (copperEstimator.js + copper-estimator.ts twins)
- Cu density **0.323 lb/in³** (within the standard 0.321–0.323 band). PASS.
- Bar volume = barsPerPhase × (thk×w) × run × 3 phases × density → 261.63 lb. PASS.
- Neutral = phase × neutralPct/100; ground = thk×w×run×ρ. PASS.
- Fab factor ×1.15 then cost = lbs × price × (1 + contingency 10%) — **contingency
  applied exactly once**, no double-application. PASS.
- Device stub = thk×w × stubLen 24" × poles × ρ. PASS.
- Supports = `ceil(run/spacing)+1` (90/10→10). PASS.
- **Frontend and backend twins produce byte-identical output** (cross-checked). PASS.

### 4. BOM-v2 quantity generators (bomEngineV2.js)
| Generator | Formula | Hand value | Verdict |
|---|---|---|---|
| GEN-BUS-MAIN phase | barsPerPhase×3 | 9 | PASS |
| neutral | ceil(barsPerPhase×pct/100) | 3 (100%), 2 (200% on bpp1) | PASS |
| GEN-GLASTIC | ceil(run/spacing)+1 | 10 | PASS |
| GEN-HW-JOINT | (sections−1)×bpp×3 | 18 | PASS |
| GEN-LABEL arc-flash | max(sections,1) | 3 | PASS |
| GEN-COPPER-EST | priced via costUsd, ESTIMATED, qty 1 lot | — | PASS |
Single-section board correctly emits **no** joint kits. PASS.

### 5. Labour engine (labourEngine.js)
hours = Σ(lbr_cat × qty); cost = hours × rate. cu 1h, asm 2h, eng 1h → 85/150/130,
total 365. PASS.

### 6. Pricing engine (pricingEngine.js) — GM math
- **price = cost/(1−GM%)** (true gross margin, NOT cost×(1+GM%)). cost 1000, GM
  0.30 → target 1428.57 (markup would be 1300 — explicitly rejected). PASS.
- Excel ROUNDUP: roundup(−1)→1430, (−2)→1500, (2)→1.24. PASS.
- Full computeQuote (material+labour+overhead 10%): 1507 cost → GM .25 → 2010. PASS.
- GM ≥ 1 throws (guards "30" entered for 0.30). PASS.
- **Copper double-count guard**: pricingEngine's COPPER_RATE_PER_LB path *would*
  add cost (proven: 50 lb × $4/lb = $200); v2QuoteService correctly zeroes that
  rate because copper is already a priced BOM material row. PASS.

### 7. Multi-unit design-hour proration (v2QuoteService.js logic)
Design (ENG+CAD) with overhead charged **once**; rest ×units. 3 units → totalCostN
3707 (design once) < naive 1507×3=4521. perUnitPrice 1650, totalPrice 4950. PASS.

### 8. Lineup proposal (lineup-proposal.ts)
- pickCheapest provenance: **vendor-import (TPS) wins over a cheaper manual part**. PASS.
- MAIN_TIE_MAIN: loadBasis halved per main (375→perMain 187.5→device 200 A); tie
  sized to per-main 200 A; mainBus ladder on full 375→400 A. PASS.
- Packing 80% fill cap: usable 62", cap 0.8×62=49.6"; each feeder 9"+4" clearance
  =13"; 3/section; 6 feeders → 2 sections, used 39"≤cap. PASS.

## Bugs FIXED
**None.** Every calculation matched its independent hand-computation. No math
error, wrong constant, double-count, or wrong-direction rounding was found in
any audited engine.

## Judgment items FLAGGED (no behavior changed)

1. **SectionEditorPanel fit-check ≠ packer math.** `utilizationFor` / `wouldExceed`
   (`steps/SectionEditorPanel.tsx`) compute `used = Σ deviceHeight` with **no
   inter-device clearance and no 80% max-fill cap**, while the packer
   (`lineup-proposal.ts`) uses `deviceH + 4" clearance` capped at `0.8 × usable`.
   So the manual editor will let an engineer pack a section the auto-proposer
   would have split. **Question for Vikraman:** should the editor's drag/move
   fit-check adopt the +4" clearance and 0.8 cap for consistency, or is the
   editor intentionally a "raw geometric headroom" override surface?

2. **All bus/density/spacing/FLA values are `[SEED]`** (flagged in code). The
   FLA table, bus schedule bar sizes, support spacing, fab factor 1.15,
   contingency 10%, stub length 24", and SCCR default 65 kA are seed values
   pending TPS engineering verification. The *arithmetic* on them is correct;
   the *values* are unverified — out of scope for a math audit. Recite via the
   SG Gap Log when reviewing data provenance.

3. **load-calculation.ts (v1) ignores power factor** (treats kW as kVA) and uses
   a different, coarser ladder than NEC 240.6. This is the legacy engine; v2 is
   the UL-regime replacement. Not a bug *if* v1 is deprecated — **confirm v1 is
   no longer on any live quote path** before relying on this.

## Not exercised
- DB-dependent quote persistence (`issueBoardQuote`, `computeBoardQuote` end-to-end)
  requires Sequelize models + a live DB; the **pure pricing/proration arithmetic**
  it delegates to was validated directly instead (cases 4–5 above, plus the GM and
  copper-zeroing logic replicated from `v2QuoteService`).
