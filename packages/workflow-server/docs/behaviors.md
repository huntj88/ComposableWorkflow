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
- `packages/workflow-api-types` built and importable by server, CLI, and web consumers.
- At least one workflow package dynamically loadable by server.
- Test package includes:
  - a simple success workflow,
  - a workflow with deterministic failure,
  - a parent workflow that launches a child workflow,
  - a workflow step that invokes `ctx.runCommand(...)`,
  - a workflow that requests human feedback via `server.human-feedback.v1` child launch.

## 1.2 Assertion Types
Each behavior should validate all relevant dimensions:
1. **API contract** (status code + response payload shape + value semantics).
2. **Shared contract conformance** (server, CLI, and web consumers import transport DTOs from `@composable-workflow/workflow-api-types`; no local DTO duplication for covered endpoints).
3. **Persistence** (`workflow_runs`, `workflow_events`, required `workflow_run_children`, and snapshots if enabled).
4. **Event stream correctness** (event type, ordering, sequence monotonicity, linkage fields).
5. **Observability** (logs/metrics/traces emitted with required fields).

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
**Then** create-success response is `201` and contains `runId`, `workflowType`, `workflowVersion`, lifecycle `running`, and `startedAt`
**And** acceptance implies execution has started immediately (no operational pending queue state)
**And** `workflow.started` appears in events for that run as the execution-start checkpoint
**And** `workflow_runs` contains corresponding row

## B-START-002: Unknown workflow type is rejected
**Given** `workflowType` does not exist in registry
**When** start API is called
**Then** request fails with `404` using shared `ErrorEnvelope`
**And** `ErrorEnvelope.code` is `WORKFLOW_TYPE_NOT_FOUND`
**And** no run row is created
**And** no run events are emitted

## B-START-003: Idempotent start returns same logical run
**Given** same `workflowType`, same semantic input, and same `idempotencyKey`
**When** start API is called repeatedly within idempotency window/policy
**Then** first accepted create returns `201` and server does not create duplicate execution
**And** subsequent idempotent matches return `200` with the same `StartWorkflowResponse` shape and run identity
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

## 6) Human Feedback Orchestration Behaviors

## B-HFB-001: Parent requests human feedback via child workflow launch
**Given** a parent workflow state handler calls `ctx.launchChild(...)` with `workflowType = "server.human-feedback.v1"`
**When** the feedback child run starts
**Then** `child.started` is emitted on the parent stream with child run linkage
**And** `human-feedback.requested` is emitted with request metadata (`prompt`, `options`, `questionId`, linkage fields)
**And** feedback child run lifecycle is `running` with request status `awaiting_response`
**And** `human_feedback_requests` projection row is created in the same transaction boundary as the request event append

## B-HFB-002: Feedback response completes child and unblocks parent
**Given** a pending feedback child run with status `awaiting_response`
**When** a valid response is submitted via `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond`
**Then** `human-feedback.received` event is emitted with response payload
**And** feedback child run completes with output `status: "responded"`
**And** parent run resumes from the waiting checkpoint
**And** `human_feedback_requests` projection status becomes `responded`

## B-HFB-003: First-response-wins idempotency for feedback
**Given** a feedback child run that has already accepted a response (status `responded`)
**When** another response submission is attempted for the same `feedbackRunId`
**Then** response is `409` with current feedback status and terminal timestamp metadata (`respondedAt` or `cancelledAt`)
**And** no duplicate `human-feedback.received` event is emitted
**And** projection row is unchanged

## B-HFB-004: Invalid selectedOptionIds rejected with 400
**Given** a pending feedback request with defined option IDs
**When** response includes `selectedOptionIds` that do not match offered option IDs
**Then** response is `400` with validation error details
**And** feedback status remains `awaiting_response`
**And** no `human-feedback.received` event is emitted

## B-HFB-005: Feedback waits have no timeout in MVP
**Given** a pending feedback request
**When** no response or cancellation is submitted
**Then** request remains in `awaiting_response` indefinitely
**And** feedback child run lifecycle remains `running`

## B-HFB-006: Pause/cancel during feedback wait preserves correlation state
**Given** a parent run waiting on a feedback child run
**When** parent pause or cancel is requested
**Then** cooperative lifecycle rules apply (human-feedback waits are safe points)
**And** pending feedback correlation state is not lost
**And** feedback child run follows parent cancellation propagation policy if cancelled

## B-HFB-007: Recovery reconcile restores waiting feedback runs without duplication
**Given** a feedback child run was interrupted mid-wait (crash/shutdown)
**When** recovery reconciliation executes
**Then** waiting feedback run is restored to consistent state
**And** no duplicate question issuance or response acceptance occurs
**And** first-response-wins idempotency is preserved after recovery

## B-HFB-008: Feedback cancellation returns cancelled output
**Given** a pending feedback request
**When** cancellation occurs (direct or parent-propagated)
**Then** `human-feedback.cancelled` event is emitted
**And** feedback child run completes with output `status: "cancelled"`
**And** `human_feedback_requests` projection status becomes `cancelled`
**And** parent cancellation policies apply

## B-HFB-009: Numbered options are contiguous starting at 1
**Given** a numbered-options feedback request payload
**When** request metadata is validated prior to issuance
**Then** option `id` values are unique contiguous integers starting at `1`
**And** invalid numbering is rejected before a pending feedback request is created

## B-HFB-010: Asked numbered questions are immutable and clarifications append new questionId
**Given** a numbered-options question has already been issued
**When** clarification is required
**Then** the previously issued question text/options are not mutated
**And** a new question is appended with a new `questionId`
**And** clarification follow-up is scheduled as the immediate next queue item

## B-HFB-011: Feedback responses require content and remain single-select
**Given** a pending completion-confirmation numbered-options feedback request
**When** a response is submitted with neither `selectedOptionIds` nor non-empty `text`
**Then** response is `400` with validation details
**And** feedback status remains `awaiting_response`
**And** no `human-feedback.received` event is emitted
**When** a response is submitted with more than one `selectedOptionIds` value
**Then** response is `400` with validation details
**And** feedback status remains `awaiting_response`

## B-HFB-012: Feedback response text has no protocol max in MVP
**Given** a pending feedback request
**When** a response with large `response.text` is submitted
**Then** protocol-level validation does not reject solely due to text length
**And** if implementation-specific operational limits are enforced, the endpoint returns `400` with validation details

---

## 7) Workflow-Invoked Command Execution Behaviors

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

## 8) Lifecycle Control Behaviors (Pause/Resume/Cancel/Recovery)

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

## 9) API Read/Query Behaviors

## B-API-001: Run summary reflects current authoritative state
Endpoint: `GET /api/v1/workflows/runs/{runId}`
- Returns lifecycle, current state, parent reference, direct children summary, counters, timestamps.
- Values are consistent with latest persisted events/snapshots.

## B-API-002: Linear events endpoint supports filtering and pagination
Endpoint: `GET /api/v1/workflows/runs/{runId}/events`
- Honors `cursor`, `limit`, `eventType`, `since`, `until`.
- Maintains strict ordering by sequence.
- Pagination is stable (no duplicates/missing events for same cursor contract).

## B-API-003: Logs endpoint supports filtering and links logs to run transitions/events
Endpoint: `GET /api/v1/workflows/runs/{runId}/logs`
- Query contract: `GetRunLogsQuery` from `workflow-api-types` with `severity?`, `since?`, `until?`, `correlationId?`, `eventId?`.
- Omitted query fields are unconstrained; multiple provided filters are AND-combined.
- Query parameter keys must match the `GetRunLogsQuery` contract exactly.
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

## B-API-011: List definitions endpoint returns sorted registered summaries
Endpoint: `GET /api/v1/workflows/definitions`
- Response contract is `ListDefinitionsResponse` with `items: DefinitionSummary[]`.
- Results are ordered by `workflowType ASC`.
- Each item includes at least `workflowType` and `workflowVersion`.
- Endpoint serves start-flow discovery without requiring prior workflowType knowledge.

## B-API-006: Live stream delivers near-real-time ordered events via WorkflowStreamFrame
Endpoint: `GET /api/v1/workflows/runs/{runId}/stream` (SSE)
- SSE frame contract: `event: workflow-event`, `id: <cursor>`, `data: <WorkflowStreamFrame JSON>`.
- Emits new events in sequence order.
- Supports optional `cursor?` (opaque base64url) and `eventType?` query parameters.
- Reconnection with `cursor=<lastSeenCursor>` resumes with events strictly after cursor boundary (no-loss, ordered delivery).
- Client adapters must parse SSE `data` payloads as `WorkflowStreamFrame` from `@composable-workflow/workflow-api-types`.

## B-API-007: Submit feedback response endpoint validates and accepts
Endpoint: `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond`
- Valid only while feedback run lifecycle is `running` and status is `awaiting_response`.
- Request body must include `response` conforming to `numbered-options-response-input.schema.json`.
- Missing `questionId` returns `400`.
- Empty responses (no selected option and no non-empty text) return `400` without terminalizing feedback.
- Invalid `selectedOptionIds` (not matching offered options) returns `400` without terminalizing feedback.
- `selectedOptionIds` must contain at most one option or return `400` without terminalizing feedback.
- Covered `400`/`404` failures for this endpoint use `ErrorEnvelope` with required `code`, `message`, and `requestId` fields.
- No protocol-level `response.text` maximum is enforced in MVP; implementation-specific limits may return `400` with validation details.
- First accepted response returns success; subsequent submissions return `409` with current status and terminal timestamps.
- On acceptance, feedback child run completes and parent may resume at next safe point.

## B-API-008: Get feedback request status returns metadata and linkage
Endpoint: `GET /api/v1/human-feedback/requests/{feedbackRunId}`
- Returns feedback request lifecycle/status, prompt/options metadata, response payload (if present), and parent run linkage fields.
- Values are consistent with `human_feedback_requests` projection and canonical event stream.

## B-API-009: List feedback requests for a run returns run-scoped paginated results
Endpoint: `GET /api/v1/workflows/runs/{runId}/feedback-requests`
- Purpose: deterministic feedback discovery for run dashboards without prior `feedbackRunId` knowledge.
- Query: `status` (optional CSV of `awaiting_response|responded|cancelled`; default `awaiting_response,responded`), `limit` (optional, default `50`, max `200`), `cursor` (optional pagination cursor).
- Response contract: `ListRunFeedbackRequestsResponse` with `items: RunFeedbackRequestSummary[]` and `nextCursor?: string`.
- Each `RunFeedbackRequestSummary` includes: `feedbackRunId`, `parentRunId`, `questionId`, `status`, `requestedAt`, `respondedAt?`, `cancelledAt?`, `respondedBy?`, `prompt`, `options`, `constraints`.
- Source is the `human_feedback_requests` projection keyed by `parent_run_id`.
- Results are sorted by `requested_at DESC`, tie-break by `feedback_run_id ASC`.
- Endpoint must not require event-stream replay on read path.
- Pagination must be stable across reconnect/retry so clients can avoid duplicates.
- Endpoint must return only feedback requests associated with the specified run lineage and must not degrade to global/unscoped listing behavior.

## B-API-010: Runtime overlay references resolve against static graph identifiers
Endpoints: `GET /api/v1/workflows/definitions/{workflowType}`, `GET /api/v1/workflows/runs/{runId}/events`, `GET /api/v1/workflows/runs/{runId}/stream`
- `RunSummaryResponse.currentState` and runtime state/transition references used for overlays resolve against identifiers declared by the same definition metadata payload.
- Runtime state/transition references in `state.entered`, `transition.completed`, and `transition.failed` resolve against identifiers declared by definition metadata.
- Unknown state/transition references are surfaced as contract violations and are not silently ignored.
- Transition ordering in definition metadata is stable for a given definition version and supports deterministic edge identity reconstruction.
- Static graph validity invariants hold for definition metadata used by overlays: `initialState` resolves to a declared state identifier and definition state identifiers are unique/stable for the definition version.
- Event ordering (`sequence` + cursor resume semantics) preserves deterministic overlay reconstruction after reconnect.

---

## 10) Persistence and Durability Behaviors

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

## B-DATA-004: Feedback projection consistency with canonical events
**Given** human feedback lifecycle events exist in `workflow_events`
**When** querying `human_feedback_requests` projection table
**Then** projection status matches canonical event-derived status (`human-feedback.requested` → `awaiting_response`, `human-feedback.received` → `responded`, `human-feedback.cancelled` → `cancelled`)
**And** projection writes occur in the same transaction boundary as corresponding feedback event appends
**And** duplicate retries/recovery do not create divergent projection rows
**And** `question_id` is stable for the lifecycle of its feedback run

---

## 11) Observability Behaviors

## B-OBS-001: Logging hook invoked for major lifecycle and transition points
- start/end/fail/cancel
- state entry
- transition request/success/failure
- command start/complete/fail
- child start/complete/fail
- human feedback request/receive/cancel
- custom workflow logs

Assertions:
- Required log fields present (`runId`, `workflowType`, `state`, `transition`, `eventId`, `sequence`, timestamp, severity, message).

## B-OBS-002: Metrics emitted with required cardinality dimensions
Validate at least:
- run counts by workflow type/lifecycle,
- transition counts/failures,
- command counts/failures/timeouts,
- child launch counts/failures,
- human feedback request/response/cancellation counts,
- duration histograms,
- active run gauges.

## B-OBS-003: Tracing spans represent workflow hierarchy
- root span per run,
- transition spans,
- command invocation spans,
- nested child workflow spans,
- trace context propagated through child launches.

---

## 12) Security and Multi-Tenancy (Out of Scope)

Security and multi-tenancy are not goals of this project and are intentionally excluded from the behavior catalog.

---

## 13) Shared API Contract Behaviors (`workflow-api-types`)

## B-CONTRACT-001: Server imports shared transport contracts for all Section 4 endpoints
**Given** `packages/workflow-api-types` exports transport request/response/query/event types for all Section 4 endpoints
**When** `workflow-server` compiles and serves those endpoints
**Then** route handler/service boundaries reference types from `@composable-workflow/workflow-api-types`
**And** no local transport DTO redefinitions exist for covered endpoints

## B-CONTRACT-002: CLI and web consume shared contracts without local duplication
**Given** `apps/workflow-cli` and `apps/workflow-web` depend on `@composable-workflow/workflow-api-types`
**When** those consumers compile against covered endpoint contracts
**Then** no local transport DTO interfaces/types are declared for endpoints covered by workflow-api-types-spec.md Sections 2 and server spec Section 4
**And** typecheck/build fails on missing or drifted shared contract exports

## B-CONTRACT-003: SSE stream frames use WorkflowStreamFrame contract
**Given** SSE `data` payloads emitted by `GET /api/v1/workflows/runs/{runId}/stream`
**When** server serializes and client adapters parse stream payloads
**Then** serialization and parsing use the `WorkflowStreamFrame` contract from `@composable-workflow/workflow-api-types`
**And** client adapters do not define local mirror interfaces for stream frames

## B-CONTRACT-004: Endpoint contract lock matches web spec exactly
**Given** the endpoint contract lock table in workflow-api-types-spec.md Section 2
**And** the web spec endpoint matrix in `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2
**When** both tables are compared
**Then** method, path, and shared contract names match exactly
**And** CI fails on any drift between the two tables

## B-CONTRACT-005: Breaking contract changes require semver-major bump
**Given** an incompatible change to a transport contract in `workflow-api-types`
**When** the change is versioned
**Then** `workflow-api-types` receives a semver-major version bump
**And** server/client compile-time checks reflect the change

## B-CONTRACT-006: Coordinated contract updates span three artifacts
**Given** a change to endpoint path, payload shape, or event frame schema
**When** the change is implemented
**Then** coordinated updates land in: (1) `packages/workflow-api-types`, (2) `docs/typescript-server-workflow-spec.md`, (3) `apps/workflow-web/docs/workflow-web-spec.md`
**And** implementation is not considered complete until all three are updated

## B-CONTRACT-007: Graph identity and overlay semantics stay cross-spec aligned
**Given** graph identity and overlay semantics are defined in workflow-api-types-spec.md §5 and web spec Sections 6.6 and 8.5
**When** graph contracts, transition ordering semantics, or overlay event-reference semantics change
**Then** updates are coordinated across `packages/workflow-api-types`, workflow-api-types-spec.md §5, and web spec Sections 6.6 and 8.5
**And** CI drift checks fail when those graph contract artifacts diverge, including drift against graph identity surfaces exported by `@composable-workflow/workflow-api-types`

---

## 14) CLI Behaviors (`apps/workflow-cli`)

## B-CLI-001: `workflow run` starts run via server API
CLI command sends expected payload and surfaces run id/lifecycle.

## B-CLI-002: `workflow runs list` reflects server-side active filter
CLI output matches API filtered results.

## B-CLI-003: `workflow runs events --follow` streams incremental events
CLI follow mode renders new events in server order and handles reconnect/errors according to policy.

## B-CLI-004: `workflow inspect --graph` resolves definition metadata
CLI can fetch graph metadata and print/export a representation from definition endpoint.

## B-CLI-005: `workflow feedback list` lists pending feedback requests
CLI command queries server API and displays pending human feedback requests with status, prompt, and parent run linkage.

## B-CLI-006: `workflow feedback respond` submits feedback response
CLI command submits a response payload for a given `feedbackRunId` via the server feedback response API and surfaces acceptance/rejection result.

---

## 15) End-to-End Golden Scenarios

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

## GS-006: Human feedback request-response round trip
1. Start parent workflow that reaches a state requiring human feedback.
2. Parent launches `server.human-feedback.v1` child with prompt/options.
3. Verify feedback child run is `running` and `human_feedback_requests` status is `awaiting_response`.
4. Verify `GET /api/v1/workflows/runs/{runId}/feedback-requests` returns the pending feedback request for the parent run.
5. Submit valid response via feedback response endpoint.
6. Verify feedback child completes with `status: "responded"`.
7. Verify parent resumes and eventually completes.

Must assert:
- `human-feedback.requested` and `human-feedback.received` events are emitted with correct linkage.
- `human_feedback_requests` projection transitions `awaiting_response` → `responded`.
- Parent-child event streams are linked and complete.
- Duplicate response submission returns `409`.
- Run tree endpoint shows feedback child within parent hierarchy.
- Invalid `selectedOptionIds` submission returns `400` without terminalizing feedback.

## GS-007: Feedback cancellation propagation
1. Start parent workflow that launches a feedback child.
2. Cancel parent while feedback is pending.
3. Verify cancellation propagates to feedback child.
4. Verify both runs reach terminal `cancelled` state.

Must assert:
- `human-feedback.cancelled` event emitted.
- Feedback projection status becomes `cancelled`.
- No response acceptance after cancellation.
- Final states consistent across summary/tree/events.

---

## 16) Coverage Matrix (Spec Acceptance Criteria → E2E Behaviors)

1. Decoupled package build/publish without server internals → `B-LOAD-001`, `B-LOAD-002`.
2. Dynamic loading + start by type → `B-LOAD-001`, `B-START-001`.
3. Parent launches child and awaits typed result → `B-CHILD-001`.
4. API exposes current state, children, linear events → `B-API-001`, `B-API-002`, `B-CHILD-003`.
5. API exposes definition list + definition runtime data satisfying workflow-api-types-spec.md §5 invariants → `B-API-005`, `B-API-010`, `B-API-011`, dynamic endpoints (`B-API-001..003`, `B-API-006`).
6. Logging/telemetry hooks for major operations → `B-OBS-001..003`.
7. Workflow command execution + policy + observability → `B-CMD-001..004`.
8. User CLI independent of workflow step commands → `B-CLI-001..004`.
9. Cooperative cancellation + parent propagation + cancelled terminal event → `B-LIFE-006`, `B-CHILD-004`, `GS-004`.
10. Pause/resume/recovery lifecycle + endpoints → `B-LIFE-001..008`, `GS-003`, `GS-005`.
11. Required lifecycle checkpoint events emitted → `B-LIFE-001`, `B-LIFE-003`, `B-LIFE-007`.
12. Human feedback collection available as server-owned default workflow contract → `B-HFB-001..012`, `B-API-007`, `B-API-008`, `B-DATA-004`, `B-CLI-005`, `B-CLI-006`, `GS-006`, `GS-007`.
13. Server, CLI, and web consumers use shared transport DTOs from `workflow-api-types` → `B-CONTRACT-001`, `B-CONTRACT-002`.
14. API endpoints documented with consistent absolute `/api/v1` path prefixes → all `B-API-*` behaviors verify absolute paths.
15. API contract updates versioned via `workflow-api-types` with semver-major for breaking changes → `B-CONTRACT-005`.
16. Run-scoped feedback discovery endpoint returns paginated data → `B-API-009`.
17. Every Section 4 endpoint has matching shared transport contract → `B-CONTRACT-001`, `B-CONTRACT-002`.
18. Endpoints and shared contracts in workflow-api-types-spec.md Section 2 match web spec Section 6.2 exactly → `B-CONTRACT-004`.
19. CI fails on contract drift between spec and `workflow-api-types` → `B-CONTRACT-004`, `B-CONTRACT-006`.
20. Feedback requests endpoint enforces run-scoped filtering → `B-API-009`.
21. Server graph contracts stay aligned with web graph requirements and shared exports → `B-API-010`, `B-CONTRACT-007`.

---

## 17) Exit Criteria for MVP E2E Suite

MVP is considered behaviorally complete when:
- All critical behaviors in sections 2–11 pass in CI for at least one reference workflow package.
- Shared API contract behaviors in section 13 are verified (type conformance, no local DTO duplication, contract lock parity).
- Golden scenarios `GS-001` through `GS-007` pass reliably.
- Human feedback orchestration behaviors (`B-HFB-001..012`) pass for at least one feedback-requesting workflow.
- Run-scoped feedback discovery (`B-API-009`) returns correct paginated, filtered results.
- Graph contract alignment behaviors (`B-API-010`, `B-CONTRACT-007`) are verified for deterministic static/dynamic overlay reconstruction and cross-spec lock parity.
- Failures provide enough diagnostics via events/logs/traces to identify root cause without code-level debugging.
