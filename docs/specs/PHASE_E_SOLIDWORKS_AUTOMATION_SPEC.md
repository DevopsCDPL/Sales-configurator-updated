# PHASE E — SolidWorks Automation Specification

**Project:** Switchgear Configurator (SWGPLAY) — Design Engine Re-architecture
**Client:** Tier Power Systems, LLC (TPS)
**Phase:** E of F (SolidWorks Automation)
**Revision:** A — 2026-06-11
**Status:** LOCKED — approved for implementation
**Depends on:** Phase A (spine), Phase B (frames/layout), Phase C (SLD topology), Phase D (eBOM, reconciliation)
**Blocks:** Phase F (drawings feed IFA/submittal workflow; production release)

---

## 0. Critical Implementation Rules (STRICT)

1. The existing `drawingGenerationService.js` ngrok proxy is RETIRED. No component of the new path may depend on a tunnel or inbound connection to the SolidWorks machine.
2. The design payload is built ONLY from compiled eBOM (bomEngineV2) + layout engine outputs + SLD topology. Never from raw UI state. One builder function: `buildSolidworksPayload(switchboardId)`.
3. Payload schema is versioned (`payloadVersion`). Agents declare supported versions; the dispatcher never leases a job to an agent that doesn't support its version.
4. Exact copper return feeds Phase D reconciliation unchanged — this phase does not touch quote logic.
5. The agent wraps TPS's EXISTING SolidWorks automation (models/macros). This phase defines the contract and transport, not CAD internals.
6. Feature flag: `CONFIGURATOR_V2_SOLIDWORKS`.

## 1. Locked Decisions

| # | Decision | Resolution |
|---|---|---|
| E1-1 | Transport | Pull-based Windows agent: polls backend over HTTPS with API token. No ngrok, no inbound firewall rules. Multiple agents = horizontal scale. |
| E1-2 | Queue | Postgres-backed (`configurator_solidworks_jobs`). No Redis/new infra. Lease + heartbeat model. |
| E1-3 | Retries | max_attempts = 3, exponential backoff (1/5/15 min); typed error codes; terminal failure notifies the requesting engineer + management. |
| E2-1 | Payload source | eBOM + layout outputs + SLD topology only, via single builder; versioned schema. |
| E3-1 | Artifacts | GA drawing (PDF), manufacturing drawings (PDF + DXF), 3D export (STEP) + native refs, `exact_copper_lbs` (+ per-section breakdown), structured warnings. |
| E3-2 | Storage | Existing R2/Documents pipeline; Document rows linked to switchboard + quotation revision. |

## 2. Job Queue

### 2.1 `configurator_solidworks_jobs`

- `id` UUID PK; `switchboard_id` FK; `configuration_id` FK; `quotation_revision_id` FK nullable
- `job_type` enum `FULL` (model + drawings + copper) | `DRAWINGS` | `COPPER_ONLY`
- `payload` JSONB (frozen at enqueue); `payload_version`; `payload_hash` (idempotency — duplicate enqueue of identical hash returns existing active job)
- `status` enum `queued | leased | running | succeeded | failed | cancelled`
- `priority` int (default 5; quotes awaiting drawings > batch regeneration)
- `attempts`, `max_attempts` (3), `last_error_code`, `last_error_message`
- `leased_by_agent_id`, `lease_expires_at` (heartbeat-extended; expired lease → job reclaimed to `queued`, attempt++)
- `progress` JSONB `{step, pct, message}`; `timeout_min` (default 45 [SEED])
- `requested_by`, timestamps, `completed_at`

### 2.2 Lifecycle

```
enqueue (UI action or auto-trigger) → queued
agent poll → lease (atomic UPDATE … WHERE status='queued' ORDER BY priority, created_at FOR UPDATE SKIP LOCKED)
running: heartbeat every 60 s extends lease; progress updates surface in UI
succeeded: artifacts registered → post-processing (§5)
failed (attempt < max): backoff → queued
failed (terminal) / timeout: notification → engineer + management; job inspectable with full error log
cancel: allowed in queued/leased; running cancellation = cooperative flag the agent checks between steps
```

### 2.3 Auto-triggers

- Quotation revision ISSUED → enqueue `COPPER_ONLY` (priority high) — true-up early, before engineering release.
- Order confirmed (Phase F) → enqueue `FULL` for engineering release package.
- Manual: "Generate drawings" button per switchboard (role-gated).

## 3. Windows Agent (`tps-sw-agent`)

- Windows service (Node or .NET — implementer's choice; .NET preferred for SW COM interop) installed on each SolidWorks workstation/VM with a license.
- Config: backend URL, API token (existing `ApiToken` model, scoped `solidworks-agent`), supported `payload_version`s, supported `job_type`s, max concurrent jobs (default 1 — SolidWorks is effectively single-instance per session).
- Loop: poll `/api/sw-jobs/next` (long-poll 25 s) → lease → download payload → run TPS automation (template assemblies + macros) → upload artifacts (multipart to `/api/sw-jobs/:id/artifacts`) → report result.
- Watchdog: kills hung SolidWorks process at `timeout_min`; reports `error_code=SW_HUNG`.
- Typed error codes: `SW_HUNG | SW_CRASH | LICENSE_UNAVAILABLE | TEMPLATE_MISSING | PAYLOAD_UNSUPPORTED | GEOMETRY_FAIL | UPLOAD_FAIL` — drives retry policy (e.g., `LICENSE_UNAVAILABLE` retries; `PAYLOAD_UNSUPPORTED` fails terminal, no retry).
- Agent registry: `configurator_solidworks_agents` — id, name, token ref, last_seen, capabilities, active jobs. UI shows agent health.

## 4. Design Payload Contract (v1)

```jsonc
{
  "payloadVersion": "1.0",
  "meta": { "project", "configurationCode", "switchboardId", "quotationRevision",
            "requestedArtifacts": ["GA","MFG","STEP","COPPER"], "units": "in/lbs" },
  "board": { "boardType", "standardsRegime": "UL", "voltageSystem", "mainBusRating_A",
             "sccr_kA", "nemaType", "serviceEntrance", "neutralPct", "accessType" },
  "bus":   { "scheduleRow": { "barsPerPhase", "barThickness_in", "barWidth_in",
             "plating", "material" }, "mainRun_in", "groundBar", "neutralBars",
             "supportSpacing_in", "risers": [ { "sectionIndex", "bars", "barSize",
             "zoneHeight_in" } ] },
  "sections": [ {
      "sectionIndex", "role", "frameCode",
      "frame": { "width_in", "depth_in", "height_in", "usableDeviceHeight_in",
                 "topBusZone_in", "bottomCableZone_in" },
      "devices": [ { "lineId", "designation", "partNumber", "catalogNumber",
                     "manufacturer", "frameModel", "ratedA", "poles", "mounting",
                     "dims": { "h_in", "w_in", "d_in" }, "weight_lbs",
                     "stackPosition", "offsetFromTop_in" } ],
      "componentLines": [ { "lineId", "category", "partNumber", "qty" } ],
      "cableEntry", "cableExit"
  } ],
  "sldTopology": { "busSegments": [...], "mains": [...], "ties": [...], "feeders": [...] }
}
```

- Builder: `buildSolidworksPayload()` in backend services; unit-tested against schema (JSON Schema validation at enqueue AND at agent).
- Schema evolution: additive within a major version; breaking change bumps major; agents advertise supported majors.

## 5. Artifact Return & Post-Processing

### 5.1 Artifact set

| Key | Format | Destination |
|---|---|---|
| GA | PDF | Document row (type: GA Drawing) → submittal merge; IFA workflow (Phase F) |
| MFG | PDF + DXF per part/assembly | Document rows (type: Mfg Drawing) — engineering release package |
| STEP | .step | Document row (3D export; customer-shareable) |
| NATIVE_REF | path/URI manifest | reference to native SLDASM/SLDDRW on TPS storage (not uploaded — too large; manifest only) |
| COPPER | JSON `{ total_lbs, perSection: [...] }` | Phase D reconciliation (§D-5) |
| REPORT | JSON warnings/notes | job detail UI |

### 5.2 Post-processing pipeline (backend, on `succeeded`)

1. Register Document rows, link to switchboard + quotation revision.
2. COPPER → create reconciliation record → Phase D threshold logic + notifications.
3. Drawing availability flips switchboard `drawingsStatus: none → generated`; submittal merge picks them up automatically.
4. Notification to requesting engineer (and management if reconciliation flagged).

## 6. UI

- **SW Jobs screen** (admin/engineering): queue table (status, progress bar, agent, attempts, duration), job detail (payload viewer, error log, artifacts), retry/cancel actions, agent health panel.
- Per-switchboard chip: `Drawings: none | queued | running 40% | generated | failed`.
- Reconciliation banner on quote when copper review pending (Phase D).

## 7. Security

- Agent auth: scoped API token, TLS only, token rotation supported (existing ApiToken).
- Payloads contain no pricing data (CAD doesn't need cost) — strip price fields in builder.
- Artifact uploads size-capped [SEED 200 MB/job]; virus-scan hook if available in existing upload pipeline.

## 8. Acceptance Criteria

1. End-to-end on a reference board: enqueue FULL → agent (on a TPS Windows machine or VM) leases, runs, uploads GA/MFG/STEP/COPPER → documents linked, copper reconciliation created. No tunnel anywhere.
2. Kill the agent mid-job → lease expires → job reclaimed and retried; attempts increment; terminal failure notifies.
3. Duplicate enqueue with identical payload hash returns the existing job (no double CAD runs).
4. `PAYLOAD_UNSUPPORTED` fails terminal without retries; `LICENSE_UNAVAILABLE` retries with backoff.
5. Payload validates against JSON Schema at enqueue and agent; builder unit tests cover MTM reference case.
6. COPPER_ONLY job auto-enqueues on quotation issue; reconciliation flow proven inside and outside threshold.
7. Two agents registered → jobs distribute; agent health panel reflects last_seen.
8. Cancel works in queued/leased; cooperative cancel honored between agent steps.

## 9. Out of Scope

- CAD template/macro development inside SolidWorks (TPS-side; contract only).
- IFA/IFC drawing approval workflow → Phase F (ERP master plan).
- DXF→nesting/CAM integration (future).
