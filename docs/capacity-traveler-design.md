# Capacity Planning + Work Order / Production Traveller — Design Document

**Project:** Switchgear Configurator / ERP (SWGPLAY)
**Client:** Tier Power Systems, LLC (TPS)
**Module:** Capacity Planner + Production Traveller execution layer (ERP Master Plan Module 7 + production handoff)
**Revision:** A — 2026-06-13 (DESIGN ONLY — plan-first, owner answers pending before build)
**Aligns with:** `docs/specs/PHASE_F_ERP_HANDOFF_SPEC.md` (F3 Production, §7 event catalog, §10 debt #3 "capacity planner automation")
**Status:** PROPOSAL. Schema skeleton shipped alongside is ADDITIVE and UNMOUNTED (zero runtime risk).

---

## 0. Scope, intent, and what already exists (read this first)

This document designs the layer that turns an **accepted order** into **scheduled, assignable, trackable shop-floor work** across departments, with capacity awareness and notifications. It is the concrete build-out of two things already committed on paper:

- **Phase F §4 (F3 Production)** — Work Orders per switchboard, Production Traveller stages, team assignment + check-in/out, labour actuals feeding Project Analysis.
- **Phase F §10 debt #3** — "Capacity planner automation (v1 = management task + manual plan)." This doc proposes how to graduate from a manual task to a deterministic planner.

### 0.1 What already exists in the codebase (the design EXTENDS, never duplicates)

| Existing artifact | What it is today | Our relationship to it |
|---|---|---|
| `models/WorkOrder.js` (`work_orders`) | **One row per project** (`project_id` UNIQUE). Holds `operations[]` (flat checklist auto-built from estimate items), `production_forms[]` (per-job traveller form blobs), `production_traveler_number`, `status` enum pending/in_progress/completed, `materials[]`, `external_processes[]`, `job_ids[]`. | **KEEP AS-IS.** It is the document/header record (the printable Work Order + Traveller). We do **not** alter it. Our new `work_tasks` reference it by a loose UUID (`work_order_id`, no hard FK) so the execution layer is additive and decoupled. |
| `services/workOrderService.js` | Generates WO + PT number, builds `operations` from estimate items, toggles operation completion, saves production forms. | Untouched. The planner will later *read* labour data; it does not rewrite this service in v1. |
| `routes/workOrderRoutes.js` mounted at `/work-orders` | CRUD + operation toggle + traveller forms. | Untouched. New endpoints live under `/capacity` (separate router). |
| `ConfiguratorLabourLine` (`configurator_labour_lines`) | Per-configuration labour hours by bucket: `cu, asm, cnt, qc, tst, eng, cad` + rate + total_cost. | **This is the planner's primary input.** Buckets map directly to departments (§2.3). |
| `ConfiguratorSwitchboard` (`configurator_switchboards`) | One physical board per configuration; `board_type`, `status`, `standards_regime`. | The **unit a Work Order is generated per** (Phase F §4.1: "one WO per switchboard"). `work_tasks.board_id` references it. |
| `ConfiguratorHandoffEvent` (`configurator_handoff_events`) | Outbox/idempotency ledger (Phase F §2.2). | The planner is **triggered by** `order.confirm` landing here; `capacity.check_required` event is emitted via this ledger. We consume, not replace. |
| `middleware/departments.js` | `can(role,resource)` + `requireResource('workorders')`. 8 department roles. Legacy roles unguarded. | **The authorization spine for everything here.** All capacity/task routes gate on `requireResource('workorders')`. |
| `ConfiguratorChangeOrder` (`configurator_change_orders`) | Phase F §5 change-order record. | Planner v1 reads CO status to flag re-plan need (P4); does not act in v1. |

### 0.2 The architectural seam (why a parallel task layer, not a WorkOrder rewrite)

The existing `WorkOrder.operations[]` is a **flat, project-level checklist** with no department, no sequence dependency, no assignee, no capacity link. Retrofitting capacity/dependency/department semantics into that JSONB blob would (a) risk the live work-order/traveller flow another agent may touch tonight and (b) couple scheduling to a document record. Instead we introduce **`work_tasks`** — the schedulable, department-owned, dependency-aware unit — and link it to the existing WorkOrder by loose reference. The printable Traveller stays the WorkOrder; the *executable* Traveller is the ordered set of `work_tasks` for a board.

```
SalesOrder ─┐
            ├─ (per switchboard) ─► WorkOrder (existing header/document, 1/project today)
            │                          │
            └─ order.confirm ─► PLANNER ┴─► work_tasks[]  (NEW: dept + seq + deps + assignee + estimate)
                                              │
                                              ├─ task_events[]  (check-in/out/quality audit trail)
                                              └─ app_notifications[]  (in-app bell)
```

---

## 1. Workflow map (end-to-end)

### 1.1 Trigger chain (from quote to shop floor)

```
Quotation ACCEPTED (Phase D)
  └─► order.confirm  (Phase F §2 — SalesOrder created, configuration locked, project stage flips)
        ├─ Phase E FULL drawing job enqueued
        ├─ mBOM → material demands (Phase F §3)
        └─ capacity.check_required  ◄── THIS MODULE STARTS HERE
              └─► PLANNER explodes each Switchboard's WorkOrder into work_tasks[]
                    (per department, in line sequence, with estimates + dependencies)
                    └─► tasks become 'ready' when predecessors are 'done'
                          └─► assignee gets task.assigned / task.ready notification
                                └─► worker checks in → works → uploads docs/checklist
                                      → QUALITY GATE (if gated step) → checks out
                                        → next task flips 'ready' → notify next assignee
```

### 1.2 Typical UL 891 line sequence (seed template — editable per board_type)

This is the default `work_tasks` template the planner instantiates per board. Department = the `departments.js` role that owns the step. **Bus fabrication and frame/sheet-metal fabrication run in PARALLEL and merge at assembly.**

| Seq | Step | Department role | Labour bucket | Quality gate? | Dependency (predecessor) |
|---|---|---|---|---|---|
| 0 | Engineering release / IFC confirm | (eng) — see Q11 | `eng`,`cad` | doc gate (IFC present) | order.confirm |
| 1a | Sheet-metal / frame fabrication | `manufacturing` (or `outsourcing` if external) | (frame portion of `asm`/CNC) | in-process dimensional | seq 0 |
| 1b | Bus fabrication (Cu cutting / bending / plating) | `manufacturing` | `cu` | in-process (plating QC) | seq 0 |
| 2 | Assembly (frame + bus + devices) | `assembly` | `asm` | — | **1a AND 1b done** (merge point) |
| 3 | Wiring / controls | `assembly` | `cnt` | — | seq 2 |
| 4 | Quality — in-process + final + hipot/test | `quality` | `qc`,`tst` | **FINAL GATE (pass required)** | seq 3 |
| 5 | Packing | `packing` | — | packing checklist | seq 4 PASS |
| 6 | Logistics / ship | `logistics` | — | shipping docs | seq 5 |
| 7 | Site commissioning | `commissioning` | — | commissioning checklist | seq 6 (on-site) |

### 1.3 Per-step lifecycle (state machine for one `work_task`)

```
pending ──(all predecessors done)──► ready ──(assignee check-in)──► checked_in
                                                                       │
                                  ┌──── work + doc/checklist upload ───┘
                                  ▼
                  (non-gated step) ─────────────────────────────────► done ──► flip successors to 'ready'
                  (gated step) ─► check-out submits for quality
                                    ├─ quality PASS ─────────────────► done ──► flip successors
                                    └─ quality FAIL ─► quality_hold ──► REWORK LOOP (§1.5)
```

`status` values (varchar, not DB enum, for additive safety): `pending | ready | checked_in | done | quality_hold`.

**Who can act, per transition:**

| Transition | Actor (role) | Guard |
|---|---|---|
| pending → ready | system (predecessor checkout) | automatic |
| ready → checked_in | task's `assignee_user_id` (department member) | `requireResource('workorders')` + assignee match |
| checked_in → done (non-gated) | assignee | self-checkout |
| checked_in → quality_hold/done (gated) | assignee submits; `quality` role adjudicates | quality role records pass/fail |
| any → reassign | `management`/admin | management authority (Phase F §8) |

**What blocks what:**
- Seq 2 (assembly) is **blocked** until both 1a and 1b are `done` (parallel merge).
- Seq 0 doc gate: WO `release` blocked until IFC drawings present (Phase F §4.4 / §6.3) — seed BLOCK.
- Seq 5 (packing) blocked until seq 4 quality = PASS.
- Material readiness gate (Phase F §3.3): planner may WARN/BLOCK board start below readiness threshold (seed BLOCK < 80%).

### 1.4 Exception path — outsourcing handoff

When step 1a (or any step) is outsourced:
1. Task `department = 'outsourcing'`, `meta.outsource_partner_id` set.
2. Outsourcing role raises a PO to the partner (links to existing procurement PO; v1 = manual link in `meta`).
3. Task sits in `checked_in` (sent) until **receive inspection**: a `quality`-owned mini-gate on receipt (dimensional/visual). Pass → `done`; fail → return-to-vendor loop (recorded in `task_events`).
4. Partner lead time feeds the planner's forward schedule (§2.4).

### 1.5 Exception path — rework loop (quality fail)

```
quality gate FAIL
  └─► task → quality_hold
        ├─ NCR raised (Phase F §4.5 — existing quality module + NCR loop)
        ├─ notification: quality.failed → management + QC + original assignee
        └─ management review → either:
             a) rework on SAME task: quality_hold → checked_in (re-do) → re-submit gate
             b) new corrective task inserted before the gate (seq fractional, e.g. 3.5)
```

Rework never silently passes; the gate must be re-adjudicated. All transitions logged in `task_events`.

### 1.6 Parallel branches & merge (explicit)

The planner builds a DAG, not a strict line. 1a ∥ 1b are independent successors of seq 0; assembly (seq 2) declares **both** as predecessors. The "ready" computation = *all* predecessors `done`. This generalizes to any board template with parallel fab.

---

## 2. Capacity model

### 2.1 Entities

| Entity (table) | Purpose | Key fields |
|---|---|---|
| `capacity_teams` | A department crew (e.g. "Bus Fab Team A"). | `name`, `department` (role key), `company_id`, `meta` |
| `capacity_workers` | A person who executes tasks. Linked to a `User` (nullable so a roster can be stubbed before logins exist). | `user_id?`, `team_id`, `display_name`, `department`, `skills[]` (JSONB), `hours_per_day`, `active`, `meta` (calendar/shift ref) |
| `capacity_machines` | A work-center / machine with finite capacity. | `name`, `type` (cnc_punch \| brake \| plating \| test_bay \| …), `department`, `capacity_unit` (hours \| batch), `capacity_per_day`, `meta` |
| `work_tasks` | The schedulable unit (§1). | `work_order_id?`, `board_id`, `department`, `seq`, `status`, `assignee_user_id?`, `machine_id?`, `est_hours`, `predecessors[]` (in `meta`), `started_at`, `finished_at`, `est_start`, `est_finish`, `meta` |
| `task_events` | Immutable audit trail. | `task_id`, `type` (checkin/checkout/quality_pass/quality_fail/reassign/…), `user_id`, `at`, `meta` |
| `app_notifications` | In-app bell. | `user_id`, `type`, `title`, `body`, `read_at?`, `entity` (JSONB: {task_id, board_id, …}) |

**Parked for P2+ (NOT in skeleton):** `CapacityCalendar` (company holidays + per-worker shift overrides), `OutsourcePartner` master (lead times) — v1 holds these inline in `meta` / `Setting` until Vikraman confirms format (Q2, Q4).

### 2.2 Planning algorithm v1 — deterministic, NO AI

**Goal:** for an order-confirmed project, produce per-task `assignee_user_id` + `est_start`/`est_finish` + bottleneck flags, by forward-scheduling against available capacity. Greedy, explainable, re-runnable.

```
INPUT:  project → its Switchboards → each board's WorkOrder + ConfiguratorLabourLine buckets
        capacity_workers (by department, hours_per_day, skills)
        capacity_machines (by type, capacity_per_day)
        targetDeliveryDate (Phase C intake)  [working backward sanity check only in v1]

STEP 1  EXPLODE: for each board, instantiate the seq template (§1.2) into work_tasks.
        est_hours per task = labour bucket → department mapping (§2.3),
        split across that board's section count where the bucket is per-section.

STEP 2  ORDER: topological sort of the DAG (respect predecessors; 1a∥1b parallel).

STEP 3  FORWARD-SCHEDULE (greedy earliest-available):
        for each task in topo order:
          earliest_start = max(finish of all predecessors, today)
          pick the earliest-available WORKER in task.department whose skills ⊇ task needs
          if task needs a MACHINE: also gate on earliest-available machine slot of that type
          est_start = max(worker_free, machine_free, earliest_start)
          est_finish = est_start + ceil(est_hours / worker.hours_per_day) working days
          reserve that worker+machine window
          assign assignee_user_id = chosen worker.user_id

STEP 4  FLAG BOTTLENECKS:
          - any task whose est_finish pushes board past targetDeliveryDate → flag 'late'
          - any department where total demanded hours > available capacity in window → 'over_capacity'
          - machine queue depth > threshold → 'machine_bottleneck'

OUTPUT: work_tasks with est_start/est_finish/assignee + a per-project bottleneck report.
        Idempotent: re-running replaces unstarted-task estimates only; never touches
        checked_in/done tasks (preserves actuals).
```

### 2.3 Labour bucket → department mapping (the planner's estimate source)

| `ConfiguratorLabourLine.category` | Feeds task(s) | Department |
|---|---|---|
| `cu` | Bus fabrication (seq 1b) | manufacturing |
| `asm` | Frame fab (seq 1a) + Assembly (seq 2) | manufacturing / assembly |
| `cnt` | Wiring / controls (seq 3) | assembly |
| `qc` | Quality in-process + final (seq 4) | quality |
| `tst` | Hipot / functional test (seq 4) | quality |
| `eng` | Engineering release (seq 0) | engineering (Q11) |
| `cad` | Drawing/CAD pre-step (seq 0) | engineering (Q11) |

### 2.4 Inputs REQUIRED before the planner can run (honest dependency list)

The planner is **inert until the owner supplies real capacity data.** It cannot invent a roster. Specifically it needs:
1. **Worker roster** per department, with `hours_per_day` and skills. *(Q1)* — without this, no assignee can be chosen.
2. **Shift pattern / working days / holidays.** *(Q2)* — without this, "working days" math defaults to 8h/day, Mon–Fri, no holidays (documented assumption, not truth).
3. **Machine list + per-day capacity.** *(Q3)* — without this, machine gating is skipped (treated as infinite).
4. **Outsource partner lead times.** *(Q4)* — without this, outsourced steps use a seed lead time (4 wks, matching Phase F §3.1 seed) flagged as assumption.
5. **Board seq template confirmation** per board_type. *(Q6/Q7)* — the §1.2 table is a seed.

Until 1–4 are real, the planner runs in **"estimate-only / unassigned"** mode: it produces est_hours and ordering but leaves `assignee_user_id` null and emits a "capacity data incomplete" flag. This is exactly Phase F §10 debt #3's "v1 = management task + manual plan" — the manual plan is the human filling assignees the planner left blank.

---

## 3. Notification design

### 3.1 Table
`app_notifications`: `user_id`, `type`, `title`, `body`, `read_at` (null = unread), `entity` (JSONB linking task/board/project). In-app bell reads unread count per user.

### 3.2 Event catalog (subset of Phase F §7, the production slice)

| Event | Fired when | Recipients |
|---|---|---|
| `task.assigned` | planner/manager sets `assignee_user_id` | assignee |
| `task.ready` | all predecessors `done` → task flips `ready` | assignee (or department pool if unassigned) |
| `quality.failed` | gated task fails QC | management, QC, original assignee (maps Phase F `quality.ncr_raised`) |
| `task.overdue` | now > `est_finish` and status ≠ done | assignee + management (Phase F escalation) |
| `wo.assigned` / `task.checkin` / `task.checkout` / `stage.signed` | per Phase F §7 role matrix | per matrix |

### 3.3 Delivery
- **v1 = in-app bell only** (per-user unread badge + list). Simple, no external dependency.
- **Email / SMS = PARKED decision** (Q8). The `app_notifications` row is channel-agnostic; a future dispatcher can fan out to email/SMS without schema change.

---

## 4. UI surfaces

1. **Capacity Planning tab (admin/management).**
   - CRUD: Teams, Workers (link to User, set skills + hours/day), Machines, Calendar (P2).
   - Plan view: per-project Gantt-ish lane chart (tasks as bars on a department/worker timeline, bottleneck flags highlighted). "Re-plan" button re-runs the planner (P2/P4).
2. **My Work queue (per department user).**
   - Lists tasks where `assignee_user_id = me` (or my department pool), grouped by status.
   - Buttons: **Check-in**, **Upload docs / checklist**, **Check-out** (gated steps → "Submit for QC"). Big touch targets (shop-floor / tablet).
3. **Traveller view (per board).**
   - The ordered step list (seq template) with live status badges, parallel branches shown side-by-side, quality gate markers, rework history from `task_events`. This is the *executable* twin of the printed WorkOrder traveller.
4. **Owner Overwatch hooks.**
   - Assembly/production status (e.g. % tasks done per board, bottleneck flags, overdue count) feeds the **existing Overwatch dashboard** (do NOT modify `overwatchRoutes.js` tonight — expose a read endpoint the dashboard can poll later, P4).

---

## 5. QUESTIONS FOR VIKRAMAN (numbered — answers gate the build)

1. **Team roster & sizes:** how many workers per department (manufacturing, assembly, quality, packing, logistics, commissioning), and do you want named people now or just headcounts/teams to start?
2. **Shift pattern:** standard work hours/day, working days/week, and the holiday calendar? Single shift or multi-shift? Per-worker overtime allowed in the plan?
3. **Machines / work-centers:** list them — CNC punch, press brake, shear, plating line, test/hipot bay. For each: in-house or outsourced, and a rough capacity (hours/day, or batch size + cycle time for plating)?
4. **Outsourcing partners:** who, for what process (sheet-metal? plating?), and typical lead times? Do they get a PO from us each time?
5. **Does sheet-metal fabrication happen in-house at TPS, or is it always outsourced?** (Determines whether seq 1a is `manufacturing` or `outsourcing` by default.)
6. **Checklist formats per department:** do you have existing paper forms / traveller sheets to digitize? Please share samples — I'll model the checklist fields from them rather than invent them.
7. **Quality gate definitions:** what exactly must PASS at each gate (in-process dimensional, plating QC, final QC, hipot/dielectric values, GFP test when R6 active)? Any sign-off authority rules?
8. **Notification channel preference:** in-app bell only for v1, or do you also want email (and/or SMS) from day one?
9. **Barcode / QR check-in:** do you want workers to scan a board/task QR to check in/out? On phones, or dedicated scanners on the floor?
10. **SLA targets per stage:** any target durations per stage (for overdue/escalation flags), or should the planner derive them purely from labour-bucket hours?
11. **Engineering as a "department":** seq 0 (engineering release / CAD) — who owns it? `departments.js` has no `engineering` role yet. Add one, or treat eng/cad pre-steps as management/PM-owned?
12. **One WO per board confirmation:** Phase F says one WorkOrder per switchboard, but the current `work_orders` table is one-per-project (`project_id` UNIQUE). Do you want me to migrate WO to per-board (bigger change), or keep the per-project WorkOrder document and let the per-board `work_tasks` carry the board-level execution? (Design currently assumes the latter — safest.)

---

## 6. Build phases (honest effort sizing)

| Phase | Scope | Effort (eng-days, rough) |
|---|---|---|
| **P1 — Foundation** | Migration + models (this skeleton, made live); Teams/Workers/Machines CRUD; **manual** task creation + assignment; check-in/out; in-app notifications; My Work queue + Traveller view UI. | 5–8 d |
| **P2 — Auto-planner** | Deterministic forward-scheduler (§2.2); labour-bucket explosion; capacity calendar; Gantt plan view + re-plan. | 5–7 d (depends on Q1–Q4 data being real) |
| **P3 — Quality gates + checklists** | Gated step adjudication; per-department digitized checklists (from Q6 samples); outsourcing receive-inspection; rework loop wired to NCR. | 4–6 d |
| **P4 — Overwatch + replanning** | Overwatch read hooks; change-order-triggered re-plan flagging; escalation rules (overdue/stale). | 3–5 d |

Sequencing rationale: P1 delivers usable shop-floor tracking with humans assigning work (= Phase F §10 debt #3's "manual plan") before the planner exists. P2 only pays off once real capacity data lands.

---

## 7. Skeleton shipped with this doc (status: SAFE / INERT)

- **Migration** `backend/src/migrations-configurator/20260613000002-capacity-skeleton.js` — IF-NOT-EXISTS tables: `capacity_teams`, `capacity_workers`, `capacity_machines`, `work_tasks`, `task_events`, `app_notifications`. No-op `down()`. Additive, non-fatal style matching neighbors.
- **Models** `backend/src/models/configurator/CapacityTeam.js`, `CapacityWorker.js`, `CapacityMachine.js`, `WorkTask.js`, `TaskEvent.js`, `AppNotification.js` — auto-discovered by `models/configurator/index.js` (folder scan). **Inert without routes.**
- **Routes** `backend/src/routes/capacityRoutes.js` — CRUD skeleton (teams/workers/machines GET+POST, tasks GET) behind `authenticate` + `tenantScope` + `requireResource('workorders')`. **NOT mounted.**

### 7.1 How to mount (ONE line, AFTER owner answers — do not do tonight)

In `backend/src/routes/index.js`, alongside the other `require`/`router.use` pairs:

```js
// const capacityRoutes = require('./capacityRoutes');
// router.use('/capacity', capacityRoutes);
```

Until those two lines are uncommented, the entire module is unreachable at runtime — the migration is additive-only and the models are passive table definitions. Zero risk to live flows.
