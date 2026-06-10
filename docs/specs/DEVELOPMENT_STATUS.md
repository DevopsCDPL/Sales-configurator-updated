# V2 Spine — Development Status (overnight session, 2026-06-11)

Honest ledger: what is BUILT AND TESTED, what is BUILT (untested against live stack), and what REMAINS. Everything new is inert behind feature flags — the live client app is untouched until flags are enabled.

## Feature flags (all default OFF)

| Flag | Gates |
|---|---|
| `CONFIGURATOR_V2_SPINE` | /api/configurator-v2 routes (switchboards, lines, standards, RFQs, SW queue, handoff) |
| `CONFIGURATOR_V2_RULES` | (frontend wiring pending) engines v2 selection |
| `CONFIGURATOR_V2_BOM` | bomEngineV2 selection (adapter wiring pending) |

## ✅ Built AND machine-verified (tests ran green this session)

**Pure engines** — `frontend/src/configurator/lib/` + tests in `frontend/src/configurator/__tests__/` (run with `npx tsx`):
- `us-standards.ts` — voltage systems, SCCR/bus/NEC-240.6 ladders, bus schedule, support spacing, frame library, motor FLA, density rule. All [SEED], injected not hardcoded.
- `load-calculation-v2.ts` — NEC split rule (125% continuous), kW/kVA/A/HP, motor FLA ×1.25, 80%/100%-rated admission. **Verified against hand calcs to 0.1 A.**
- `safety-rules.ts` — R1–R11 incl. NEC 240.87 (≥1200A → ERMS/ZSI) and NEC 230.95 (GFP) violations + auto-items + enclosure filters.
- `lineup-proposal.ts` — greedy proposal: feeders→devices (cheapest FIRM), mains/tie per source scheme, bus laddering, frame bin-packing, deterministic (snapshot-tested).
- `sld-generator.ts` — SVG one-line from topology (segments, mains, tie, feeders, labels).
- `copper-estimator.ts` — parametric weight (main/neutral/ground/risers/stubs), fab factor + contingency, glastic support counts, reconciliation verdict. **Verified against hand geometry calcs.**
- `state/stateV2.ts` — switchboards[]/sections[]/componentLines[] state, **v1→v2 migration tested** (params, sections, breakers, stepLines→flagged board lines), reducer incl. MAX_SECTIONS cap and orphan-on-section-remove (bug found & fixed by test).

**Backend** — syntax-checked + logic-tested where pure:
- `services/configurator/bomEngineV2.js` — eBOM/mBOM + 7 generators (bus bars, glastic, joints, labels, fillers, lugs, copper-est row). **Assertions ran green** (quantities hand-checked).
- `services/configurator/completenessEngine.js` — rule evaluation incl. per-section enclosure, MAIN device, labour>0, waivers.
- `services/configurator/swJobsService.js` — enqueue w/ payload-hash idempotency, SKIP-LOCKED leasing, lease-expiry reclaim, heartbeat+cancel, typed-error retry w/ backoff, copper reconciliation creation.
- `services/configurator/solidworksPayloadBuilder.js` — payload v1.0 from DB lines/sections only, price-leak guard, structural validation.
- `services/configurator/handoffService.js` — outbox `order.confirm`: sales order, lock, FULL SW jobs, mBOM→demands with mapping-queue gate. Idempotent per step.
- 11 new models (`ConfiguratorSwitchboard`, `ComponentLine`, `PriceRfq`, `CompletenessRule`, `EngineeringStandard`, `CopperReconciliation`, `SolidworksJob/Agent`, `HandoffEvent`, `ComponentMaterialMap`, `ChangeOrder`) — auto-registered by the model loader.
- Migration `20260611000001-create-configurator-v2-spine.js` — all tables IF-NOT-EXISTS + column extensions (components price_status/regime/dims; quotations revision chain; sections switchboard_id/envelopes) + completeness & engineering-standards seeds (`seeds/engineeringStandardsSeed.js`).
- Routes `configuratorV2Routes.js` mounted at `/api/configurator-v2` (flag-gated), incl. agent API (next/heartbeat/complete/fail).
- `agent/tps-sw-agent.js` — pull-based Windows agent: long-poll loop, lease, heartbeat w/ cooperative cancel, watchdog (SW_HUNG), typed error mapping, **simulation mode** when `SWG_RUN_CMD` unset so the whole pipeline is testable without SolidWorks.

**UI (new, dark palette #0D0D14/#13131E/#1E2235/#1976D2, parse-verified):**
- `steps/SwitchboardCardsScreen.tsx` — card grid, "+" card → New/Load (clone picker), rename/duplicate/delete, locked badge, drawings status chip, voltage/bus/SCCR metrics.
- `steps/IntakeStep.tsx` — Stage-1 intake + feeder schedule grid with **paste-from-Excel TSV parsing**, SCCR-unknown warning, and the proposal **diff-preview dialog** (Accept & apply / Edit intake; per-device price-status chips).

## ⚠️ Built but NOT yet exercised against the live stack
- Migration has not been run against a real Postgres (sandbox has no DB). Run: `npm run db:migrate:configurator`.
- V2 routes not smoke-tested over HTTP (flag was off by design). Enable `CONFIGURATOR_V2_SPINE=true` on a staging deploy first.
- Agent ↔ backend loop tested only at module level; run end-to-end with simulation mode against staging.

## ❌ Remaining (known, deliberate — in priority order)
1. **Wiring**: ConfiguratorProvider/StepRouter still drive v1 state. Mount SwitchboardCardsScreen + IntakeStep into the step flow behind `CONFIGURATOR_V2_SPINE`; adapter from stateV2 → pricing engine input (parity gate test, Phase A §9.3 — release blocker).
2. **Auto-rules registry (AP-01..27)** as data-driven field-intelligence extension — engines exist, registry file + UI lock/override affordances pending.
3. CB catalog importer (TS files → DB) + dimension parser + 80-CB XLSX import endpoint; CB selection UI switch to API.
4. Stage header/progress chips, Labour Review panel, Awaiting-Price queue UI, Completeness panel, SW Jobs screen, SLD tab render (generator done, tab wiring pending).
5. Quotation revision UI + diff view (model columns exist), copper escalation clause on PDF.
6. Change-order flow UI; notification-event wiring to existing notification engine.
7. Multipart artifact upload for agent (manifest-only today).
8. Migration parity test harness over real client configurations (the §9.3 gate).

## How to run what exists
```bash
# engine tests (no build needed)
cd frontend && npx tsx src/configurator/__tests__/engines-v2.test.ts
npx tsx src/configurator/__tests__/stateV2.test.ts
# backend syntax + bom assertions
node --check backend/src/services/configurator/bomEngineV2.js
# agent in simulation mode against staging
SWG_BACKEND_URL=... SWG_AGENT_TOKEN=... SWG_AGENT_ID=... node agent/tps-sw-agent.js
```
