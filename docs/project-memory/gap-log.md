GAP & ISSUE LOG (started 2026-06-13 at Vikraman's request — note every gap spotted in discussion; recite when he asks "show all gaps").

DATA GAPS
- G1 Frame library is [SEED] — frame dims/capacities never verified by TPS engineering; fit-checks and elevations inherit this risk.
- G2 Generic legacy CB tiers lack dimensions → height fit-check can't judge them (picker keeps them with "verify" note).
- G3 Scraped images sparse (20/310) — JS-rendered manufacturer sites; needs Chrome-driven re-scrape; R2 mirroring when hotlinks rot.
- G4 SPD/ATS/CT/CB-accessory street prices login-walled — rows carry vendor SKUs; RFQ loop is the path.
- G5 Labour hours: real data only after TPS workbook import + labour template round-trip; breakers rely on legacy tier hours.
- G6 TST rate $85 vs $40 unconfirmed by TPS.
- G7 Letterhead/logo + client records empty → proposal placeholders.
- G8 Vendor names from Excel import stored as strings when unmatched (vendorUnresolved=true) — surfaced w/ "Vendor?" badge+filter; fuzzy auto-match still pending.
- G9 CT/VT naming overlap: legacy category VOLTAGE TRANSFORMER vs tab CT / VT / CPT synonym-mapped — watch for double tabs if server categories drift.

ARCHITECTURE GAPS
- G27 TWO BOM GENERATORS, split view ("components section is mysterious"): componentRules.js (Components page) emits only SMALL ACCESSORIES; STRUCTURAL items live elsewhere — ENCLOSURE = section FRAMES (Section Design, frame_library; sheet-metal = frame + fab labour), PHASE/NEUTRAL/GROUND BUS + COPPER WEIGHT + GLASTIC + JOINT KITS + FILLERS = bomEngineV2.js at BOM page. G27a DONE: read-only "Structural (computed at BOM)" card now on Components summary. DECISION STILL OPEN: keep split (done) vs fully merge the two engines into one BOM view — Vikraman's call.

ENGINEERING GAPS
- G10 Schneider decoder builds structurally-valid but not orderability-validated numbers (needs compatibility matrix).
- G11 Universal part-number generator engine pending (Siemens 3VA/Eaton positional, ABB SKU lookup as data packs) — FABLE task.
- G12 Suitability filter: kA + height + voltage checks DONE; no AIC series-rating logic yet.
- G13 SLD: no client/engineer validation pass yet on rebuilt symbology; multi-source (gen paralleling) topologies unsupported.
- G14 Elevation §6: frame-dim placeholders when dims missing (ties to G1); side/rear views absent.
- G15 Copper estimator pass-2 (SolidWorks true-up) parked with SW automation.
- G16 Intake provisions rules CR-18..24: name-pattern matching is heuristic; needs engineering review of picked parts.
- G17 Section delete only when empty (v1); no device auto-rehome — DEFERRED.
- G24 Packing density FIXED (b89dcec: DEVICE_ENVELOPE_IN {FEEDER:9,MAIN:20,TIE:20} + MAX_FILL_PCT 0.8 [SEED]; editor fit math aligned 54fb4dc). packing_settings standards table added (editable); engine still reads code constants (wire-in pending). Existing boards keep old sparse sections until re-propose.
- G25 Heading-style sweep: standard #F0F6FF/800 sentence case applied across touched panels; remaining stragglers as found.
- G26 CALCULATION VALIDATION DONE 2026-06-13 (96ecf4d): 105/105 reference cases pass, ZERO math bugs (GM=cost/(1−GM) correct, no copper double-count, NEC 240.6 ladder exact, TPS-first verified). Report: docs/calc-validation-report.md. Flagged: [SEED] values await TPS verification (G1/G6); legacy v1 load-calc ignores PF (confirm v1 dead).

PRODUCT/PLATFORM GAPS
- G18 Tenant separation block parked (TPS T&C hardcoded, letterhead, Epicor-only export, seed labels) — NEXT major block per Vikraman.
- G19 Roles/permissions: department RBAC foundation DONE (8 roles, requireResource on procurement routes); broaden guards to remaining routes pending.
- G20 No CI; deploys manual from Vikraman's machine; boot migrations the only safety net.
- G21 Provenance differentiation (TPS/firm vs web) DONE (4c2c506 + 5f916a2: source filter chips, dots beside category chip, Source dropdown in edit dialog).
- G22 Chrome-driven scrape pass for JS-walled prices/images NOT yet run — needs a dedicated session.
- G23 AGENT QUALITY INCIDENT: a Sonnet agent committed truncated files claiming tsc errors "pre-existing" (reverted via reset --hard, re-applied verified). Lesson: NEVER accept an agent commit with nonzero tsc; orchestrator re-verifies exit codes + file tails after every agent.

OPEN DECISIONS FOR VIKRAMAN: G27 merge-vs-split; LLM/API choice for Overwatch AI analytics; notification channel (in-app vs email/SMS); the 12 capacity-planner questions in docs/capacity-traveler-design.md; WO per-project vs per-board (Phase F conflict).
