# TypeScript Server-Side Composable Workflow Spec

## 1) Summary

This document specifies a server-side TypeScript implementation inspired by `huntj88/flow` (composable, compile-time-validated state machine flows with child flow composition), adapted for backend execution and API-driven observability.

The system is a monorepo with:
- a workflow runtime library used by all workflow packages,
- a server process that dynamically loads and executes workflow packages,
- an API for launching workflows and querying rich runtime state/history/logs,
- first-class support for child workflows and complete transition lineage.

UI is out of scope, but API responses must support rendering workflow and child workflow graphs.

---

## 2) Goals

1. Preserve Flow-style composability:
   - parent workflow can launch child workflow(s),
   - parent resumes with child output.
2. Strongly typed workflow authoring in TypeScript packages.
3. Dynamic workflow package loading at runtime on the server.
4. Rich runtime introspection:
   - active workflow tree,
   - current state/node,
   - child workflow status,
   - transition history (linear event stream),
   - logs/telemetry by transition/state/child workflow lifecycle.
5. Decoupled architecture:
   - workflow packages depend only on shared workflow library,
   - server depends on the same library and package contracts,
   - workflow packages do not depend on server internals.
6. Library includes workflow-invoked command execution support for workflow steps.
7. User-facing CLI tooling is a separate capability (for operators/developers), not part of workflow step execution.
8. Server instruments workflow library operations with logging + telemetry.

## 3) Non-Goals

- Building any UI.
- Defining a specific diagram rendering engine.
- Defining a state machine code generator (can be added later).

---

## 4) Core Concepts

## 4.1 Workflow Definition
A workflow is a finite state machine definition with:
- typed input/output,
- explicit states,
- explicit transitions,
- optional side effects/actions,
- ability to launch child workflows.

## 4.2 Workflow Instance
Runtime execution of a workflow definition. Every instance has:
- unique `workflowRunId`,
- `workflowType` and package metadata,
- lifecycle (`pending | running | completed | failed | cancelled`),
- current state,
- timestamps,
- parent link (if child),
- child run references,
- append-only event history.

## 4.3 Event-Sourced Runtime Log
All meaningful events are appended in order to a per-run event stream:
- run started,
- transition attempted/succeeded/failed,
- state entered/exited,
- child run started/completed/failed,
- run completed/failed/cancelled,
- custom workflow log events.

This linear history is source-of-truth for inspection and replay diagnostics.

## 4.4 Execution Tree
A root workflow plus transitive children forms a workflow tree (DAG constrained to parent-child ownership; no shared mutable child instances).

---

## 5) Monorepo Architecture

Recommended package layout:

```text
ComposableWorkflow/
  docs/
  packages/
    workflow-lib/                # shared runtime + contracts + workflow command runner helpers
    workflow-server/             # HTTP/gRPC server + persistence + instrumentation
    workflow-package-<name>/     # one or more decoupled workflow definitions
    workflow-package-<name2>/
  apps/
    workflow-cli/                # optional user-facing CLI app (operator/developer commands)
```

## 5.1 Package Responsibilities

### `packages/workflow-lib`
Exports:
- workflow type contracts,
- runtime interfaces and execution context,
- transition primitives,
- child workflow launch APIs,
- event/logging hooks (instrumentable),
- package manifest interfaces,
- workflow-invoked command execution helpers for workflow steps.

No server-specific DB, transport, or framework coupling.

### `packages/workflow-server`
Implements:
- dynamic package discovery/loading,
- workflow registry,
- execution orchestrator,
- persistence for run/event data,
- telemetry/logging adapters,
- API layer.

### `packages/workflow-package-*`
Contain user workflows and optional shared domain code.
Must depend only on `workflow-lib` (and their own domain deps), not `workflow-server`.

Each package may expose one workflow or multiple related workflows.

### `apps/workflow-cli`
Optional user-facing CLI application for operators/developers.
Uses server APIs and/or package metadata for tasks like run/inspect/list/tail events.
This is intentionally separate from workflow step command execution APIs in `workflow-lib`.

---

## 6) Shared Library Contract (`workflow-lib`)

## 6.1 Workflow Package Manifest
Every workflow package exports a manifest object:

```ts
export interface WorkflowPackageManifest {
  packageName: string;
  packageVersion: string;
  workflows: WorkflowRegistration[];
}

export interface WorkflowRegistration<I = unknown, O = unknown> {
  workflowType: string;              // globally unique: e.g. "billing.invoice.v1"
  workflowVersion: string;           // informational/observability only; not used for runtime version selection
  factory: WorkflowFactory<I, O>;    // creates workflow instance/definition
  metadata?: {
    displayName?: string;
    tags?: string[];
    description?: string;
  };
}
```

## 6.2 Workflow Runtime Types

```ts
export type WorkflowLifecycle =
  | "pending"
  | "running"
  | "pausing"
  | "paused"
  | "resuming"
  | "recovering"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowContext<I, O> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: WorkflowLogEvent): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO>;
  runCommand(req: WorkflowCommandRequest): Promise<WorkflowCommandResult>;
  complete(output: O): void;
  fail(error: Error): void;
}

export interface WorkflowDefinition<I, O> {
  initialState: string;
  states: Record<string, WorkflowStateHandler<I, O>>;
  transitions?: WorkflowTransitionDescriptor[]; // static metadata for graph rendering
}

export type WorkflowFactory<I, O> = (ctx: WorkflowContext<I, O>) => WorkflowDefinition<I, O>;
```

## 6.3 Child Workflow Contract

```ts
export interface ChildWorkflowRequest<I> {
  workflowType: string;
  input: I;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface WorkflowCommandRequest {
  command: string;
  args?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface WorkflowCommandResult {
  exitCode: number;
  stdin: string;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
```

Behavior:
- Child run is linked to parent run + parent state/transition context.
- Parent awaits child result (default) or can configure async fire-and-track mode later.
- Child lifecycle events are emitted to both child stream and parent-linked view.

## 6.4 Runtime Events

```ts
export type WorkflowEventType =
  | "workflow.started"
  | "workflow.pausing"
  | "workflow.paused"
  | "workflow.resuming"
  | "workflow.resumed"
  | "workflow.recovering"
  | "workflow.recovered"
  | "workflow.cancelling"
  | "state.entered"
  | "transition.requested"
  | "transition.completed"
  | "transition.failed"
  | "command.started"
  | "command.completed"
  | "command.failed"
  | "child.started"
  | "child.completed"
  | "child.failed"
  | "workflow.completed"
  | "workflow.failed"
  | "workflow.cancelled"
  | "log";

export interface WorkflowEvent {
  eventId: string;
  runId: string;
  parentRunId?: string;
  workflowType: string;
  eventType: WorkflowEventType;
  state?: string;
  transition?: {
    from?: string;
    to?: string;
    name?: string;
  };
  child?: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: WorkflowLifecycle;
  };
  command?: {
    command: string;
    args?: string[];
    stdin?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  timestamp: string; // ISO8601
  sequence: number;  // monotonic per run
  payload?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

## 6.5 Instrumentation Hooks
Library must provide hook points that server can inject:

```ts
export interface WorkflowInstrumentation {
  onEvent(event: WorkflowEvent): void | Promise<void>;
  onMetric(metric: WorkflowMetric): void | Promise<void>;
  onTrace(trace: WorkflowTrace): void | Promise<void>;
}
```

Library internals call these hooks whenever transition/child/start/end/log operations occur.

## 6.6 Workflow-Invoked Command Execution Exports
The library exposes command execution APIs workflows can call from state handlers:
- run command with args/env/cwd/timeout,
- capture stdin/stdout/stderr/exit code,
- emit command lifecycle events (`command.started|completed|failed`),
- enforce policy hooks (allowlist, timeout caps, env redaction, working-directory restrictions),
- log stdin/stdout/stderr in structured command event payloads with configurable truncation/redaction.

Example usage in a workflow state (shape, not fixed implementation):
- `await ctx.runCommand({ command: "python", args: ["-m", "invoice_job", invoiceId], timeoutMs: 30000 })`

## 6.7 User-Facing CLI Tooling (Separate)
User CLI tooling belongs in `apps/workflow-cli` and is not invoked from workflow state handlers.

User CLI responsibilities:
- run workflow by type + input JSON,
- query currently running workflows,
- inspect run tree and linear event history,
- stream logs/events for operational debugging,
- stream transition/events to stdout,
- optional graph metadata dump.

Example user CLI commands:
- `workflow run --package <path> --type billing.invoice.v1 --input '{...}'`
- `workflow runs list --status running`
- `workflow runs events --run-id wr_123 --follow`
- `workflow inspect --package <path> --type billing.invoice.v1 --graph`

---

## 7) Server Architecture (`workflow-server`)

## 7.1 Dynamic Package Loading

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

### Hot Reload (optional phase)
- File-watch local package paths in non-prod mode.
- Reload manifests with atomic registry swap.

## 7.2 Orchestration Engine
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
- child runs execute independently but linked,
- optional distributed locking when horizontally scaled.

## 7.3 Persistence Model
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
- `workflow_run_children` (optional materialized relation),
- `workflow_snapshots` (optional optimization for fast current-state reads).

Current state can be derived from event stream; snapshots are optimization only.

Connection config (server):
- `DATABASE_URL=postgresql://workflow:workflow@localhost:5432/workflow`
- schema migrations are required at startup (or CI/CD deploy step) before accepting traffic.

---

## 8) API Specification

Base path: `/api/v1`

## 8.1 Start Workflow
`POST /workflows/start`

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

## 8.2 Get Run Summary (Current Insight)
`GET /workflows/runs/{runId}`

Returns:
- lifecycle/status,
- current state,
- current transition context,
- parent reference,
- direct children summary,
- progress counters,
- timestamps.

## 8.3 Get Run Tree (Root + Children)
`GET /workflows/runs/{runId}/tree`

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

## 8.4 Get Linear Event History
`GET /workflows/runs/{runId}/events`

Query:
- `cursor`, `limit`,
- `eventType`,
- `since`, `until`.

Returns ordered append-only events with sequence numbers.

## 8.5 Get Logs
`GET /workflows/runs/{runId}/logs`

Returns structured log entries linked to event IDs and transitions.

## 8.6 List Active Runs
`GET /workflows/runs?lifecycle=running&workflowType=...`

Provides operational insight into what is currently running.

## 8.7 Cancel Run
`POST /workflows/runs/{runId}/cancel`

Default semantics:
- Cooperative cancellation: run is marked `cancelling`; workflow checks cancellation token between steps/transitions and exits cleanly.
- Parent-propagated cancellation: cancelling a parent also requests cancellation for active child workflows.
- Final state is `workflow.cancelled` when cancellation completes.

## 8.8 Definition/Graph Metadata for UI
`GET /workflows/definitions/{workflowType}`

Returns static metadata to render flowchart:
- states,
- transitions,
- possible child workflow launch points,
- display metadata.

## 8.9 Live Event Stream (optional but recommended)
- `GET /workflows/runs/{runId}/stream` via SSE, or
- WebSocket subscription.

Used by future UI for near-real-time visualization.

---

## 9) Observability, Logging, Telemetry

## 9.1 Logging
Server injects instrumentation into `workflow-lib` to log at these points:
- workflow start/end/fail/cancel,
- state enter,
- transition request/success/failure,
- command start/complete/fail,
- child start/complete/fail,
- custom workflow logs.

Log fields:
- `runId`, `workflowType`, `state`, `transition`, `parentRunId`, `childRunId`, `eventId`, `sequence`, `timestamp`, `severity`, `message`, `metadata`.
- For command events include: `command`, `args`, `stdin`, `stdout`, `stderr`, `exitCode`, `durationMs`, `timeoutMs`, `truncated`, `redactedFields`.

## 9.2 Metrics
Required metrics:
- run counts by workflow type/lifecycle,
- transition counts/failures,
- command invocation counts/failures/timeouts,
- child launch counts/failures,
- duration histograms (run duration, transition latency, child execution latency),
- active run gauges.

## 9.3 Tracing
OpenTelemetry-compatible spans:
- root span per workflow run,
- child span for each transition,
- child span for each command invocation,
- nested spans for child workflow runs,
- propagate trace context through child launch API.

---

## 10) Data Contracts for Flowchart Rendering

To support UI later, API must provide both static and dynamic graph inputs.

## 10.1 Static Graph Schema
For a workflow definition:
- nodes: state IDs + labels,
- edges: transition from/to + label,
- child-launch annotations on edges or states.

## 10.2 Dynamic Overlay Schema
For a run instance:
- active node,
- traversed edges (ordered),
- pending/failed edges,
- child node linkage to separate workflow graph instances,
- timestamps/tooltips/log references.

---

## 11) Pause/Resume & Crash Recovery

## 11.1 Run State Machine (Exact)

Allowed run lifecycle transitions:
- `pending -> running`
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
- Recovery is idempotent and lock-protected (single active runner per `runId`).

Lifecycle event mapping (must mirror lifecycle state machine 1:1):
- entering `pausing` emits `workflow.pausing`
- entering `paused` emits `workflow.paused`
- entering `resuming` emits `workflow.resuming`
- returning to `running` from resume emits `workflow.resumed`
- entering `recovering` emits `workflow.recovering`
- successful recovery completion emits `workflow.recovered`
- entering `cancelling` emits `workflow.cancelling`

## 11.2 API Endpoints (Exact)

### Pause Run
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

### Resume Run
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

### Trigger Recovery Reconciliation (Admin/Internal)
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

### Endpoint Behavior Requirements
- `pause`: valid only from `running`; otherwise return `409` with current lifecycle.
- `resume`: valid only from `paused`; otherwise return `409` with current lifecycle.
- `reconcile`: idempotent; safe to call on startup and manually.
- Server startup must invoke reconciliation automatically before accepting new run execution work.

---

## 12) Failure Handling and Reliability

1. Idempotent start via idempotency key.
2. Durable event append before acknowledging critical transitions.
3. Retry policy for transient action failures.
4. Dead-letter/error terminal state with full error payload.
5. Parent/child failure policy options:
   - propagate failure to parent (default),
   - allow parent-defined compensation/recovery.
6. Cancellation policy (default):
  - cooperative cancellation for all runs,
  - parent-propagated cancellation across active descendants,
  - no new child workflow launches once a run is in `cancelling`.

---

## 13) Security and Multi-Tenancy (if needed)

- AuthN/AuthZ at API layer.
- Tenant scoping field on runs/events.
- Package loading allowlist.
- Validate input payload schemas before execution.
- Redaction policies for sensitive logs/payloads, including command `stdin`/`stdout`/`stderr`.

---

## 14) Testing Strategy

1. `workflow-lib` unit tests:
   - transition validity,
   - child workflow orchestration,
   - event emission correctness.
2. workflow package tests:
   - state progression,
   - failure paths,
   - child dependencies.
3. server integration tests:
   - package loading,
   - API correctness,
   - persistence and event ordering,
   - observability hooks.
4. Workflow-invoked command execution tests:
  - run command behavior from workflow state handlers,
  - timeout/non-zero exit handling,
  - command event/log emission correctness.
5. User CLI tests:
  - command parsing and output formatting,
  - run/list/inspect/events command behavior,
  - API integration and follow-stream behavior.
6. Pause/Resume/Recovery tests:
  - valid/invalid state transitions for pause and resume (`409` behavior),
  - lifecycle checkpoint events are emitted for pause/resume/recovery transitions (`workflow.pausing`, `workflow.paused`, `workflow.resuming`, `workflow.resumed`, `workflow.recovering`, `workflow.recovered`),
  - crash recovery reconciliation and idempotent re-run behavior,
  - parent/child behavior during pause, resume, and propagated cancel.

---

## 15) Phased Delivery Plan

### Phase 1 (MVP)
- Monorepo scaffold.
- `workflow-lib` core contracts + runtime + child launch + events.
- `workflow-server` start run + get run + get events + list active.
- Local Postgres via Docker compose + initial migration set.
- One example workflow package.
- Basic logging + metrics.

### Phase 2
- Run tree endpoint.
- Definition graph metadata endpoint.
- SSE live stream.
- Command execution policy configuration (workflow-invoked commands).
- Initial `apps/workflow-cli` commands (run/list/inspect/events).

### Phase 3
- Snapshots/replay optimizations.
- Hot-reload in dev.
- Advanced retry/cancellation policies.
- Multi-tenant hardening.

---

## 16) Acceptance Criteria

1. A workflow package can be built and published without referencing server internals.
2. Server can dynamically load package(s) and start a workflow by type.
3. Parent workflow can launch child workflow and await typed result.
4. API exposes current run state, active children, and full linear transition/event history.
5. API exposes sufficient definition + runtime data to render future flowchart UI.
6. Logs and telemetry are emitted for all major workflow-lib operations through server instrumentation.
7. Workflows can execute CLI commands through `workflow-lib` with policy enforcement, and those command steps are visible in events/logs/telemetry.
8. User-facing CLI commands (in `apps/workflow-cli`) can start/inspect workflows via server APIs, independent of workflow step command execution.
9. Cancellation uses cooperative stop mechanics and parent-propagated scope by default, and cancelled runs end with `workflow.cancelled`.
10. Runs can be paused, resumed, and recovered after crash/shutdown using the defined lifecycle transitions and recovery endpoints.
11. Pause/resume/recovery transitions emit matching lifecycle events as required observable checkpoints.

---

This spec assumes REST-only for MVP (especially localhost-first) + Postgres event persistence (localhost via Docker) + in-process loading, with gRPC as a later option if internal scale/performance needs justify it. Workflow versioning is not a runtime selection concern in MVP; only one active version per `workflowType` is supported, and `workflowVersion` is retained for logging/telemetry/inspection.