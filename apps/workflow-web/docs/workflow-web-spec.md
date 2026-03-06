# Workflow Web SPA Specification

Related documents:
- `apps/workflow-web/docs/workflow-web-behaviors.md`
- `apps/workflow-web/docs/workflow-web-integration-tests.md`
- `packages/workflow-server/docs/typescript-server-workflow-spec.md`

## 1) Objective and Scope

Build a Vite-based React SPA in `apps/workflow-web` that communicates with `workflow-server` to support workflow operations and observability for composable finite state machines (FSMs), including child workflow relationships and human response interactions.

In scope:
- route-based UI for run listing, run detail inspection, definition metadata inspection, and workflow start,
- workflow start flow: selecting a workflow type, providing required input, and submitting to create a new run,
- real-time run updates via SSE and deterministic snapshot + stream synchronization,
- run-level observability (events and logs),
- linear transition history with iteration-aware state tracking and inline collapsible child state machine transitions,
- run-scoped human feedback discovery and response submission,
- strict use of shared transport contracts from `packages/workflow-api-types`,
- path/contract alignment with `packages/workflow-server/docs/typescript-server-workflow-spec.md`.

## 2) Non-Goals

- Changing workflow execution semantics in `workflow-server`.
- Replacing CLI capabilities in `apps/workflow-cli`.
- Implementing authn/authz, RBAC, or multi-tenancy.
- Implementing workflow authoring/editing or definition management in the browser.
- Offline-first behavior.

## 3) Constraints and Assumptions

### 3.1 Mandatory Constraints
- The application must be a React SPA using Vite.
- App implementation changes for this feature must stay in `apps/workflow-web`.
- For covered endpoints, request/response/query/event DTOs must be imported from `@composable-workflow/workflow-api-types` (`packages/workflow-api-types`).
- Endpoint and DTO decisions in this spec must be kept consistent with `packages/workflow-server/docs/typescript-server-workflow-spec.md` in the same change set.

### 3.2 Assumptions
- API base path is `/api/v1` for all REST and SSE routes.
- Stream endpoint is `GET /api/v1/workflows/runs/{runId}/stream`.
- Server is source of truth; the UI performs read-heavy operations with explicit write actions (cancel run, submit feedback).
- Stream ordering and resume behavior are provided by server `sequence` + cursor semantics.
- Stream cursor values are opaque cursor strings (base64url-compatible) and must be treated as transport tokens, not parsed by the client.

## 4) Functional Scope

### 4.1 Routes
- Routing implementation must use `HashRouter`; canonical URL forms are `#/runs`, `#/runs/:runId`, and `#/definitions/:workflowType`.
- `/runs`
  - default view lists active runs,
  - supports lifecycle and workflow type filtering,
  - selecting a row navigates to `/runs/:runId`.
- `/runs/:runId`
  - run dashboard for a single root or child run.
- `/definitions/:workflowType`
  - definition metadata view.

### 4.2 Start Workflow Flow

The start workflow capability is accessible from the `/runs` route via a primary action (e.g., button). It enables users to create a new workflow run by:

1. **Workflow Type Selection** — user selects a workflow type from the set of registered definitions available on the server, fetched via `GET /api/v1/workflows/definitions`.
2. **Input Entry** — user provides the workflow input as a JSON payload in a code editor (e.g., `textarea` with monospace font or embedded JSON editor). Since `StartWorkflowRequest.input` is `unknown` (workflow-specific and untyped at the API layer), the UI must accept arbitrary valid JSON.
3. **Optional Fields** — user may optionally provide:
   - `idempotencyKey`: a string for deduplication of start requests,
   - `metadata`: a JSON object of arbitrary key/value pairs for run-level metadata.
4. **Submission** — on submit, the UI sends `POST /api/v1/workflows/start` with the composed `StartWorkflowRequest`.
5. **Post-Submit Navigation** — on successful `201` (new run created) or `200` (existing run via idempotency), the UI navigates to `#/runs/:runId` using the `runId` from `StartWorkflowResponse`.

#### 4.2.1 Start Workflow UI Rules
- The start action must be reachable from `/runs` without requiring the user to know a workflow type in advance.
- Workflow type selection must present available types fetched from the server; manual free-text entry of workflow type is not required but may be supported as a fallback.
- The JSON input editor must validate that user input is syntactically valid JSON before enabling submission.
- Submit button must be disabled until: (a) a workflow type is selected, and (b) the input field contains valid JSON.
- On `404` (workflow type not found), display the server error message and keep user input intact for correction.
- On `400` (validation error), display `ErrorEnvelope` details and preserve all form field values.
- On network/transport failure, display a panel-scoped error with retry action and preserve form state.
- The start workflow surface may be implemented as a dialog/modal, a drawer, or a dedicated inline section on the `/runs` route; the specific layout pattern is implementation-discretionary as long as it does not require a separate route.

### 4.3 Required Panels on `/runs/:runId`
1. **Run Summary**
   - run id, workflow type/version, lifecycle, current state, parent reference, timestamps, progress counters.
2. **Execution Tree**
   - recursive parent/child tree with per-node lifecycle and current state.
3. **Events Timeline**
   - ordered events with sequence/cursor metadata and filter support.
4. **Transition History**
   - linear chronological view of all state transitions for the current run, with inline collapsible child state machine transitions (see Section 8.6).
5. **Logs**
   - structured log entries correlated with events/transitions when identifiers are present.
  - windowed display with scrollable viewport and incremental loading (see Section 8.6).
6. **Human Feedback**
   - lists run-scoped requests, displays status/prompt/options, allows submission for `awaiting_response`.

### 4.4 Required User Actions
- Start a new workflow run (via the start workflow flow in Section 4.2).
- Refresh run snapshot data.
- Cancel an active run.
- Submit a human response (`questionId`, optional `selectedOptionIds`, optional `text`, `respondedBy`).
- Navigate between parent/child runs via execution tree links, always routing to the selected run URL (`#/runs/:runId`).

## 5) Data Flow and Synchronization

### 5.1 Initial Load Sequence (`/runs/:runId`)
1. `GET /api/v1/workflows/runs/{runId}`
2. `GET /api/v1/workflows/runs/{runId}/tree`
3. `GET /api/v1/workflows/runs/{runId}/events?limit=<N>`
4. `GET /api/v1/workflows/runs/{runId}/logs`
5. `GET /api/v1/workflows/definitions/{workflowType}`
6. `GET /api/v1/workflows/runs/{runId}/feedback-requests?status=awaiting_response,responded&limit=<N>`
7. Open SSE: `GET /api/v1/workflows/runs/{runId}/stream`

### 5.2 Live Update Rules
- Persist `lastSeenCursor` from each accepted stream frame.
- Reconnect using `cursor=<lastSeenCursor>`.
- Deduplicate by `(runId, sequence)` across reconnects.
- Apply updates incrementally (no full page reload) to summary, tree, timeline, transition history, logs, and feedback panel status.

### 5.3 Stream Wire Protocol and Resume Semantics (Normative)
- `GET /api/v1/workflows/runs/{runId}/stream` uses SSE with:
  - `event: workflow-event`,
  - `id: <cursor>`,
  - `data: <WorkflowStreamFrame JSON>`.
- Client stream adapters must parse `data` payloads directly as `WorkflowStreamFrame` from `@composable-workflow/workflow-api-types`.
- The SSE `id` field is the cursor value to persist as `lastSeenCursor` after a frame is accepted.
- Reconnect must send `cursor=<lastSeenCursor>` and must not send locally synthesized cursors.
- Resume boundary semantics are strict: server resumes with events whose `sequence` is strictly greater than the cursor boundary.
- Optional stream query filter `eventType` may be used only with server-supported values; unsupported values must surface a request error state.

### 5.4 Failure and Recovery Rules
- SSE disconnection shows a non-blocking reconnect state and retries with exponential backoff.
- Reconnect policy constants are normative:
  - initial delay: `500ms`,
  - multiplier: `2x`,
  - jitter strategy: `full-jitter` per attempt,
  - maximum delay cap: `30s`,
  - stream-health transition to `stale`: no accepted stream frame for `45s`.
- REST failures are panel-scoped with explicit retry actions.
- `404` on run summary renders a run-not-found state with navigation back to `/runs`.
- Feedback submission:
  - `400`: show server validation details and keep user input,
  - `409`: show terminal status and disable further submission for that request.

### 5.5 Deterministic Ordering and Deduplication Rules (Normative)
- Event ordering for timeline/overlay must be driven by `sequence` (not wall-clock timestamps).
- For duplicate deliveries of the same `(runId, sequence)`, keep the first accepted frame/event and ignore subsequent duplicates.
- If an incoming stream event has `sequence <= highestAcceptedSequence(runId)`, it is treated as duplicate/out-of-order and must not regress rendered state.
- Cursor advancement is monotonic: client must never move `lastSeenCursor` backward.

## 6) Interfaces and Contracts

### 6.1 Shared Contract Ownership
The web app must consume shared contracts from `@composable-workflow/workflow-api-types`, including:
- `ListDefinitionsResponse`, `DefinitionSummary`
- `StartWorkflowRequest`, `StartWorkflowResponse`
- `ListRunsResponse`
- `RunSummaryResponse`
- `RunTreeResponse`, `RunTreeNode`
- `RunEventsResponse`, `WorkflowEventDto`, `EventCursor`
- `GetRunLogsQuery`, `RunLogsResponse`, `WorkflowLogEntryDto`
- `WorkflowLifecycle`
- `WorkflowDefinitionResponse`
- `CancelRunResponse`
- `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse`, `SubmitHumanFeedbackResponseConflict`
- `HumanFeedbackRequestStatusResponse`
- `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse`, `RunFeedbackRequestSummary`
- `WorkflowStreamEvent`, `WorkflowStreamFrame`
- `ErrorEnvelope`

For covered endpoints, local duplicate DTO definitions in `apps/workflow-web` are prohibited.

### 6.2 Endpoint Usage Matrix (Normative)

| Capability | Method + Path | Shared Contract(s) |
| --- | --- | --- |
| List registered definitions | `GET /api/v1/workflows/definitions` | `ListDefinitionsResponse` |
| Start workflow | `POST /api/v1/workflows/start` | `StartWorkflowRequest`, `StartWorkflowResponse` |
| List runs | `GET /api/v1/workflows/runs?lifecycle=running&workflowType=...` | `ListRunsResponse` |
| Run summary | `GET /api/v1/workflows/runs/{runId}` | `RunSummaryResponse` |
| Run tree | `GET /api/v1/workflows/runs/{runId}/tree` | `RunTreeResponse` |
| Event history | `GET /api/v1/workflows/runs/{runId}/events` | `RunEventsResponse` |
| Logs | `GET /api/v1/workflows/runs/{runId}/logs` | `GetRunLogsQuery`, `RunLogsResponse` |
| Definition metadata | `GET /api/v1/workflows/definitions/{workflowType}` | `WorkflowDefinitionResponse` |
| Cancel run | `POST /api/v1/workflows/runs/{runId}/cancel` | `CancelRunResponse` |
| Live stream | `GET /api/v1/workflows/runs/{runId}/stream` (SSE) | `WorkflowStreamFrame` |
| Feedback requests by run | `GET /api/v1/workflows/runs/{runId}/feedback-requests` | `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse` |
| Submit feedback response | `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond` | `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse` |
| Feedback request status | `GET /api/v1/human-feedback/requests/{feedbackRunId}` | `HumanFeedbackRequestStatusResponse` |

Additional normative rules:
- `GET /api/v1/workflows/runs/{runId}/feedback-requests` must return only feedback requests whose parent/root linkage resolves to the specified `{runId}`.
- Feedback discovery for the dashboard must not depend on global feedback listing endpoints.

### 6.3 Human Feedback Contract Rules
- `response.questionId` is required.
- If `selectedOptionIds` is provided, each id must exist in the corresponding request option set.
- UI allows optional `text`; protocol-level length enforcement is server-driven.
- First accepted response wins; duplicate post-accept submissions are terminal conflicts.
- `feedbackRunId` discovery uses `GET /api/v1/workflows/runs/{runId}/feedback-requests` (no manual user entry requirement).
- `selectedOptionIds` must contain at most one option for all feedback question types; multi-select is not supported. Invalid cardinality (zero when an option is required, or more than one) is a `400` validation error.
- The UI must enforce single-select at the control level: option selection controls (e.g., radio buttons) must not allow more than one option to be selected simultaneously. The UI must never send a `selectedOptionIds` array with more than one element.
- Invalid `selectedOptionIds` or other validation failures must leave feedback request status unchanged as pending (`awaiting_response`) until a valid terminal action is accepted.
- `409` submit responses are terminal conflicts and must include current feedback status plus terminal timestamp metadata (`respondedAt` or `cancelledAt`) for conflict rendering.

### 6.3.1 Start Workflow Contract Rules
- `workflowType` is required and must be a non-empty trimmed string.
- `input` is required and must be valid JSON; the UI must enforce JSON syntax validation before submission. The server does not enforce input schema — validation is workflow-specific and occurs at runtime.
- `idempotencyKey` is optional; when provided, must be a non-empty trimmed string. The server returns `200` with the existing `StartWorkflowResponse` if a run with the same key already exists.
- `metadata` is optional; when provided, must be a JSON object (`Record<string, unknown>`).
- On `201`, the response contains `runId`, `workflowType`, `workflowVersion`, `lifecycle` (always `"running"`), and `startedAt`.
- On `200` (idempotent match), the response shape is identical to `201`.
- On `404`, `ErrorEnvelope.code` is `WORKFLOW_TYPE_NOT_FOUND`.

### 6.4 Cross-Spec Consistency Rules
- Section 6.2 of this spec and workflow-api-types-spec.md §2 + server spec Section 4 of `packages/workflow-server/docs/typescript-server-workflow-spec.md` must stay path- and contract-consistent for web-visible endpoints.
- Contract evolution order: `packages/workflow-api-types` -> server spec + server handlers -> web spec + web client usage.
- Any endpoint/path/payload change is incomplete until both specs reflect the same contract.

### 6.5 Web Client Transport Layer Contract (Normative)
The SPA transport layer must provide typed operations whose request/response/event surfaces are sourced from `@composable-workflow/workflow-api-types`:

- `listDefinitions() -> Promise<ListDefinitionsResponse>`
- `startWorkflow(body: StartWorkflowRequest) -> Promise<StartWorkflowResponse>`
- `listRuns(query) -> Promise<ListRunsResponse>`
- `getRunSummary(runId) -> Promise<RunSummaryResponse>`
- `getRunTree(runId) -> Promise<RunTreeResponse>`
- `getRunEvents(runId, query) -> Promise<RunEventsResponse>`
- `getRunLogs(runId, query?: GetRunLogsQuery) -> Promise<RunLogsResponse>`
- `getWorkflowDefinition(workflowType) -> Promise<WorkflowDefinitionResponse>`
- `cancelRun(runId) -> Promise<CancelRunResponse>`
- `listRunFeedbackRequests(runId, query) -> Promise<ListRunFeedbackRequestsResponse>`
- `submitHumanFeedbackResponse(feedbackRunId, body) -> Promise<SubmitHumanFeedbackResponseResponse>`
- `getHumanFeedbackRequestStatus(feedbackRunId) -> Promise<HumanFeedbackRequestStatusResponse>`
- `openRunStream(runId, options) -> AsyncIterable<WorkflowStreamFrame>` (or equivalent callback abstraction with the same payload contract)

Rules:
- Public transport function signatures for covered endpoints must not expose `any`/`unknown` where a shared contract type exists.
- Endpoint URL construction and query serialization must preserve the field names defined in shared query contracts.
- `GetRunLogsQuery` serialization must use exact contract keys: `severity`, `since`, `until`, `correlationId`, and `eventId`.
- Runtime mapping from `WorkflowStreamFrame` to UI state must be exhaustive for the closed variant set in Section 6.9.
- Log filter query serialization must be derived from `GetRunLogsQuery` (no local remapped filter keys for server requests).

### 6.6 Definition Metadata Handling (Normative)
- `WorkflowDefinitionResponse` consumed by the SPA must provide stable metadata for a given `(workflowType, definitionVersion|workflowVersion)`.
- Definition payloads shown in the browser must render as accessible metadata lists/tables without requiring client-side DTO reshaping outside shared contracts.
- Missing or internally inconsistent definition metadata required by the UI must surface as a visible definition-view error state in development/test builds.

### 6.7 Query, Filter, and Pagination Semantics (Normative)
- `GET /api/v1/workflows/definitions` returns all registered workflow definitions as an array of summaries.
  - No query parameters are required.
  - Response ordering is `workflowType ASC`.
  - Response contract: `ListDefinitionsResponse` containing an array of `DefinitionSummary` (each with at minimum `workflowType`, `workflowVersion`, and optional display metadata).
- `POST /api/v1/workflows/start` request semantics:
  - `workflowType` (required, non-empty string): identifies the workflow definition to instantiate.
  - `input` (required, any valid JSON value): workflow-specific input payload; no client-side schema validation beyond JSON syntax.
  - `idempotencyKey` (optional, non-empty string): deduplication token; if a run with the same key exists, server returns `200` with the existing run instead of `201`.
  - `metadata` (optional, `Record<string, unknown>`): arbitrary key/value pairs attached to the run.
  - Success response codes: `201` (created) or `200` (idempotent match).
  - Error response codes: `404` (`WORKFLOW_TYPE_NOT_FOUND`), `400` (validation error).
- `GET /api/v1/workflows/runs/{runId}/logs` query semantics are governed by `GetRunLogsQuery`:
  - `limit` default is `100`, max is `500`,
  - `severity` in `debug|info|warn|error`,
  - `since` is inclusive lower bound,
  - `until` is exclusive upper bound,
  - `correlationId` and `eventId` are exact-match filters,
  - omitted fields are unconstrained,
  - provided fields are AND-combined,
  - response ordering is `timestamp ASC` with tie-break `eventId ASC` when timestamps match.
- `GET /api/v1/workflows/runs/{runId}/feedback-requests` query semantics:
  - default `status=awaiting_response,responded`,
  - optional CSV `status` values are `awaiting_response|responded|cancelled`,
  - default `limit=50`, max `200`,
  - optional `cursor` for pagination,
  - response ordering is `requestedAt DESC` with tie-break `feedbackRunId ASC`,
  - pagination must remain stable across retry/reconnect.
- `GET /api/v1/workflows/runs/{runId}/events` supports `cursor`, `limit`, `eventType`, `since`, and `until`.
  - `limit` default is `100`, max is `500`,
  - response ordering is append order by `sequence ASC`.
- Endpoint query key names must match shared contracts exactly; local key aliases/remapping for server requests are prohibited.

### 6.8 Error Contract Handling (Normative)
- Shared transport error envelope contract is normative for covered panel-level errors:
  - `ErrorEnvelope = { code: string; message: string; details?: Record<string, unknown>; requestId: string }`.
- Panel error rendering for covered `400/404` failures must parse and display `ErrorEnvelope.code`, `ErrorEnvelope.message`, and `ErrorEnvelope.requestId`, preserving `details` for diagnostics/UI hints.
- Feedback submit conflicts (`409`) must use shared `SubmitHumanFeedbackResponseConflict` contract and render `status` plus terminal timestamps (`respondedAt` or `cancelledAt`).
- Validation and conflict errors are panel-scoped and must not clear in-progress draft response text unless submission was accepted.
- Start workflow error handling:
  - `404` (`WORKFLOW_TYPE_NOT_FOUND`): render `ErrorEnvelope.message` in the start form context and preserve all form field values for correction.
  - `400` (validation error): render `ErrorEnvelope` details in the start form context and preserve all form field values.
  - Network/transport failures: display a scoped error with retry action; preserve form state.

### 6.9 Stream Event Variant Coverage (Normative, Closed Set)
For run dashboard behavior, stream/event processing must support this closed event-type set:
- `workflow.started`
- `workflow.pausing`
- `workflow.paused`
- `workflow.resuming`
- `workflow.resumed`
- `workflow.recovering`
- `workflow.recovered`
- `workflow.cancelling`
- `state.entered`
- `transition.requested`
- `transition.completed`
- `transition.failed`
- `human-feedback.requested`
- `human-feedback.received`
- `human-feedback.cancelled`
- `command.started`
- `command.completed`
- `command.failed`
- `child.started`
- `child.completed`
- `child.failed`
- `workflow.completed`
- `workflow.failed`
- `workflow.cancelled`
- `log`

Rules:
- Variants in this set must have deterministic runtime handling in summary/tree/timeline/transition-history/log/feedback projections where applicable.
- In development/test builds, any stream variant outside this closed set must fail visibly (not silently dropped).
- Expanding this set requires synchronized updates to this section, web behavior docs, and integration test coverage.

### 6.10 Field-Level DTO Authority (Normative)
For covered endpoints/events, field-level transport semantics are authoritative in `@composable-workflow/workflow-api-types` exports and associated schemas.

Rules:
- Required/optional/nullability semantics are sourced from shared contract types/schemas, not duplicated local DTO definitions.
- Timestamp, cursor, and enum field serialization/parse semantics are sourced from shared contracts.
- Web transport/state mapping must not introduce ad-hoc local field aliases or transport-shape rewrites for covered DTOs.
- Any field-level contract change is incomplete until `workflow-api-types` is updated first and this spec remains consistent with those exports.

## 7) Technologies and Libraries (Normative)

### 7.1 Application Foundation
- Framework: `react` + `react-dom` (TypeScript-first React SPA).
- Build tool: `vite`.
- Language/tooling: `typescript` with strict type checking enabled for app source.

### 7.2 Routing and Data/State Management
- Routing: `react-router-dom` `HashRouter` with route definitions for `/runs`, `/runs/:runId`, and `/definitions/:workflowType`.
- Server-state management and caching: `@tanstack/react-query`.
- Local UI state (filters, panel UI state, selected tree node, timeline view options): `zustand`.

### 7.3 UI Component and Visualization Stack
- Component library: `@mui/material` for composable, accessible base UI controls and layout primitives.
- Lightweight trend/summary charting for observability counters: `recharts`.

### 7.4 Streaming/Transport Client
- SSE client: browser `EventSource` wrapped by a typed transport adapter in `apps/workflow-web`.
- Adapter responsibilities:
  - map each SSE `data` payload to `WorkflowStreamFrame`,
  - expose reconnect with `lastSeenCursor`,
  - enforce typed event dispatch with no `any`/`unknown` leakage.

### 7.5 Library Usage Rules
- Endpoint request/response/query/event DTOs must come from `@composable-workflow/workflow-api-types`.
- UI libraries may be wrapped for composition, but wrappers must not redefine transport DTOs.
- Any replacement of the libraries listed in Sections 7.2-7.4 requires a spec update in the same change set.

## 8) Observability UX and Information Architecture

### 8.1 Dashboard Layout
`/runs/:runId` must use a 3-zone information architecture:
1. **Top summary strip** (always visible): run identity, lifecycle, current state, parent link, last update timestamp, reconnect status.
2. **Primary analysis area** (left/center): execution tree as the main causal-navigation surface.
3. **Operational details area** (right/bottom): events timeline, transition history, logs, and human feedback panels with independent scrolling.

### 8.2 Information Hierarchy Rules
- Current lifecycle/state and reconnect health are highest-priority, visible without scrolling.
- Causal navigation order: summary -> execution tree -> transition history -> matching event/log records.
- Human feedback requests with `awaiting_response` status must be visually prioritized above terminal feedback items.

### 8.3 Visual Affordances for State Transitions
- Lifecycle statuses from shared `WorkflowLifecycle` (`running`, `pausing`, `paused`, `resuming`, `recovering`, `cancelling`, `completed`, `failed`, `cancelled`) must have consistent color/icon tokens across summary, tree, timeline, and feedback.
- Stream health badge states: `connected`, `reconnecting`, `stale`.

### 8.4 Responsiveness and Density
- Desktop-first dense observability layout at `>=1280px`.
- At `<1280px`, panels stack in priority order: summary -> tree -> transition history -> events/logs -> feedback.
- No panel may collapse essential status information (run lifecycle, current state, awaiting feedback count).

### 8.5 Definition Metadata Presentation (Normative)

- `/definitions/:workflowType` renders `WorkflowDefinitionResponse` as accessible metadata, not as a rendered FSM diagram.
- The definition view must present workflow identity, version, state inventory, transition inventory, and child-workflow references when present.
- State and transition data may be rendered in lists, tables, or grouped metadata sections, but must preserve server-provided identifiers and labels from shared contracts.
- If definition metadata required for rendering is missing or inconsistent, the definition view must surface a visible panel error state with retry.

### 8.6 Transition History Panel (Normative)

The Transition History panel provides a **linear chronological view** of all state transitions for a workflow run, including transitions from child state machines rendered inline. This panel provides a sequential, time-ordered narrative of actual execution.

#### 8.6.1 Data Source and Ordering
- Transition history entries are derived from the run's `RunEventsResponse` events, filtered to transition-relevant event types: `state.entered`, `transition.requested`, `transition.completed`, `transition.failed`, `child.started`, `child.completed`, `child.failed`.
- Entries are ordered strictly by `sequence ASC` (not wall-clock timestamps), consistent with Section 5.5 ordering rules.
- Live updates from `WorkflowStreamFrame` events append new transition entries incrementally without rebuilding the full list.

#### 8.6.2 Linear Entry Rendering
- Each entry displays: sequence number, event type badge, source state, target state (for transitions), timestamp, and iteration indicator when the same state/transition has been visited more than once.
- **Iteration indicators**: When a state or transition appears multiple times (due to loops/cycles), each occurrence displays an iteration counter (e.g., `StateA (visit 3)`) so the user can distinguish repeated traversals of the same state.
- Iteration counting is per-state within a single run: the Nth `state.entered` event for a given `stateId` is labeled as visit N.

#### 8.6.3 Inline Child State Machine Transitions
- When the parent run's history includes `child.started` events, the child run's transition history is embedded inline at the position of the `child.started` event in the parent's linear sequence.
- Child transition blocks are rendered as **collapsible sections** within the parent's linear history:
  - Collapsed (default): shows a single summary row indicating the child workflow type, child run ID, child lifecycle status, and total transition count within the child.
  - Expanded: shows the full linear transition history of the child run, indented or visually nested to distinguish child transitions from parent transitions.
- Child runs that themselves have children (nested child state machines) follow the same collapsible pattern recursively. Each nesting level increases the visual indentation depth.
- Collapse/expand state is local UI state (persisted in Zustand) and preserved across live stream updates.
- Child transition data is fetched from `GET /api/v1/workflows/runs/{childRunId}/events` when the child section is expanded for the first time; subsequent expansions use cached data updated by stream events if the child run is live.

#### 8.6.4 Interaction with Other Panels
- Selecting a transition entry in the history panel must scroll the events timeline to the matching event.
- If the selected transition belongs to a child run, clicking it offers a navigation action to drill down to the child run's dashboard (`#/runs/:childRunId`).
- The transition history panel respects the same time-range filters (`since`, `until`) as the events timeline when link-filters mode (Section 9.3) is enabled.

#### 8.6.5 Visual Encoding
- Parent-level transitions use standard row styling.
- Child-level transitions use indented styling with a left-border accent matching the child run's workflow type color token.
- Failed transitions (`transition.failed`) use error styling consistent with Section 10.2 error-token rules.
- Loop/cycle indicators: transitions that return to a previously visited state display a loop icon badge.
- Active/in-progress transitions (the most recent `transition.requested` without a corresponding `transition.completed`) display a pulsing/loading indicator.

### 8.7 Logs Panel (Normative)

The Logs panel displays structured log entries correlated with events/transitions. Its scrolling and windowing behavior must match the Events Timeline pattern.

#### 8.7.1 Windowed Display and Scrolling
- The Logs panel must display a limited initial window of log entries (governed by the `limit` parameter in `GetRunLogsQuery`, default `100`).
- Entries beyond the initial window are not rendered until the user scrolls; the panel must support incremental loading (scroll-to-load-more or explicit "load more" action) using cursor-based pagination from the server.
- The visible viewport must show a bounded set of entries without requiring scrolling to see the most recent entries (newest entries are visible by default when auto-follow is active or on initial load).
- The panel must be independently scrollable within its layout zone (Section 8.1 zone 3) without affecting scroll position of other panels.

#### 8.7.2 Live Update Behavior
- New log entries arriving via `WorkflowStreamFrame` (`log` event type) append incrementally without rebuilding the full list.
- If the user is scrolled away from the latest entries, a non-blocking "new logs" indicator with jump-to-latest action must appear (consistent with Section 9.4 events timeline behavior).
- If the user is at the bottom of the log list (auto-follow position), new entries auto-scroll into view.
- Scroll position is preserved across live stream updates when the user is not in auto-follow position.

#### 8.7.3 Filtering Integration
- Log filters (`severity`, `since`, `until`, `correlationId`, `eventId`) as specified in Section 9.3 apply to the windowed view and reset the scroll position to the top of filtered results.
- Applying or clearing filters re-fetches logs from the server with the updated `GetRunLogsQuery` and resets the pagination window.

## 9) User Interaction Patterns

### 9.1 Feedback Discovery and Response Flow
- Users discover actionable feedback from:
  1) dashboard feedback panel,
  2) timeline entries linked to feedback request creation.
- Selecting a feedback request opens full prompt/options + response form in-context.
- When a feedback request includes options, the UI must render them as **single-select radio buttons** (not checkboxes or multi-select controls). Only one option may be selected at a time; selecting a new option deselects the previous one.
- Submit action must stay disabled until mandatory fields are valid (at minimum `questionId` present, and exactly one option selected when options are present).
- On successful submit, UI status transitions to terminal state without page reload and form controls become read-only.

### 9.2 Tree Navigation
- Selecting a tree node must navigate to the selected run route (`#/runs/:runId`) and update:
  - run summary context,
  - event/log filters to the selected run.
- Parent/child navigation must preserve browser history and deep links (back/forward returns prior run route context).

### 9.3 Event/Log Filtering and Correlation
- Event timeline filters: event type, time range (`since/until`), and free-text search.
- Log filters use `GetRunLogsQuery` fields: `severity`, `since`, `until`, `correlationId`, and `eventId` when present.
- Applying a filter in one panel must not silently mutate filters in unrelated panels unless explicit "link filters" mode is enabled.
- Event time-range requests must preserve shared query field names (`since`, `until`) without transport aliasing.
- Log time-range semantics follow Section 6.7 (`since` inclusive, `until` exclusive).
- Event free-text search semantics are normative:
  - matching is case-insensitive substring,
  - match domain includes `eventType`, `state`, `transition.name`, string-valued `payload` fields, and `error.message` when present,
  - empty or whitespace-only search input is treated as no text filter.
- Link-filters mode semantics are normative:
  - mode is explicit and user-controlled (OFF by default),
  - when ON, only `since` and `until` are bidirectionally synchronized between events/log panels,
  - correlation context may synchronize when available (`eventId` and `correlationId`) without rewriting unrelated panel-specific filters,
  - event/log domain-specific filters (for example `eventType`, `severity`, free-text search) remain panel-local,
  - unsupported/missing correlated fields are ignored (no implicit fallback key remapping).

### 9.4 Realtime Update Behavior
- New stream events append in chronological sequence and preserve user scroll position unless user opted into auto-follow.
- If user is scrolled away from latest entries, show a non-blocking "new updates" indicator with jump action.
- Reconnect retries must not interrupt in-progress user input (for example feedback draft text).

## 10) Style Guidelines and Visual Design Direction

### 10.1 Visual Direction
- Theme style: dark-by-default observability console with optional light theme parity.
- Tone: operational clarity over decorative UI; emphasize status readability and causality tracing.
- Spacing/typography scale must favor dense but scannable data presentation.

### 10.2 Design Tokens and Consistency Rules
- Use a centralized token set for colors, spacing, typography, and status badges.
- Lifecycle token mapping must be identical wherever lifecycle is rendered.
- Validation and error tokens must distinguish:
  - request validation (`400`),
  - terminal conflict (`409`),
  - transport/network failure.

### 10.3 Accessibility and Input Ergonomics
- Keyboard navigation is required for:
  - run list row selection,
  - execution tree traversal,
  - feedback option selection and submission,
  - start workflow form (type selection, input entry, submission).
- Visible focus indicators must meet WCAG contrast expectations.
- Status updates from SSE should use accessible announcements for critical state changes (for example transition to `failed`).
- Live announcement semantics are normative:
  - non-terminal stream/lifecycle updates use `aria-live="polite"`,
  - critical terminal failure transitions (for example `workflow.failed`) use `aria-live="assertive"`.
- Focus management semantics are normative:
  - after panel-level retry actions, focus returns to the retry trigger in that panel,
  - after successful feedback submit, focus moves to the updated feedback status region for the selected request,
  - after run-not-found navigation action, focus lands on the primary heading/action region in `/runs`.

### 10.4 Empty, Loading, and Error States
- Empty-state copy must be task-oriented (for example "No awaiting feedback for this run").
- Loading states must be panel-scoped skeletons/spinners, not full-page blockers after initial route load.
- Error states must include explicit retry actions and preserve current filter/form state.

## 11) Acceptance Criteria (Testable)

1. `apps/workflow-web` is a Vite React SPA and builds via workspace build tooling.
2. Feature app-code changes are limited to `apps/workflow-web` (documentation update to `packages/workflow-server/docs/typescript-server-workflow-spec.md` is allowed/required).
3. Covered web transport contracts are imported from `@composable-workflow/workflow-api-types` with no duplicate local DTOs for those endpoints.
4. Every REST/SSE call used by this feature uses absolute `/api/v1`-prefixed paths exactly as listed in Section 6.2.
5. `/runs` renders server-backed run data and supports lifecycle/workflow type filters.
6. `/runs/:runId` renders all six required panels from server data (summary, tree, events, transition history, logs, feedback).
7. On live runs, SSE updates apply incrementally without full page refresh and preserve strict event ordering by sequence.
8. After stream reconnect, resume uses `lastSeenCursor` and duplicate events are not re-rendered.
9. Panel-level failures remain isolated; one panel failure does not blank the full dashboard.
10. `404` run summary produces a dedicated run-not-found state with navigation back to `/runs`.
11. Feedback submit `400` shows validation details and preserves user-entered values.
12. Feedback submit `409` shows terminal status and disables additional submissions for that request.
13. Successful feedback submit updates the visible request status to responded/accepted without manual reload.
14. `packages/workflow-server/docs/typescript-server-workflow-spec.md` documents matching paths and shared DTO ownership for every endpoint in Section 6.2.
15. Covered web transport function signatures use shared DTO/query/event exports directly (no local duplicate DTO definitions for those surfaces).
16. Stream processing logic handles all server-emitted `WorkflowStreamEvent` variants used for run dashboard updates; unsupported variants fail visibly in development/test instead of being silently dropped.
17. `apps/workflow-web/package.json` declares and uses the stack defined in Sections 7.2-7.4 (`react-router-dom`, `@tanstack/react-query`, `zustand`, `@mui/material`, `recharts`) unless the spec is updated in the same change set.
18. SSE integration is implemented via a typed `EventSource` adapter that converts payloads to `WorkflowStreamFrame` and reconnects with `cursor=<lastSeenCursor>`.
19. `/runs/:runId` layout satisfies Section 8.1 3-zone architecture at desktop width (`>=1280px`) and Section 8.4 stacked priority order below `1280px`.
20. Awaiting human feedback requests are rendered with higher visual priority than responded/cancelled feedback entries.
21. Route handling uses `HashRouter`, and selecting run list rows or execution-tree nodes always navigates to the selected run route (`#/runs/:runId`) with browser back/forward preserving prior run contexts.
22. Event and log filters support the dimensions in Section 9.3, and log request serialization uses shared `GetRunLogsQuery` field names without local key remapping; panel filters remain independent unless an explicit link mode is enabled.
23. Lifecycle and stream-health visual tokens are consistent across all panels and map to shared `WorkflowLifecycle` statuses plus stream-health states defined in Sections 8.3 and 10.2.
24. Keyboard-only users can complete run list navigation, tree traversal, and feedback response submission with visible focus indicators.
31. `packages/workflow-api-types` exists in the workspace and exports all transport contracts listed in Section 6.1.
32. `GET /api/v1/workflows/runs/{runId}/feedback-requests` is consumed as a run-scoped discovery API and returns only feedback requests linked to the specified run.
33. Definition metadata handling in Section 6.6 preserves shared-contract semantics and surfaces visible errors for invalid payloads.
34. SSE processing uses wire semantics in Section 5.3 (`event: workflow-event`, `id=<cursor>`, `data=<WorkflowStreamFrame JSON>`) and persists cursor from accepted frame IDs.
35. Stream resume boundary semantics are strictly greater-than cursor `sequence`; duplicate/out-of-order events do not regress rendered state (Section 5.5).
36. Run-feedback discovery pagination uses Section 6.7 defaults/limits and stable ordering (`requestedAt DESC`, tie-break `feedbackRunId ASC`).
37. `400` and `409` feedback submit handling follows Sections 6.3 and 6.8, including terminal timestamp display for conflicts and preservation of draft input for validation failures.
38. Stream reconnect behavior follows Section 5.4 constants (initial `500ms`, `2x` growth, full-jitter, `30s` cap, and `45s` stale threshold).
39. Stream processing handles the closed variant set in Section 6.9; unsupported variants fail visibly in development/test.
40. Events/logs pagination and ordering follow Section 6.7 defaults and limits (default `100`, max `500`) with deterministic ordering rules.
41. Event free-text filtering follows Section 9.3 case-insensitive substring semantics across the defined event fields.
42. Link-filters mode follows Section 9.3 explicit-toggle semantics (default OFF, sync only `since/until` plus available correlation context, preserve panel-local domain filters).
43. Covered panel error handling follows Section 6.8 shared contracts (`ErrorEnvelope` for `400/404` and `SubmitHumanFeedbackResponseConflict` for feedback `409`).
44. Accessibility behavior follows Section 10.3 live-region and focus-management semantics (`polite`/`assertive` announcement levels and deterministic post-action focus targets).
45. Field-level DTO semantics for covered endpoints/events are sourced from `@composable-workflow/workflow-api-types` per Section 6.10 (no local transport-shape duplication or ad-hoc remapping).
46. A "start workflow" action is accessible from `/runs` and opens a form allowing the user to select a workflow type, enter JSON input, and optionally provide an idempotency key and metadata.
47. Workflow type selection in the start form is populated from `GET /api/v1/workflows/definitions` using `ListDefinitionsResponse`; manual free-text entry is not the only option.
48. The start workflow JSON input editor validates syntactic JSON correctness before enabling submission; the submit button is disabled when workflow type is empty or input is not valid JSON.
49. `POST /api/v1/workflows/start` uses `StartWorkflowRequest` and `StartWorkflowResponse` from shared contracts with no local DTO duplication.
50. On successful start (`201` or `200`), the UI navigates to `#/runs/:runId` using the `runId` from `StartWorkflowResponse`.
51. Start workflow `404` (`WORKFLOW_TYPE_NOT_FOUND`) displays the error message and preserves all form field values.
52. Start workflow `400` displays `ErrorEnvelope` validation details and preserves all form field values.
53. Start workflow transport and error handling follow Sections 6.7 and 6.8 contracts.
54. `@composable-workflow/workflow-api-types` exports `ListDefinitionsResponse`, `DefinitionSummary`, `StartWorkflowRequest`, and `StartWorkflowResponse` as listed in Section 6.1.
55. Keyboard-only users can complete the start workflow flow (open form, select type, enter input, submit) with visible focus indicators.
69. The Transition History panel renders a linear chronological list of all transition-relevant events (`state.entered`, `transition.requested`, `transition.completed`, `transition.failed`, `child.started`, `child.completed`, `child.failed`) ordered by `sequence ASC`.
70. Repeated visits to the same state in the Transition History panel display iteration counters (e.g., `StateA (visit 3)`) to distinguish loop iterations.
71. Child state machine transitions appear inline in the parent's Transition History as collapsible sections; collapsed view shows a summary row (child workflow type, run ID, lifecycle, transition count); expanded view shows the full child transition history indented.
72. Nested child state machines (children of children) render recursively with increasing indentation depth in the Transition History panel.
73. Collapse/expand state for child transition sections is preserved across live stream updates.
74. Selecting a transition entry in the Transition History panel scrolls the events timeline to the matching event.
75. The Transition History panel respects time-range filters (`since`, `until`) when link-filters mode is enabled.
76. Human feedback option selection uses single-select radio button controls; the UI never allows more than one option to be selected simultaneously, and never sends a `selectedOptionIds` array with more than one element.
77. The Logs panel displays a limited initial window of entries (default `100` per `GetRunLogsQuery.limit`) and supports scroll-to-load-more or explicit pagination for additional entries; all log entries are not rendered at once.
78. The Logs panel is independently scrollable within its layout zone and does not affect scroll position of other panels.
79. When the user is scrolled away from the latest log entries, a non-blocking "new logs" indicator with jump-to-latest action is displayed (matching events timeline behavior per Section 9.4).
80. New log entries from `WorkflowStreamFrame` (`log` event type) append incrementally; auto-follow scrolls new entries into view when the user is at the bottom of the list.
81. Applying or clearing log filters re-fetches from the server with updated `GetRunLogsQuery` and resets the pagination window and scroll position.
