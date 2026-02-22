# Composable Workflow E2E Behaviors

This document defines **testable end-to-end behaviors** for the TypeScript server-side composable workflow system.

It is intended to be used as:
- an executable acceptance checklist,
- a source for integration/E2E test implementation,
- a contract between `workflow-lib`, `workflow-server`, workflow packages, and operator tooling.

Primary source: `docs/typescript-server-workflow-spec.md`.

---

## 1) Test Conventions

## 1.1 Environment Baseline
- Server running with Postgres (`postgresql://workflow:workflow@localhost:5432/workflow`).
- At least one workflow package dynamically loadable by server.
- Test package includes:
  - a simple success workflow,
  - a workflow with deterministic failure,
  - a parent workflow that launches a child workflow,
  - a workflow step that invokes `ctx.runCommand(...)`.

## 1.2 Assertion Types
Each behavior should validate all relevant dimensions:
1. **API contract** (status code + response payload shape + value semantics).
2. **Persistence** (`workflow_runs`, `workflow_events`, required `workflow_run_children`, and snapshots if enabled).
3. **Event stream correctness** (event type, ordering, sequence monotonicity, linkage fields).
4. **Observability** (logs/metrics/traces emitted with required fields).

## 1.3 Event Invariants (Global)
For every run:
- `sequence` is strictly monotonic per `runId`.
- `timestamp` is valid ISO8601.
- `eventId` is unique.
- `runId`, `workflowType`, and `eventType` are always present.
- Lifecycle transition checkpoint events match actual run lifecycle transitions.

For parent/child relationships:
- child events include correct `parentRunId`.
- parent-linked child lifecycle visibility is queryable via run summary/tree/events.

## B-EVT-001: Required event envelope fields are always populated
**Given** any persisted workflow event
**When** events are read from API or storage
**Then** `runId`, `workflowType`, and `eventType` are always present
**And** missing required envelope fields are treated as contract violations

## B-EVT-002: Event identity, timestamp, and sequence invariants hold per run
**Given** a run with one or more events
**When** validating its event stream
**Then** `eventId` values are unique
**And** `timestamp` values are valid ISO8601
**And** `sequence` is strictly monotonic per `runId`

## B-EVT-003: Parent-linked child event lineage remains consistent
**Given** child workflow lifecycle events linked to a parent run
**When** querying parent and child events/summary/tree views
**Then** child events include correct `parentRunId`
**And** lineage remains consistent across events and run-tree projections

---

## 2) Registry and Package Loading Behaviors

## B-LOAD-001: Dynamic package path loading succeeds
**Given** server config includes a valid local package path
**When** server starts and loads workflow packages
**Then** workflows are registered by `workflowType` and available for start API
**And** definition metadata (`workflowVersion`, display fields) is queryable
**And** registered metadata snapshot persists in `workflow_definitions` (or equivalent)

## B-LOAD-002: Manifest schema validation failure blocks invalid package
**Given** a package with malformed manifest
**When** loader imports the package
**Then** package is rejected with explicit validation error
**And** no malformed workflow registration is visible in API

## B-LOAD-003: Workflow type collision is rejected by default
**Given** two packages exporting same `workflowType`
**When** server loads both
**Then** server rejects collision unless override policy explicitly enabled
**And** rejection is logged with offending package metadata

## B-LOAD-004: Workflow version is informational only
**Given** registered workflow with `workflowType=X` and `workflowVersion=Y`
**When** a run is started by `workflowType=X`
**Then** active version selection is not runtime-negotiated
**And** run summary/events/logs include `workflowVersion` for observability

---

## 3) Run Start and Idempotency Behaviors

## B-START-001: Start workflow returns running run metadata
**Given** a valid `workflowType` and valid input payload
**When** `POST /api/v1/workflows/start` is called
**Then** response contains `runId`, `workflowType`, `workflowVersion`, lifecycle `running`, and `startedAt`
**And** acceptance implies execution has started immediately (no operational pending queue state)
**And** `workflow.started` appears in events for that run as the execution-start checkpoint
**And** `workflow_runs` contains corresponding row

## B-START-002: Unknown workflow type is rejected
**Given** `workflowType` does not exist in registry
**When** start API is called
**Then** request fails with client error (4xx)
**And** no run row is created
**And** no run events are emitted

## B-START-003: Idempotent start returns same logical run
**Given** same `workflowType`, same semantic input, and same `idempotencyKey`
**When** start API is called repeatedly within idempotency window/policy
**Then** server does not create duplicate execution
**And** repeated calls resolve to same run identity or idempotent equivalent response
**And** event stream does not duplicate `workflow.started` for same idempotent request

## B-START-004: Different idempotency key creates distinct run
**Given** same workflowType/input but different idempotency keys
**When** start API is called twice
**Then** two distinct runs are created and independently observable

---

## 4) Core State Transition Behaviors

## B-TRANS-001: Valid transition emits requested + completed events
**Given** run in state `S1` and a valid transition to `S2`
**When** transition executes
**Then** `transition.requested` then `transition.completed` appear in order
**And** `state.entered` for `S2` appears
**And** run summary current state becomes `S2`

## B-TRANS-002: Invalid transition emits failed event and fails run or handler as defined
**Given** transition request not allowed by workflow definition/runtime rules
**When** transition is attempted
**Then** `transition.failed` is emitted with error payload
**And** run lifecycle/result follows configured failure semantics

## B-TRANS-004: State/action failure retry ownership and error-state fallback
**Given** a state handler/action throws or returns failure
**When** failure handling is evaluated
**Then** retry behavior is determined only by workflow FSM design (explicit states/transitions), not by implicit server auto-retry
**And** if the state does not catch/handle the error, `transition.failed` is emitted and run transitions to terminal `failed`

## B-TRANS-003: Event ordering remains append-only and consistent under concurrent system load
**Given** multiple independent runs executing concurrently
**When** events are queried per run
**Then** each run has strictly ordered sequence values without gaps due to reordering
**And** cross-run interleaving does not break per-run ordering guarantees

---

## 5) Child Workflow Composition Behaviors

## B-CHILD-001: Parent launches child and awaits typed result
**Given** parent workflow state handler calls `ctx.launchChild(...)`
**When** child starts and completes successfully
**Then** parent emits child lifecycle linkage events (`child.started`, `child.completed`)
**And** child has its own run with `parentRunId` linking to parent
**And** parent resumes using child output

## B-CHILD-002: Child failure propagates to parent by default policy
**Given** parent launches child and child fails
**When** default failure policy is active
**Then** parent run fails (or enters compensation path if explicitly configured)
**And** `child.failed` appears with linked run metadata

## B-CHILD-003: Parent run tree includes transitive children
**Given** root run with nested descendants
**When** `GET /api/v1/workflows/runs/{runId}/tree` is called
**Then** response includes recursive child nodes with lifecycle/current state
**And** depth and `includeCompletedChildren` query options are honored

## B-CHILD-004: Parent cancellation propagates to active descendants
**Given** parent and active child runs
**When** parent cancel endpoint is invoked
**Then** parent enters `cancelling`
**And** active descendants receive cancellation request
**And** descendants eventually terminalize under cooperative cancellation semantics

---

## 6) Workflow-Invoked Command Execution Behaviors

## B-CMD-001: Command execution from workflow state succeeds with full capture
**Given** workflow step invokes `ctx.runCommand(...)` with allowed command
**When** command exits zero within timeout
**Then** command result includes `exitCode`, `stdin`, `stdout`, `stderr`, `startedAt`, `completedAt`, `durationMs`
**And** events include `command.started` then `command.completed`
**And** structured logs include command fields and linkage fields (`runId`, `eventId`, sequence)

## B-CMD-002: Non-zero exit is handled per `allowNonZeroExit`
**Given** command exits non-zero
**When** `allowNonZeroExit=false` (default)
**Then** `command.failed` is emitted and run follows failure handling policy

**When** `allowNonZeroExit=true`
**Then** command result is returned without forcing run failure solely due to exit code

## B-CMD-003: Timeout enforcement
**Given** command exceeds `timeoutMs`
**When** runner enforces timeout
**Then** process is terminated/marked failed by policy
**And** `command.failed` includes timeout context
**And** logs/metrics capture timeout outcome

## B-CMD-004: Policy enforcement and redaction
**Given** restrictive command policies (allowlist/cwd/env/redaction/truncation)
**When** disallowed command or forbidden cwd/env is requested
**Then** execution is blocked with explicit policy error
**And** no command process is spawned

**And when** output is large or sensitive
**Then** emitted payload/log fields are truncated/redacted according to policy and marked (`truncated`, `redactedFields`)

---

## 7) Lifecycle Control Behaviors (Pause/Resume/Cancel/Recovery)

## B-LIFE-001: Pause accepted only from running
**Given** run lifecycle is `running`
**When** `POST /api/v1/workflows/runs/{runId}/pause` is called
**Then** response lifecycle is `pausing`
**And** `workflow.pausing` event emitted
**And** run eventually reaches `paused` with `workflow.paused` emitted at safe point

## B-LIFE-002: Pause invalid from non-running returns 409
**Given** run lifecycle is not `running`
**When** pause endpoint is called
**Then** response is `409` including current lifecycle

## B-LIFE-003: Resume accepted only from paused
**Given** run lifecycle is `paused`
**When** `POST /api/v1/workflows/runs/{runId}/resume` is called
**Then** response lifecycle is `resuming`
**And** `workflow.resuming` emitted
**And** upon return to `running`, `workflow.resumed` emitted

## B-LIFE-004: Resume invalid from non-paused returns 409
**Given** run lifecycle is not `paused`
**When** resume endpoint is called
**Then** response is `409` including current lifecycle

## B-LIFE-005: No new child launches in controlled transitional lifecycles
**Given** run lifecycle is one of `pausing|paused|resuming|cancelling|recovering`
**When** workflow attempts to launch child
**Then** launch is rejected by runtime
**And** rejection is observable (event/log/error path)

## B-LIFE-006: Cooperative cancellation semantics
**Given** cancel endpoint called for active run
**When** run hits safe cancellation checkpoint
**Then** run transitions `... -> cancelling -> cancelled`
**And** `workflow.cancelling` then `workflow.cancelled` events are emitted

## B-LIFE-007: Recovery reconciliation endpoint behavior
**Given** interrupted runs exist after crash/shutdown
**When** `POST /api/v1/workflows/recovery/reconcile` is invoked
**Then** reconciliation is idempotent and lock-protected
**And** response reports scanned/recovered/skipped/failed counts
**And** recovery lifecycle events emit (`workflow.recovering`, `workflow.recovered` as applicable)

## B-LIFE-008: Startup reconciliation runs before new execution work
**Given** server starts with unfinished runs in storage
**When** startup sequence executes
**Then** reconciliation runs before accepting new work
**And** recovered runs are brought to consistent lifecycle states

---

## 8) API Read/Query Behaviors

## B-API-001: Run summary reflects current authoritative state
Endpoint: `GET /api/v1/workflows/runs/{runId}`
- Returns lifecycle, current state, parent reference, direct children summary, counters, timestamps.
- Values are consistent with latest persisted events/snapshots.

## B-API-002: Linear events endpoint supports filtering and pagination
Endpoint: `GET /api/v1/workflows/runs/{runId}/events`
- Honors `cursor`, `limit`, `eventType`, `since`, `until`.
- Maintains strict ordering by sequence.
- Pagination is stable (no duplicates/missing events for same cursor contract).

## B-API-003: Logs endpoint links logs to run transitions/events
Endpoint: `GET /api/v1/workflows/runs/{runId}/logs`
- Returns structured logs with event linkage (`eventId`, transition/run context).
- Command logs include command metadata fields when applicable.

## B-API-004: List runs supports operational filtering
Endpoint: `GET /api/v1/workflows/runs?...`
- Supports lifecycle and workflowType filters.
- Active run query returns only matching states.

## B-API-005: Definition endpoint returns static graph metadata
Endpoint: `GET /api/v1/workflows/definitions/{workflowType}`
- Returns states (nodes), transitions (edges), child-launch annotations, and display metadata.
- Sufficient to render static flowchart graph without runtime execution.

## B-API-006: Live stream delivers near-real-time ordered events
Endpoint: `GET /api/v1/workflows/runs/{runId}/stream` (SSE)
- Emits new events in sequence order.
- Reconnection behavior (if supported) preserves no-loss semantics under documented cursor strategy.

---

## 9) Persistence and Durability Behaviors

## B-DATA-001: Durable append before critical transition acknowledgment
**Given** a critical transition/lifecycle event
**When** API/engine acknowledges progress
**Then** corresponding event is durably persisted first (or with equivalent durable ordering guarantee)

## B-DATA-002: Current state derivation from event stream is consistent
**Given** run with complete event history
**When** deriving current state from events
**Then** derived state equals run summary state
**And** optional snapshots (if enabled) are consistent optimization, not alternate source-of-truth

## B-DATA-003: Parent-child relation materialization
**Given** child launches occurred
**When** querying `workflow_run_children`
**Then** relation matches event lineage and run tree API output

---

## 10) Observability Behaviors

## B-OBS-001: Logging hook invoked for major lifecycle and transition points
- start/end/fail/cancel
- state entry
- transition request/success/failure
- command start/complete/fail
- child start/complete/fail
- custom workflow logs

Assertions:
- Required log fields present (`runId`, `workflowType`, `state`, `transition`, `eventId`, `sequence`, timestamp, severity, message).

## B-OBS-002: Metrics emitted with required cardinality dimensions
Validate at least:
- run counts by workflow type/lifecycle,
- transition counts/failures,
- command counts/failures/timeouts,
- child launch counts/failures,
- duration histograms,
- active run gauges.

## B-OBS-003: Tracing spans represent workflow hierarchy
- root span per run,
- transition spans,
- command invocation spans,
- nested child workflow spans,
- trace context propagated through child launches.

---

## 11) Security and Multi-Tenancy (Out of Scope)

Security and multi-tenancy are not goals of this project and are intentionally excluded from the behavior catalog.

---

## 12) CLI Behaviors (`apps/workflow-cli`)

## B-CLI-001: `workflow run` starts run via server API
CLI command sends expected payload and surfaces run id/lifecycle.

## B-CLI-002: `workflow runs list` reflects server-side active filter
CLI output matches API filtered results.

## B-CLI-003: `workflow runs events --follow` streams incremental events
CLI follow mode renders new events in server order and handles reconnect/errors according to policy.

## B-CLI-004: `workflow inspect --graph` resolves definition metadata
CLI can fetch graph metadata and print/export a representation from definition endpoint.

---

## 13) End-to-End Golden Scenarios

These scenarios should be implemented as top-level E2E tests because they validate multiple behavior families at once.

## GS-001: Happy path run with child and command
1. Start parent workflow.
2. Parent transitions into command step and executes allowed command successfully.
3. Parent launches child workflow and awaits completion.
4. Parent completes.

Must assert:
- API run summary lifecycle progression to `completed`.
- Parent + child event streams complete and linked.
- Command events/logs present with stdio capture and duration.
- Run tree endpoint shows completed hierarchy.
- Metrics/traces emitted for run/transition/command/child.

## GS-002: Child failure propagation default
1. Start parent that launches known-failing child.
2. Child fails.
3. Parent fails by default policy.

Must assert:
- `child.failed` and `workflow.failed` visibility.
- Error payload persisted and queryable.
- Final run states consistent across summary/tree/events.

## GS-003: Pause, resume, then completion
1. Start long-running workflow.
2. Pause while running.
3. Verify eventual `paused` and no new child launch allowed while paused/transitional.
4. Resume.
5. Verify `workflow.resumed` then continue to completion.

Must assert exact lifecycle checkpoint events and 409 behavior for invalid lifecycle calls.

## GS-004: Cancellation propagation
1. Start parent with active child.
2. Cancel parent.
3. Verify propagated cancellation to descendants.
4. Verify terminal `cancelled` states and events.

## GS-005: Crash recovery reconciliation
1. Start workflow and force abrupt server stop mid-run.
2. Restart server.
3. Confirm startup reconciliation executes before accepting new work.
4. Trigger reconcile endpoint manually again.

Must assert:
- idempotent reconciliation,
- lifecycle transitions through `recovering` where appropriate,
- no duplicate logical progression,
- consistent final run state.

---

## 14) Coverage Matrix (Spec Acceptance Criteria → E2E Behaviors)

1. Decoupled package build/publish without server internals → `B-LOAD-001`, `B-LOAD-002`.
2. Dynamic loading + start by type → `B-LOAD-001`, `B-START-001`.
3. Parent launches child and awaits typed result → `B-CHILD-001`.
4. API exposes current state, children, linear events → `B-API-001`, `B-API-002`, `B-CHILD-003`.
5. API supports flowchart data → `B-API-005` + dynamic endpoints (`B-API-001..003`).
6. Logging/telemetry hooks for major operations → `B-OBS-001..003`.
7. Workflow command execution + policy + observability → `B-CMD-001..004`.
8. User CLI independent of workflow step commands → `B-CLI-001..004`.
9. Cooperative cancellation + parent propagation + cancelled terminal event → `B-LIFE-006`, `B-CHILD-004`, `GS-004`.
10. Pause/resume/recovery lifecycle + endpoints → `B-LIFE-001..008`, `GS-003`, `GS-005`.
11. Required lifecycle checkpoint events emitted → `B-LIFE-001`, `B-LIFE-003`, `B-LIFE-007`.

---

## 15) Exit Criteria for MVP E2E Suite

MVP is considered behaviorally complete when:
- All critical behaviors in sections 2–10 pass in CI for at least one reference workflow package.
- Golden scenarios `GS-001` through `GS-005` pass reliably.
- Failures provide enough diagnostics via events/logs/traces to identify root cause without code-level debugging.
