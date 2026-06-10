# PHASE F — ERP Handoff Integration Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Client:** Tier Power Systems, LLC (TPS)
**Phase:** F of F (ERP Handoff)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** Phases A–E; existing ERP modules (procurement, work orders, quality, logistics, invoice); ERP Master Plan (21 modules, agreed earlier)
**Blocks:** nothing — final phase of the planning set

---

## 0. Critical Implementation Rules (STRICT)

1. This phase defines INTEGRATION CONTRACTS only. Existing ERP modules (procurement, WO, quality, logistics, invoice) are consumed via their existing models/services — not redesigned. Where the ERP Master Plan defines a workflow (traveller stages, NCR loop, check-in/out), this spec wires the configurator to it.
2. Every cross-boundary action is event-driven and idempotent: replaying an event must not duplicate sales orders, demands, or work orders (idempotency keys throughout).
3. The three part masters (`ConfiguratorComponent`, `Material`, `Part`) are NOT unified in this phase. They are linked via an explicit mapping table (§3.2). Unification is registered post-v1 technical debt.
4. Nothing in this phase modifies quotation, pricing, BOM, or design engines.
5. Feature flag: `CONFIGURATOR_V2_ERP_HANDOFF`.

## 1. Handoff Map (the boundary)

```
Quotation ACCEPTED (Phase D)
  → F1 Order Confirmation: SalesOrder created, configuration locked, project status flip
      → Phase E FULL job auto-enqueued (drawings for engineering release)
      → Capacity check task (master plan Module 7) + management notification
      → F2 Procurement: mBOM → material demands → stock check → shortage → PR/RFQ/PO
      → F3 Production: Work Orders per switchboard (sections as WO tasks),
           Production Traveller stages, team assignment + notifications, check-in/out
      → F5 Documents: GA → IFA → customer approval → IFC → release to production
  Change after acceptance → F4 Change Order (controlled unlock → new revision → delta re-release)
  Build complete → quality (NCR loop per master plan) → logistics → invoice (existing modules)
```

## 2. F1 — Order Confirmation

### 2.1 Trigger & transaction

`quotation.status → accepted` fires `order.confirm` (idempotency key = quotation revision id):

1. Create `SalesOrder` (existing model) — links: project, configuration, quotation revision, totals from frozen quote snapshot.
2. Configuration `status=locked` (Phase A) — design freeze.
3. Project stage → `Order Confirmed` (existing project workflow).
4. Enqueue Phase E `FULL` job per switchboard.
5. Create capacity-check task for management (master plan Module 7: capacity planner with management replanning authority) with `targetDeliveryDate` from intake (Phase C).
6. Notifications: management + assigned PM/engineer (event catalog §7).

### 2.2 Failure semantics

Steps are an outbox-pattern sequence: each step recorded in `erp_handoff_events` (id, event_type, idempotency_key, status, payload, error); failed steps retryable individually; the accept action itself never rolls back a recorded acceptance.

## 3. F2 — Procurement Handoff

### 3.1 Demand generation

On order confirmation: mBOM rows (Phase D) → `material demand` records per part number: qty, where-used (switchboard/section), required-by date (from capacity plan when available, else targetDeliveryDate − lead-time offset [SEED 4 wks]).

Flow (existing procurement module): demand → stock check (`Stock`/`MaterialStock`) → available: allocate to project; shortage: Purchase Requisition → RFQ/PO (existing `ProcurementRFQ/PO`, vendor mapping) → GRN receipt → allocation. The configurator side only PRODUCES demands and CONSUMES allocation status.

### 3.2 Part master mapping (the named risk)

`configurator_component_material_map`: `component_id` ↔ `material_id` (+ `part_id` nullable), `mapped_by`, `confidence` (`exact | manual | unmapped`).

- Importer seeds exact matches on part_number.
- Unmapped mBOM rows land in a **Mapping Queue** UI (purchasing resolves once per part; mapping persists company-wide).
- A demand cannot release to PR while unmapped (BLOCK with visible queue link).
- **Post-v1 debt register:** unify part masters into one; this table is the migration source.

### 3.3 Status back-flow

Material readiness % per switchboard (allocated qty / demanded qty) surfaces on the project dashboard and gates WO start (WARN below 100%, configurable BLOCK threshold [SEED: BLOCK below 80%] — master plan's "no WO without material" principle).

## 4. F3 — Production Handoff

1. **Work Orders**: one WO per switchboard (existing `WorkOrder` model); tasks = sections + board-level assembly stages; auto-filled from eBOM + frozen quote labour hours (the master plan's "document auto-filled, generated in few clicks").
2. **Production Traveller**: stage sequence from master plan (no stage skipping), seeded per board type [SEED stage template: fabrication → bus install → device mount → wiring → QC → FAT → packing]; stage sign-off required; templates editable in Engineering Standards.
3. **Team assignment + notifications + check-in/out**: existing master-plan flow; labour actuals captured at check-out accumulate against the WO and feed Project Analysis (plan vs actual hours by bucket — the 7 labour buckets carry through).
4. **Drawings**: WO blocked from `release` until IFC drawings present (§6) — configurable per company [SEED: BLOCK].
5. **Quality**: existing quality module + NCR loop per the approved FigJam flow (fail → NCR → management review → new WO/traveller → re-inspection). Quality docs auto-filled from configuration data (test values per section: ratings, SCCR, voltage system, GFP test when R6 active).

## 5. F4 — Change Orders (lightweight v1, pulled forward as agreed)

1. Entry: management-role unlock of a locked configuration (reason required) OR explicit "Create Change Order" on the sales order.
2. `change_orders`: id, sales_order_id, reason, originator (customer | internal), status (`draft | impact_review | customer_approval | approved | rejected | applied`).
3. Impact: editing the unlocked configuration produces a new quotation revision (Phase D); CO record links old → new revision; **diff view = the impact statement** (cost delta, copper delta, line changes) + manual schedule-impact field.
4. Customer-originated COs require recorded approval (uploaded confirmation or portal-later) before `applied`.
5. Apply: new revision becomes commercial baseline; deltas re-release: procurement demand diff (new demands / cancel-requests on not-yet-ordered items; already-ordered flagged for purchasing review), WO task diff flagged to production planner. Nothing auto-cancels a placed PO — humans confirm.

## 6. F5 — Document Flow (IFA → IFC)

1. GA drawing (Phase E artifact) → status chain on Document rows: `generated → issued_for_approval (IFA) → customer_commented | customer_approved → issued_for_construction (IFC)`.
2. IFA package = submittal merge (Phase D §8) issued to customer; comments captured as document annotations/uploads; revision loop re-enqueues DRAWINGS job after configuration/drawing fixes.
3. IFC flips the WO release gate (§4.4).
4. Commissioning/handover package = final merge: as-built docs, quality records, test reports, O&M uploads — master plan's Final Document Merge consuming Phase D/E artifacts.

## 7. Notification Event Catalog (consumed by existing notification engine)

| Event | Recipients |
|---|---|
| order.confirmed | management, PM, sales |
| capacity.check_required | management |
| procurement.demand_created / .shortage / .allocated | purchasing; PM on full allocation |
| mapping.queue_item | purchasing |
| price.rfq_received (Phase A loop) | estimator |
| sw.job_failed / sw.copper_review (Phase D/E) | engineer; management on review |
| drawing.ifa_issued / .customer_approved / .ifc_released | PM, engineering, production |
| wo.assigned / task.checkin / task.checkout / stage.signed | per master-plan role matrix |
| quality.ncr_raised / .management_review | management, QC |
| co.created / .approved / .applied | management, PM, purchasing |

Escalation rules (overdue tasks, stale IFA, unreleased WOs) per master plan's Notifications & Escalation module — this catalog is its input registry.

## 8. Roles (delta only — master plan §21 matrix governs)

- Estimator/Sales: configure, quote, issue (gates), cannot unlock accepted configs.
- Engineering: drawings, SW jobs, IFA/IFC actions.
- Purchasing: mapping queue, demands, PR/PO (existing).
- Production: WO execution, check-in/out, stage sign-off (existing).
- Management: capacity replanning, CO approval, locked-config unlock, copper-review approval, waivers — consistent with the previously agreed management authority set.

## 9. Acceptance Criteria

1. Accept a quotation → SalesOrder + locked config + FULL SW job + capacity task + demands generated — replaying the accept event creates NOTHING twice (idempotency proven).
2. mBOM with one unmapped part → demand held, Mapping Queue shows it; mapping once releases it and persists for the next project.
3. Material readiness % visible per switchboard; WO release respects readiness + IFC gates per settings.
4. WO + traveller auto-generated with section tasks and labour hours from the frozen quote; check-in/out actuals accumulate; plan-vs-actual report by labour bucket.
5. Quality doc pre-filled with configuration test values; NCR fail path routes through management reassignment per the approved flow.
6. CO end-to-end: unlock → edit → new revision → diff-as-impact → approve → demand/WO deltas flagged; placed POs never auto-cancelled.
7. IFA/IFC chain: GA → IFA submittal → approval → IFC → WO gate flips; comment loop re-runs DRAWINGS job.
8. All §7 events observable in the notification center with correct recipients.
9. Existing ERP module behavior unchanged for non-configurator projects (regression suite).

## 10. Post-v1 Debt Register (explicit, owned)

1. Part-master unification (ConfiguratorComponent / Material / Part) — migration source: mapping table.
2. Customer portal for IFA approval + CO origination.
3. Capacity planner automation (v1 = management task + manual plan).
4. Cable sizing → lug/wire-bending refinement (Phase D note).
5. ABB/Eaton/Siemens part-number builders (Phase A roadmap).
6. IEC rule-pack activation for non-US markets.
