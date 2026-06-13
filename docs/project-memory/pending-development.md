PENDING DEVELOPMENT — live build queue, done-log, parked items, standing rules.
(Recite when Vikraman asks "what's pending". Full commit trail = git log.)

== STANDING RULES ==
- TENANT SEPARATION / multi-vendor genericization = the NEXT major block after current release work — parked until Vikraman calls it. (TPS T&C hardcoded, letterhead, Epicor-only export, seed labels → company settings.)
- SolidWorks drawing automation stays PARKED.
- Every new build must be future-expansion-ready: no new hardcoded TPS values, vendor-specifics in standards/settings tables, universal engine math, pluggable export interfaces.
- TPS-FIRST part selection POLICY: provenance rank vendor-import > rfq > manual > web in lineup pickCheapest, rules matcher, picker sorts.
- Flow = 10 chips (System Design → Section Design → Section Review → Components → Component Review → SLD → Elevation → BOM → Quote → Drawings); no nested tabs — new features get a flow chip or a flat page.
- Heading standard: #F0F6FF, fontWeight 800, sentence case.

== SHIPPED (high level; see git log for commits) ==
- V2 spine, persistence, BOM, Quote (revision chain), Drawings queue, Price Queue, Standards editor, ERP order handoff.
- Catalog: 308 CB seed; legacy catalog RECOVERED from old Lovable app (267 parts/21 cats → legacyComponentsSeed.json, now permanent boot-seed migration); TPS workbook importer; MasterPricing ~1,250 parts; CB decoder import.
- Catalog UI: card v3, Schneider Part Number Decoder dialog (auto-fills CB details from positions, Save Catalog/Add to Config), CB filters 6x2 + generic CategoryFilterPanel, sentence-case display, compact SKUs, provenance dots + Source filter/dropdown, Excel download/upload round-trip, vendor field.
- Web-scrape ENRICHMENT: docs/catalog-scrape/PLAN.md + schema; enrichMerge.js + /catalog/enrich-bundled + "Sync scraped catalog" button; 18 seed files, 310 rows, 159 priced (262 offers), 20 imaged.
- Section Editor (chip 2): frame selector + fit-check, move/add/remove devices, add/reorder/delete sections, swap on chips, suitability-filtered picker (kA/height/voltage) w/ embedded CB filters, utilization hover. 4-up card grid + sticky design summary.
- SLD rebuilt to submittal grade (ANSI/IEEE symbols, drawout chevrons, AF/AT, ground/neutral, title block, print-white, A4-fit toggle + scroll, Download SVG).
- RFQ → procurement loop (vendor-grouped queue, RFQ-YYYYMMDD-NNN batches, xlsx + email draft, status open/partial/complete).
- Proposal §6 elevation (pdfkit twin); labour-hours template + labour-update import mode.
- Intake Provisions + rules CR-18..24 (SPD/metering CT-PT-CPT/camlock/ATS, default off).
- Change-order approval (pending_approval → approve&apply / reject).
- PER-COMPONENT + PER-LINE LABOUR & MARGIN: specifications.marginPct + meta.marginPctOverride/labourAdj; lineMarginEngine.js pools global GM for untouched lines; draft-only editing in QuotePanel. Validation harness 80/80.
- Department RBAC (8 roles + requireResource on procurement routes), permissions.ts + useCanAccess, grouped role select in Users.
- Owner OVERWATCH dashboard v1 (/overwatch summary + page; pipeline/quotes/procurement/approvals/risks/activity; 6 risk rules; 60s refresh). LLM analytics layer PARKED (needs API-key/cost decision).
- Calculation validation campaign (G26): 105/105 reference cases pass, zero math bugs.
- Packing density fix (envelopes + 80% fill), structural-BOM card on Components summary (G27a).

== AWAITING VIKRAMAN (blocks builds) ==
- CAPACITY PLANNING + WORK ORDER / TRAVELER system: full design in docs/capacity-traveler-design.md with 12 QUESTIONS (team roster/shifts/machines/outsourcing/checklists/quality-gates/notification channel/barcode/SLA + WO per-project-vs-per-board Phase F conflict). INERT skeleton in place (migration 0002 six tables + models + capacityRoutes.js NOT mounted). His answers unlock Phase 1.
- G27 final architecture choice: keep accessories/structural split (current) vs merge two BOM engines.
- LLM/API choice for Overwatch AI analytics; notification channel (in-app vs email/SMS).

== PARKED ==
SolidWorks drawing automation; tenant separation (next block); docking-station board type; universal part-number generator engine (Siemens 3VA/Eaton/ABB data packs — FABLE task); Chrome-driven scrape pass for JS-walled prices/images (G22); CI.

== TPS-DEPENDENT DATA (yours to load) ==
Deploy both services + run boot migrations; Import TPS workbook (Engg Standards tab); Sync scraped catalog; verify frame library dims (G1); confirm TST rate $85 vs $40 (G6); set letterhead/logo + client records (G7); UAT end-to-end.
