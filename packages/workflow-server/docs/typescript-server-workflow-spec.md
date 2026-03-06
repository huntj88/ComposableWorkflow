# TypeScript Server Workflow Spec (`workflow-server`)

> Server-specific specification for `packages/workflow-server` — dynamic package loading, orchestration, persistence, API endpoints, lifecycle controls, and observability.
>
> Cross-cutting architecture and goals: [docs/architecture.md](../../../docs/architecture.md)
> Runtime library contracts: [workflow-lib-spec.md](../../workflow-lib/docs/workflow-lib-spec.md)
> Shared API transport types: [workflow-api-types-spec.md](../../workflow-api-types/docs/workflow-api-types-spec.md)
> CLI spec: [workflow-cli-spec.md](../../../apps/workflow-cli/docs/workflow-cli-spec.md)
> Web spec: [workflow-web-spec.md](../../../apps/workflow-web/docs/workflow-web-spec.md)

---

## Extracted Sections

The following sections from the original monolithic spec have been extracted into per-package spec documents. This server spec retains only server-specific concerns.

| Original Section | Now Lives In |
|---|---|
| §1–5 (Summary, Goals, Architecture) | [docs/architecture.md](../../../docs/architecture.md) |
| §6.1–6.6, §6.8 (Library contracts, events, commands, human feedback contract) | [workflow-lib-spec.md](../../workflow-lib/docs/workflow-lib-spec.md) |
| §6.7 (CLI tooling) | [workflow-cli-spec.md](../../../apps/workflow-cli/docs/workflow-cli-spec.md) |
| §6.9 (Shared API contract package, endpoint lock, error envelope) | [workflow-api-types-spec.md](../../workflow-api-types/docs/workflow-api-types-spec.md) |
| §10 (Graph data contracts) | [workflow-api-types-spec.md §5](../../workflow-api-types/docs/workflow-api-types-spec.md#5-data-contracts-for-flowchart-rendering) |
| §13–16 (Security, Testing, Delivery, Acceptance) | [docs/architecture.md](../../../docs/architecture.md) |

---

## 1) Dynamic Package Loading

### Configuration
Server supports workflow package references via:
- local directories,
- pnpm workspace package names or registry package names,
- pre-bundled manifests.

Example config fields:
- `workflowPackages: Array<{ source: "path" | "pnpm" | "bundle"; value: string; }>`

### Loader Requirements
1. Resolve package.
2. Import manifest entrypoint.
3. Validate manifest schema.
4. Register workflows by `workflowType` (single active version at a time).
5. Persist `workflowVersion` as metadata for logs/telemetry/inspection.
6. Reject collisions unless explicit override policy is configured.

### Hot Reload
- Out of scope for the current delivery plan.

## 2) Orchestration Engine
Engine responsibilities:
- create run records,
- execute workflow state handlers,
- execute workflow-invoked CLI commands through a controlled command runner,
- enforce valid transitions,
- coordinate child workflow launches,
- persist events atomically (or with durable ordering guarantees),
- publish telemetry/logs.

Concurrency model:
- single logical runner per `runId` at a time,
- child runs execute independently but linked.

## 3) Persistence Model
Default for localhost and MVP environments: Postgres running in Docker.

Local development baseline:
- Postgres 16 container,
- database: `workflow`,
- user: `workflow`,
- password: `workflow`,
- host port: `5432`.

Example `docker-compose.yml` service:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: workflow-postgres
    environment:
      POSTGRES_DB: workflow
      POSTGRES_USER: workflow
      POSTGRES_PASSWORD: workflow
    ports:
      - "5432:5432"
    volumes:
      - workflow_pgdata:/var/lib/postgresql/data

volumes:
  workflow_pgdata:
```

Minimum logical entities:
- `workflow_definitions` (registered metadata snapshot),
- `workflow_runs`,
- `workflow_events` (append-only, indexed by `runId`, `parentRunId`, `timestamp`),
- `workflow_run_children` (required parent-child lineage relation),
- `workflow_snapshots` (optional optimization for fast current-state reads).

Current state can be derived from event stream; snapshots are optimization only.

`workflow_run_children` requirements (required):
- Purpose: authoritative query surface for parent/child traversal and run tree reads without replaying full event history.
- Minimum columns:
  - `parent_run_id` (FK -> `workflow_runs.run_id`),
  - `child_run_id` (FK -> `workflow_runs.run_id`, unique),
  - `parent_workflow_type`,
  - `child_workflow_type`,
  - `parent_state` (state from which child was launched),
  - `created_at` (ISO timestamp),
  - `linked_by_event_id` (event id that recorded linkage).
- Required constraints/indexes:
  - primary key `(parent_run_id, child_run_id)`,
  - unique index on `child_run_id` (single parent ownership),
  - index on `parent_run_id` (tree expansion),
  - index on `created_at` (diagnostics/ops queries).
- Write semantics:
  - linkage row is written in the same transaction boundary as child launch persistence and linkage event append,
  - no duplicate linkage rows across retries/recovery (idempotent upsert semantics),
  - relation must remain consistent with event lineage and run tree API output.

Example migration snippet (`workflow_run_children`):

```sql
CREATE TABLE workflow_run_children (
  parent_run_id text NOT NULL,
  child_run_id text NOT NULL,
  parent_workflow_type text NOT NULL,
  child_workflow_type text NOT NULL,
  parent_state text NOT NULL,
  created_at timestamptz NOT NULL,
  linked_by_event_id text NOT NULL,
  PRIMARY KEY (parent_run_id, child_run_id),
  CONSTRAINT fk_wrc_parent_run FOREIGN KEY (parent_run_id) REFERENCES workflow_runs(run_id),
  CONSTRAINT fk_wrc_child_run FOREIGN KEY (child_run_id) REFERENCES workflow_runs(run_id),
  CONSTRAINT uq_wrc_child_run UNIQUE (child_run_id)
);

CREATE INDEX idx_wrc_parent_run_id ON workflow_run_children(parent_run_id);
CREATE INDEX idx_wrc_created_at ON workflow_run_children(created_at);

-- idempotent linkage write within same transaction as child launch event append
INSERT INTO workflow_run_children (
  parent_run_id,
  child_run_id,
  parent_workflow_type,
  child_workflow_type,
  parent_state,
  created_at,
  linked_by_event_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (parent_run_id, child_run_id) DO NOTHING;
```

Human feedback persistence decision (locked):
- Canonical source-of-truth remains the append-only `workflow_events` stream.
- MVP adds a materialized query table `human_feedback_requests` for efficient pending/terminal status reads.
- `human_feedback_requests` is a projection/snapshot of canonical event state, not an alternate source-of-truth.
- In this repository migration sequence, the projection schema is introduced in `packages/workflow-server/migrations/004_add_human_feedback_requests.ts`.
- For Postgres MVP, projection writes for feedback lifecycle changes must occur in the same transaction boundary as their corresponding feedback event append.
- Canonical request status derivation from `workflow_events` uses `event_type` progression: `human-feedback.requested -> awaiting_response`, `human-feedback.received -> responded`, `human-feedback.cancelled -> cancelled`.

`human_feedback_requests` minimum columns:
- `feedback_run_id` (PK, FK -> `workflow_runs.run_id`),
- `parent_run_id` (FK -> `workflow_runs.run_id`),
- `parent_workflow_type`,
- `parent_state`,
- `question_id` (required; non-null),
- `request_event_id` (unique),
- `prompt`,
- `options_json` (nullable JSON),
- `constraints_json` (nullable JSON),
- `correlation_id` (nullable),
- `status` (`awaiting_response | responded | cancelled`),
- `requested_at`,
- `responded_at` (nullable),
- `cancelled_at` (nullable),
- `response_json` (nullable JSON),
- `responded_by` (nullable).

Required constraints/indexes:
- primary key on `feedback_run_id`,
- index on `status` for pending request scans,
- index on `parent_run_id` for linkage/read APIs,
- index on `question_id` for question-level diagnostics and correlation queries,
- unique `request_event_id` to prevent duplicate projection writes during retries/recovery.

Queue-correlation write semantics:
- For feedback queue processors, projection writes must persist `question_id` from `HumanFeedbackRequestInput.questionId`.
- `question_id` must remain stable for the lifecycle of its feedback run and align with emitted request/response events.

Idempotency semantics:
- first terminal feedback outcome wins (`responded` or `cancelled`),
- subsequent competing terminal writes must be no-ops and preserve the first terminalized result,
- reconcile/replay paths must not create divergent projection rows from canonical event history.

Connection config (server):
- `DATABASE_URL=postgresql://workflow:workflow@localhost:5432/workflow`
- schema migrations are required at startup (or CI/CD deploy step) before accepting traffic.

---

## 4) API Specification

Base path: `/api/v1`

Path convention decision (locked):
- Endpoint paths in this section are absolute and include the `/api/v1` prefix for consistency.

All request/response/query/SSE payload contracts in this section are defined by `packages/workflow-api-types` (see [workflow-api-types-spec.md](../../workflow-api-types/docs/workflow-api-types-spec.md)) and consumed directly by server + clients.

Endpoint-to-contract mapping (normative):

| Endpoint | Request/Query Contract | Response/Event Contract |
| --- | --- | --- |
| `POST /api/v1/workflows/start` | `StartWorkflowRequest` | `StartWorkflowResponse` |
| `GET /api/v1/workflows/runs?lifecycle=...&workflowType=...` | query params per shared contract | `ListRunsResponse` |
| `GET /api/v1/workflows/runs/{runId}` | path params | `RunSummaryResponse` |
| `GET /api/v1/workflows/runs/{runId}/tree` | path/query params | `RunTreeResponse` |
| `GET /api/v1/workflows/runs/{runId}/events` | query params per shared contract | `RunEventsResponse` |
| `GET /api/v1/workflows/runs/{runId}/logs` | `GetRunLogsQuery` | `RunLogsResponse` |
| `GET /api/v1/workflows/definitions/{workflowType}` | path params | `WorkflowDefinitionResponse` |
| `POST /api/v1/workflows/runs/{runId}/cancel` | path params | `CancelRunResponse` |
| `GET /api/v1/workflows/runs/{runId}/stream` (SSE) | query params per shared contract | `WorkflowStreamFrame` |
| `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond` | `SubmitHumanFeedbackResponseRequest` | `SubmitHumanFeedbackResponseResponse` |
| `GET /api/v1/human-feedback/requests/{feedbackRunId}` | path params | `HumanFeedbackRequestStatusResponse` |
| `GET /api/v1/workflows/runs/{runId}/feedback-requests` | `ListRunFeedbackRequestsQuery` | `ListRunFeedbackRequestsResponse` |

For endpoints where path/query primitives are used, their serialized field names and value semantics are governed by `workflow-api-types`.

Error envelope contract: see [workflow-api-types-spec.md §4](../../workflow-api-types/docs/workflow-api-types-spec.md#4-error-envelope-contract-normative).

### 4.1 Start Workflow
`POST /api/v1/workflows/start`

Request:
```json
{
  "workflowType": "billing.invoice.v1",
  "input": { "invoiceId": "inv_123" },
  "idempotencyKey": "abc-123",
  "metadata": { "requestedBy": "system-a" }
}
```

Response:
```json
{
  "runId": "wr_...",
  "workflowType": "billing.invoice.v1",
  "workflowVersion": "1.2.0",
  "lifecycle": "running",
  "startedAt": "2026-02-19T00:00:00.000Z"
}
```

Start semantics:
- accepting `POST /api/v1/workflows/start` means execution begins immediately;
- there is no operational pending queue lifecycle between acceptance and execution;
- `workflow.started` is emitted at execution-start checkpoint.

### 4.2 Get Run Summary (Current Insight)
`GET /api/v1/workflows/runs/{runId}`

Returns:
- lifecycle/status,
- current state,
- current transition context,
- parent reference,
- direct children summary,
- progress counters,
- timestamps.

### 4.3 Get Run Tree (Root + Children)
`GET /api/v1/workflows/runs/{runId}/tree`

Returns recursive tree with for each node:
- run identity,
- workflow type/version,
- lifecycle,
- current state,
- started/ended timestamps,
- child nodes.

Supports query options:
- `depth` (default full),
- `includeCompletedChildren` (default true).

### 4.4 Get Linear Event History
`GET /api/v1/workflows/runs/{runId}/events`

Query:
- `cursor`, `limit`,
- `eventType`,
- `since`, `until`.

Returns ordered append-only events with sequence numbers.

### 4.5 Get Logs
`GET /api/v1/workflows/runs/{runId}/logs`

Query contract: `GetRunLogsQuery` from `workflow-api-types` with:
- `severity?` (`debug | info | warn | error`),
- `since?` (ISO 8601 timestamp, inclusive lower bound),
- `until?` (ISO 8601 timestamp, exclusive upper bound),
- `correlationId?`,
- `eventId?`.

Query semantics:
- Omitted fields are unconstrained.
- Multiple provided filters are AND-combined.
- Query parameter keys must match the `GetRunLogsQuery` contract exactly.

Returns structured log entries linked to event IDs and transitions.

### 4.6 List Active Runs
`GET /api/v1/workflows/runs?lifecycle=running&workflowType=...`

Provides operational insight into what is currently running.

### 4.7 Cancel Run
`POST /api/v1/workflows/runs/{runId}/cancel`

Default semantics:
- Cooperative cancellation: run is marked `cancelling`; workflow checks cancellation token between steps/transitions and exits cleanly.
- Parent-propagated cancellation: cancelling a parent also requests cancellation for active child workflows.
- Final state is `workflow.cancelled` when cancellation completes.

### 4.8 Definition/Graph Metadata for UI
`GET /api/v1/workflows/definitions/{workflowType}`

Returns static metadata to render flowchart:
- states,
- transitions,
- possible child workflow launch points,
- display metadata.

Graph contracts: see [workflow-api-types-spec.md §5](../../workflow-api-types/docs/workflow-api-types-spec.md#5-data-contracts-for-flowchart-rendering).

### 4.9 Live Event Stream
- `GET /api/v1/workflows/runs/{runId}/stream` via SSE.
- Query:
  - `cursor?` (opaque base64url cursor matching events pagination cursor format),
  - `eventType?` (optional filter).
- SSE frame contract:
  - `event: workflow-event`
  - `id: <cursor>`
  - `data: <WorkflowStreamFrame JSON>`
- Reconnect semantics:
  - Client reconnects with `cursor=<lastSeenCursor>`.
  - Server resumes with events whose `sequence` is strictly greater than cursor boundary (`no-loss`, ordered delivery).

Used by future UI for near-real-time visualization.

### 4.10 Submit Human Feedback Response
`POST /api/v1/human-feedback/requests/{feedbackRunId}/respond`

Request:
```json
{
  "response": {
    "questionId": "q_constraints_002",
    "selectedOptionIds": [2],
    "text": "Choose option 2 with stricter API constraints"
  },
  "respondedBy": "user-or-system-id"
}
```

Response:
```json
{
  "feedbackRunId": "wr_feedback_...",
  "status": "accepted",
  "acceptedAt": "2026-02-19T00:00:00.000Z"
}
```

Behavior:
- Valid only while feedback run lifecycle is `running` and awaiting response.
- Missing `questionId` is a request-validation error (`400`).
- `response` must conform to `docs/schemas/human-input/numbered-options-response-input.schema.json`.
- If any submitted `selectedOptionIds` do not exist in the request's offered options, return `400` validation error and keep feedback status unchanged (`awaiting_response`).
- For completion-confirmation numbered questions, `selectedOptionIds` must contain exactly one option; otherwise return `400` validation error and keep feedback status unchanged (`awaiting_response`).
- No protocol-level `response.text` max is enforced in MVP; if an implementation applies local limits, it must return `400` with validation details.
- First accepted response wins.
- Any subsequent response submission for the same `feedbackRunId` must return `409` (strict conflict model), including duplicate payloads.
- On acceptance, feedback run completes and parent run may resume at next safe point.
- `409` response must use shared `SubmitHumanFeedbackResponseConflict` and include current feedback status plus terminal timestamp metadata (`respondedAt` or `cancelledAt`).
- `400` validation failures and `404` not-found failures for this endpoint return shared `ErrorEnvelope`.

### 4.11 Get Human Feedback Request Status
`GET /api/v1/human-feedback/requests/{feedbackRunId}`

Response includes:
- feedback request lifecycle/status,
- prompt/options metadata,
- response payload (if present),
- parent run linkage fields.

### 4.12 List Human Feedback Requests for a Run
`GET /api/v1/workflows/runs/{runId}/feedback-requests`

Purpose:
- deterministic feedback discovery for run dashboards without prior `feedbackRunId` knowledge,
- support pending and recently terminalized feedback rendering in `apps/workflow-web`.

Query:
- `status` (optional CSV of `awaiting_response|responded|cancelled`; default `awaiting_response,responded`),
- `limit` (optional, default `50`, max `200`),
- `cursor` (optional pagination cursor).

Response contract (`ListRunFeedbackRequestsResponse`) includes:
- `items: RunFeedbackRequestSummary[]`,
- `nextCursor?: string`.

Each `RunFeedbackRequestSummary` includes:
- `feedbackRunId`,
- `parentRunId`,
- `questionId`,
- `status`,
- `requestedAt`,
- `respondedAt?`,
- `cancelledAt?`,
- `respondedBy?`,
- `prompt`,
- `options`,
- `constraints`.

Behavior:
- Source is the `human_feedback_requests` projection keyed by `parent_run_id`.
- Results are sorted by `requested_at DESC`, tie-break by `feedback_run_id ASC`.
- Endpoint must not require event-stream replay on read path.
- Pagination must be stable across reconnect/retry so clients can avoid duplicates.

---

## 5) Observability, Logging, Telemetry

### 5.1 Logging
Server injects instrumentation into `workflow-lib` (see [workflow-lib-spec.md §5](../../workflow-lib/docs/workflow-lib-spec.md#5-instrumentation-hooks)) to log at these points:
- workflow start/end/fail/cancel,
- state enter,
- transition request/success/failure,
- command start/complete/fail,
- child start/complete/fail,
- custom workflow logs.

Log fields:
- `runId`, `workflowType`, `state`, `transition`, `parentRunId`, `childRunId`, `eventId`, `sequence`, `timestamp`, `severity`, `message`, `metadata`.
- For command events include: `command`, `args`, `stdin`, `stdout`, `stderr`, `exitCode`, `durationMs`, `timeoutMs`, `truncated`, `redactedFields`.

### 5.2 Metrics
Required metrics:
- run counts by workflow type/lifecycle,
- transition counts/failures,
- command invocation counts/failures/timeouts,
- child launch counts/failures,
- duration histograms (run duration, transition latency, child execution latency),
- active run gauges.

### 5.3 Tracing
OpenTelemetry-compatible spans:
- root span per workflow run,
- child span for each transition,
- child span for each command invocation,
- nested spans for child workflow runs,
- propagate trace context through child launch API.

---

## 6) Pause/Resume & Crash Recovery

### 6.1 Run State Machine (Exact)

Allowed run lifecycle transitions:
- `running -> pausing -> paused`
- `paused -> resuming -> running`
- `running -> completed`
- `running|pausing|paused|resuming -> cancelling -> cancelled`
- `running|resuming -> failed`
- `running|pausing|resuming -> recovering` (detected during startup reconciliation after crash/shutdown)
- `recovering -> running|paused|cancelled|failed`

Rules:
- Pause/resume/cancel are cooperative and only finalize at safe points (between transitions, before launching child, before/after command execution).
- Parent-propagated cancellation is default: cancelling parent requests cancellation on active descendants.
- While a run is `pausing`, `paused`, `resuming`, `cancelling`, or `recovering`, new child launches are rejected.
- Human-feedback waits are safe points; pausing/cancelling during wait must not lose pending feedback correlation state.
- Recovery is idempotent and lock-protected (single active runner per `runId`).
- Repeat recovery attempts for a `running` run are allowed only when workflow progression happened since the last recovery boundary (i.e., at least one `transition.completed` event after the latest `workflow.recovered`).
- If no progression happened since the latest `workflow.recovered`, subsequent reconcile passes must skip duplicate recovery side effects.

Lifecycle event mapping (must mirror lifecycle state machine 1:1):
- entering `pausing` emits `workflow.pausing`
- entering `paused` emits `workflow.paused`
- entering `resuming` emits `workflow.resuming`
- returning to `running` from resume emits `workflow.resumed`
- entering `recovering` emits `workflow.recovering`
- successful recovery completion emits `workflow.recovered`
- entering `cancelling` emits `workflow.cancelling`
- entering terminal `cancelled` emits `workflow.cancelled`

### 6.2 API Endpoints (Exact)

#### Pause Run
`POST /api/v1/workflows/runs/{runId}/pause`

Request:
```json
{
  "reason": "operator-request",
  "requestedBy": "user-or-system-id"
}
```

Response:
```json
{
  "runId": "wr_...",
  "lifecycle": "pausing",
  "acceptedAt": "2026-02-19T00:00:00.000Z"
}
```

#### Resume Run
`POST /api/v1/workflows/runs/{runId}/resume`

Request:
```json
{
  "reason": "operator-request",
  "requestedBy": "user-or-system-id"
}
```

Response:
```json
{
  "runId": "wr_...",
  "lifecycle": "resuming",
  "acceptedAt": "2026-02-19T00:00:00.000Z"
}
```

#### Trigger Recovery Reconciliation (Admin/Internal)
`POST /api/v1/workflows/recovery/reconcile`

Request:
```json
{
  "limit": 100,
  "dryRun": false
}
```

Response:
```json
{
  "scanned": 42,
  "recovered": 10,
  "skipped": 30,
  "failed": 2,
  "startedAt": "2026-02-19T00:00:00.000Z",
  "completedAt": "2026-02-19T00:00:05.000Z"
}
```

#### Endpoint Behavior Requirements
- `pause`: valid only from `running`; otherwise return `409` with current lifecycle.
- `resume`: valid only from `paused`; otherwise return `409` with current lifecycle.
- `reconcile`: idempotent; safe to call on startup and manually.
- Server startup must invoke reconciliation automatically before accepting new run execution work.

### 6.3 Human Feedback Wait/Resume Semantics

- Parent workflows may block on server-provided feedback child runs (default `server.human-feedback.v1`).
- Human feedback waits have no timeout semantics in MVP; they remain pending until response or cancellation.
- While a feedback request is pending, the feedback child run lifecycle remains `running` and request status is `awaiting_response`.
- Response submission completes the feedback child run and unblocks parent progression from the waiting checkpoint where it paused.
- Parent pause/cancel requests while waiting for feedback must follow cooperative lifecycle rules.
- Recovery reconcile must restore waiting feedback runs without duplicating question issuance or response acceptance.
- Replayed/reconciled feedback runs must preserve first-response-wins idempotency.

---

## 7) Failure Handling and Reliability

1. Idempotent start via idempotency key.
2. Durable event append before acknowledging critical transitions.
3. Retry policy for workflow/action failures is FSM-defined within workflow implementation; no server-managed automatic retries for those failures.
4. Unhandled state/action errors must transition the run to terminal `failed` (error state) with full error payload.
5. Parent/child failure policy options:
   - propagate failure to parent (default),
   - allow parent-defined compensation/recovery.
6. Cancellation policy (default):
  - cooperative cancellation for all runs,
  - parent-propagated cancellation across active descendants,
  - no new child workflow launches once a run is in `cancelling`.

---

This spec assumes REST-only for MVP (especially localhost-first) + Postgres event persistence (localhost via Docker) + in-process loading, with gRPC as a later option if internal scale/performance needs justify it. Workflow versioning is not a runtime selection concern in MVP; only one active version per `workflowType` is supported, and `workflowVersion` is retained for logging/telemetry/inspection.
