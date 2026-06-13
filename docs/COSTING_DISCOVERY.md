# SWGPLAY — Costing & Engineering-Rule Discovery

Purpose: lock every assumption in the cost/engineering engine with TPS before we harden the
quote/BOM/proposal. Format per item: **Question** → *Standard / our recommendation* → **TPS answer**
(blank for you to fill). Nothing is assumed until answered.

Legend: [SEED] = a value currently hardcoded/guessed in the app and NOT verified.

---

## A. COPPER / BUS BAR

**A1. Bus ampacity basis — how is a bar size chosen for a given ampere rating?**
*Std/rec:* Industry rule of thumb is ~1000 A per in² for plated copper bus in still air; UL 891
uses a tested bus schedule per construction. Recommend we use TPS's *actual* bus schedule table
(rating → bar thickness × width × bars/phase), not a rule of thumb. Confirm the table is real, not [SEED].
**TPS:**

**A2. Copper grade & density.** *Std/rec:* C110 ETP copper, 0.323 lb/in³. Confirm grade and whether plated bar weight differs.
**TPS:**

**A3. Bars per phase by rating.** *Std/rec:* e.g. ≤1600A = 1 bar, 2000–3000A = 2, 4000A = 3+. Confirm TPS's exact breakpoints (these live in the bus schedule).
**TPS:**

**A4. Neutral bus sizing — when 100% vs 50%?** *Std/rec:* 100% neutral for non-linear/harmonic loads (data centers, VFDs) and where spec'd; 50% otherwise. Confirm TPS's default and the rule.
**TPS:**

**A5. Ground bus sizing.** *Std/rec:* 1/4"×2" Cu typical, sized per NEC 250.122 to the main OCPD. Confirm TPS's standard bar size and whether it scales with rating. (Currently [SEED] 1/4"×2".)
**TPS:**

**A6. Vertical riser bus (per section).** *Std/rec:* sized to the section's largest device rating. Confirm rule and whether risers are always present.
**TPS:**

**A7. Device stubs/taps (bus → breaker).** *Std/rec:* a stub length per device (we use 24" [SEED]). Confirm typical stub length and whether it varies by breaker size/position.
**TPS:**

**A8. Plating — tin vs silver, and cost.** *Std/rec:* tin standard, silver on spec/high-current joints. Confirm when silver is used and the cost adder.
**TPS:**

**A9. Fabrication factor & contingency.** *Std/rec:* we apply ×1.15 fab (offcut/bending waste) then +10% contingency on cost. Confirm these are TPS's real numbers or replace.
**TPS:**

**A10. Copper price build-up.** *Std/rec:* COMEX spot + a fabrication/handling adder per lb (we have adder + markup in the copper snapshot). Confirm the adder structure and who sets it.
**TPS:**

---

## B. SHEET METAL / ENCLOSURE / FRAMES

**B1. Fabricated in-house or purchased? (THE key question, blocks frame costing.)**
*Std/rec:* UL 891 builders usually fabricate frames in-house from sheet steel; some buy enclosures.
If fabricated → cost = steel weight (gauge × surface area × $/lb) + fab labour buckets. If purchased →
a vendor price per frame size. Confirm which (or both, by frame type / NEMA rating).
**TPS:**

**B2. Standard frame catalog.** *Std/rec:* a table of frame sizes (W×D×H, bus rating, drawout-capable). We have F-2024-90…F-4260-90 [SEED]. Confirm these are TPS's real standard frames with correct dims/ratings.
**TPS:**

**B3. Steel gauge by frame / NEMA type.** *Std/rec:* 12ga structure, 14ga covers typical; heavier for larger. Confirm gauges and whether they change cost.
**TPS:**

**B4. Finish.** *Std/rec:* ANSI 61 powder coat standard (matches your proposal). Confirm cost adder and any other finish options.
**TPS:**

**B5. Sheet-metal labour — how computed?** *Std/rec:* either a flat fab-hours figure per section/frame size, or by weight/complexity. Confirm which, and the hours per frame size.
**TPS:**

**B6. NEMA type cost impact.** *Std/rec:* 1 → 3R → 4 → 4X increase material (gaskets, SS) and labour. Confirm multipliers or per-type frame prices.
**TPS:**

---

## C. GLASTIC / INSULATORS / SUPPORTS

**C1. Bus support spacing rule.** *Std/rec:* spacing tightens as SCCR rises (short-circuit bracing). We have a busSupportSpacing table by kA [SEED]. Confirm it's TPS's real bracing table and the standard it follows.
**TPS:**

**C2. Glastic form & costing — standoffs (qty) or GPO-3 sheet (area)?** *Std/rec:* bus supports are typically GPO-3 standoff blocks counted per support point; some designs use cut GPO-3 sheet. Confirm how TPS buys/costs it (per support, per section, or by area).
**TPS:**

**C3. Double-count to resolve.** *Std/rec:* the rules engine emits "Standoff insulators" (Components) AND the BOM computes "Bus support (glastic)" — one of these double-counts. Recommend the BOM-computed (spacing-based) value is authoritative and we remove the rule item. Confirm.
**TPS:**

---

## D. CIRCUIT BREAKERS — SELECTION RULES

**D1. 80% vs 100%-rated — when?** *Std/rec:* 100%-rated where continuous load = breaker rating and listed for it; else 80% (size to 125% of continuous per NEC 210.20/215.3). Confirm TPS's default.
**TPS:**

**D2. ACB vs MCCB vs ICCB — threshold.** *Std/rec:* MCCB ≤ ~1200A, ACB (drawout) for mains and ≥ ~1600–2000A. Confirm TPS's breakpoints by role (main/feeder).
**TPS:**

**D3. Drawout vs fixed — rule.** *Std/rec:* mains and large feeders drawout; small feeders fixed; service-entrance often drawout main. Confirm.
**TPS:**

**D4. SCCR — fully-rated or series-rated?** *Std/rec:* fully-rated is safer/standard for switchboards; series ratings need tested combos. Confirm TPS's practice and whether AIC must match across the board.
**TPS:**

**D5. Standard breaker accessories.** *Std/rec:* which are auto-included vs optional — shunt trip, aux contacts, bell alarm, UV, closing/charging motor, Kirk key. Confirm the standard set and any per-spec rules.
**TPS:**

**D6. Lugs per breaker.** *Std/rec:* qty per pole (line+load), mechanical vs compression, by ampere range. Confirm the rule (we currently estimate 3/device).
**TPS:**

---

## E. LABOUR (7 buckets: CU / ASM / CNT / QC / TST / ENG / CAD)

**E1. Source of per-part hours.** *Std/rec:* from TPS's estimate workbook, per part_number, additive per unit. Confirm and confirm the bucket definitions (CU=copper fab, ASM=assembly, CNT=control wiring, QC, TST=test, ENG=engineering, CAD=drawing).
**TPS:**

**E2. Rates per bucket.** *Std/rec:* $40 standard, $85 TST (unconfirmed — G6). Confirm each bucket's $/hr.
**TPS:**

**E3. Design hours (ENG/CAD) — per board or per project? prorate over qty?** *Std/rec:* once per unique design, prorated across identical units. Confirm.
**TPS:**

**E4. Non-part labour.** *Std/rec:* is there per-section assembly/wiring/test labour NOT tied to a part_number? If so, how is it captured (per section, per board)? Today labour only comes from part buckets — confirm nothing is missing.
**TPS:**

**E5. Zero-labour block.** *Std/rec:* a quote cannot issue at 0 labour (hard block). Confirm this stays.
**TPS:**

---

## F. PRICING / MARGIN / COMMERCIAL

**F1. Margin method.** *Std/rec:* true gross margin, sell = cost / (1 − GM%). Confirmed in code. Confirm default GM% and whether it varies by customer/product.
**TPS:**

**F2. Overhead.** *Std/rec:* 10% applied to cost base. Confirm % and what it covers (facility, indirect).
**TPS:**

**F3. Copper escalation clause.** *Std/rec:* quote at a copper snapshot price + an escalation clause if copper moves >X% before order. Confirm wording/threshold.
**TPS:**

**F4. Per-line vs global margin.** *Std/rec:* global GM default, per-line override for special items. Confirm when overrides are used.
**TPS:**

**F5. Extras — freight, startup/commissioning, taxes.** *Std/rec:* separate line items, not in unit price. Confirm what's included vs excluded in the quote.
**TPS:**

---

## G. SECTION / LAYOUT / DESIGN RULES

**G1. Section fill — max devices & headroom.** *Std/rec:* fill to ~80% of usable section height (wireway, thermal, spares). We use device-envelope heights + 80% [SEED]. Confirm real device heights and the fill rule.
**TPS:**

**G2. When does a new section start?** *Std/rec:* by physical fit (height) and/or bus tap limits; main usually its own section. Confirm the rule.
**TPS:**

**G3. Main-tie-main.** *Std/rec:* load split per main; tie sized ≥ larger main. Confirm.
**TPS:**

**G4. Wireway/gutter & cable zones.** *Std/rec:* top bus zone + bottom cable zone reserved per section (we use 12"/16" [SEED]). Confirm real dimensions.
**TPS:**

---

## H. CUSTOMER vs INTERNAL BOQ / PROPOSAL

**H1. Customer-facing content.** *Std/rec:* proposal shows product description, ratings, spec params, qty, sell price — NO manufacturer, part#, cost, or labour. Confirm what's allowed.
**TPS:**

**H2. §4 spec-sheet parameters.** *Std/rec:* the parameter list in your TPS template (System ID, electrical ratings, bus config, enclosure & compliance, accessibility, cable mgmt, CB section params, aux & control, power connections). Confirm the authoritative list and which are board-level vs section-level.
**TPS:**

**H3. Multi-board layout.** *Std/rec:* boards as columns, max 4 per block, 2nd block for 5–8 (your "4 Items, 2 block"). Confirm and confirm A4 portrait vs landscape.
**TPS:**

**H4. Drawings in proposal.** *Std/rec:* append SLD + front elevation; confirm level of detail the customer should see.
**TPS:**

**H5. T&C.** *Std/rec:* fixed 29-clause set (in app), per-project overridable. Confirm.
**TPS:**

---

## I. WORKFLOW / ERP (for later — capacity, work order, traveller)

See `docs/capacity-traveler-design.md` §5 — the 12 questions on team roster, shifts, machines,
outsourcing partners, checklists, quality gates, notification channel, barcode scanning, and the
work-order per-project vs per-board decision. Answer when ready; not blocking the cost engine.
**TPS:**
