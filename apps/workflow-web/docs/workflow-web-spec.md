# Workflow Web SPA Specification

Related documents:
- `apps/workflow-web/docs/workflow-web-behaviors.md`
- `apps/workflow-web/docs/workflow-web-integration-tests.md`
- `packages/workflow-server/docs/typescript-server-workflow-spec.md`

## 1) Objective and Scope

Build a Vite-based React SPA in `apps/workflow-web` that communicates with `workflow-server` to support workflow operations and observability for composable finite state machines (FSMs), including child workflow relationships and human response interactions.

In scope:
- route-based UI for run listing, run detail inspection, and definition graph visualization,
- real-time run updates via SSE and deterministic snapshot + stream synchronization,
- run-level observability (events and logs),
- run-scoped human feedback discovery and response submission,
- strict use of shared transport contracts from `packages/workflow-api-types`,
- path/contract alignment with `packages/workflow-server/docs/typescript-server-workflow-spec.md`.

## 2) Non-Goals

- Changing workflow execution semantics in `workflow-server`.
- Replacing CLI capabilities in `apps/workflow-cli`.
- Implementing authn/authz, RBAC, or multi-tenancy.
- Implementing workflow authoring/editing in the browser.
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
  - definition graph and metadata view.

### 4.2 Required Panels on `/runs/:runId`
1. **Run Summary**
   - run id, workflow type/version, lifecycle, current state, parent reference, timestamps, progress counters.
2. **Execution Tree**
   - recursive parent/child tree with per-node lifecycle and current state.
3. **FSM Graph**
   - static definition graph with dynamic overlay for active state and recent transitions.
4. **Events Timeline**
   - ordered events with sequence/cursor metadata and filter support.
5. **Logs**
   - structured log entries correlated with events/transitions when identifiers are present.
6. **Human Feedback**
   - lists run-scoped requests, displays status/prompt/options, allows submission for `awaiting_response`.

### 4.3 Required User Actions
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
- Apply updates incrementally (no full page reload) to summary, tree, graph overlay, timeline, and feedback panel status.

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
- For numbered-options completion-confirmation questions, `selectedOptionIds` must contain exactly one option; invalid cardinality is a `400` validation error.
- Invalid `selectedOptionIds` or other validation failures must leave feedback request status unchanged as pending (`awaiting_response`) until a valid terminal action is accepted.
- `409` submit responses are terminal conflicts and must include current feedback status plus terminal timestamp metadata (`respondedAt` or `cancelledAt`) for conflict rendering.

### 6.4 Cross-Spec Consistency Rules
- Section 6.2 of this spec and Sections 6.9.1 + 8 of `packages/workflow-server/docs/typescript-server-workflow-spec.md` must stay path- and contract-consistent for web-visible endpoints.
- Section 6.6 + 8.5 of this spec and Section 10 of `packages/workflow-server/docs/typescript-server-workflow-spec.md` must stay consistent for FSM identity and overlay semantics.
- Contract evolution order: `packages/workflow-api-types` -> server spec + server handlers -> web spec + web client usage.
- Any endpoint/path/payload change is incomplete until both specs reflect the same contract.

### 6.5 Web Client Transport Layer Contract (Normative)
The SPA transport layer must provide typed operations whose request/response/event surfaces are sourced from `@composable-workflow/workflow-api-types`:

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

### 6.6 FSM Contract Invariants (Normative)
- `WorkflowDefinitionResponse` consumed by the SPA must provide stable state and transition identity for a given `(workflowType, definitionVersion|workflowVersion)`.
- Definition state identifiers must be unique within the definition payload.
- Definition transition ordering must be stable for the same definition version; this ordering is the source for `transitionOrdinal` used in deterministic edge IDs.
- `RunSummaryResponse.currentState` and runtime event references used for graph overlays must reference definition state/transition identifiers from the same `WorkflowDefinitionResponse`.
- Contract violations (for example duplicate state IDs, missing referenced states, or unstable transition identity across repeated fetches for the same definition version) must be surfaced as visible graph-panel error states in development/test builds.

### 6.7 Query, Filter, and Pagination Semantics (Normative)
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
- Variants in this set must have deterministic runtime handling in summary/tree/graph/timeline/log/feedback projections where applicable.
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
- FSM graph and execution-tree graph rendering: `reactflow`.
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
2. **Primary analysis area** (left/center): execution tree and FSM graph as the main causal-navigation surfaces.
3. **Operational details area** (right/bottom): events timeline, logs, and human feedback panels with independent scrolling.

### 8.2 Information Hierarchy Rules
- Current lifecycle/state and reconnect health are highest-priority, visible without scrolling.
- Causal navigation order: summary -> execution tree -> active graph node/transition -> matching event/log records.
- Human feedback requests with `awaiting_response` status must be visually prioritized above terminal feedback items.

### 8.3 Visual Affordances for State Transitions
- Active state node: distinct high-contrast highlight.
- Recently traversed transitions: time-decayed highlight (newest strongest emphasis).
- Lifecycle statuses from shared `WorkflowLifecycle` (`running`, `pausing`, `paused`, `resuming`, `recovering`, `cancelling`, `completed`, `failed`, `cancelled`) must have consistent color/icon tokens across summary, tree, timeline, and feedback.
- Stream health badge states: `connected`, `reconnecting`, `stale`.

### 8.4 Responsiveness and Density
- Desktop-first dense observability layout at `>=1280px`.
- At `<1280px`, panels stack in priority order: summary -> tree/graph -> events/logs -> feedback.
- No panel may collapse essential status information (run lifecycle, current state, awaiting feedback count).

### 8.5 FSM Graph Rendering Specification (Normative)

#### 8.5.1 Definition-to-React Flow Mapping
- Graph source is `WorkflowDefinitionResponse` from `GET /api/v1/workflows/definitions/{workflowType}`.
- Each definition state maps to exactly one React Flow node with deterministic id format: `{workflowType}::state::{stateId}`.
- Each definition transition maps to exactly one React Flow edge with deterministic id format: `{workflowType}::edge::{fromState}::{toState}::{transitionOrdinal}` where `transitionOrdinal` is the zero-based index of that transition among transitions sharing the same `{fromState,toState}` pair in server-provided transition order.
- Node label precedence: `display metadata label` -> `stateId`.
- Edge label precedence: `transition display label` -> `{fromState} -> {toState}`.
- Node role classification rules:
  - **initial**: definition metadata marks initial state; if metadata is absent, infer from zero inbound transitions,
  - **terminal**: zero outbound transitions,
  - **decision**: more than one outbound transition,
  - **standard**: all other states.
- Child-workflow launch annotations from definition metadata must be preserved in React Flow node/edge `data` payload so UI can render a child-launch affordance.

#### 8.5.2 Layout Algorithm and Determinism
- Layout engine: `dagre` layered directed graph layout.
- Layout direction:
  - `LR` for viewport width `>=1280px`,
  - `TB` for viewport width `<1280px`.
- Layout computation key is `(workflowType, definitionVersion)`; stream updates must not trigger full relayout.
- Pan/zoom and manual viewport position are preserved across runtime overlay updates.
- If layout computation fails, UI must render a panel error state with retry (no silent fallback to random/manual coordinates).

#### 8.5.3 Runtime Overlay Composition
- Static graph data comes only from `WorkflowDefinitionResponse`; runtime state is an overlay layer.
- Overlay sources and merge order:
  1. `RunSummaryResponse.currentState` sets initial active node,
  2. `RunEventsResponse.events` hydrates traversed/failed edges in sequence order,
  3. `WorkflowStreamFrame` events apply incremental updates.
- Required event-to-overlay mapping:
  - `state.entered` -> set active node to payload state id,
  - `transition.completed` -> mark edge as traversed with latest timestamp and increment traverse count,
  - `transition.failed` -> mark edge as failed and attach failure metadata tooltip.
- If runtime events reference a missing state/edge (not present in the definition graph), the UI must show a visible contract-mismatch indicator in the graph panel and record diagnostic details in development logs.
- Contract-mismatch references must never be silently ignored in any build; production may reduce diagnostic verbosity but must preserve visible mismatch indication.

#### 8.5.4 Visual Encoding Rules
- Node shapes:
  - initial: stadium/rounded-pill,
  - decision: diamond,
  - terminal: rounded rectangle with double border,
  - standard: rounded rectangle.
- Node styling:
  - active node uses high-contrast accent + focus ring,
  - inactive nodes use neutral surface token,
  - terminal node outcome styling must align with lifecycle/status tokens where applicable.
- Edge styling:
  - default transition: solid neutral stroke,
  - traversed transition: accent stroke with increased width,
  - failed transition: dashed error stroke,
  - child-launch transition: dotted variant with child-workflow icon/marker.
- Graph must include an always-available legend describing node/edge semantics.

#### 8.5.5 Large FSM Handling
- Large graph threshold is `>120` nodes or `>200` edges.
- At/above threshold, graph enters **performance mode**:
  - disable non-essential edge/node animation,
  - hide edge labels below zoom `0.85`,
  - keep minimap enabled,
  - enable state search/filter by state id or display label.
- Provide an **Active Path Focus** toggle that filters to active node plus two-hop neighbors without mutating the underlying definition graph data.
- Runtime overlay updates must patch only affected nodes/edges; they must not rebuild the full node/edge array for every incoming stream frame.

## 9) User Interaction Patterns

### 9.1 Feedback Discovery and Response Flow
- Users discover actionable feedback from:
  1) dashboard feedback panel,
  2) timeline entries linked to feedback request creation.
- Selecting a feedback request opens full prompt/options + response form in-context.
- Submit action must stay disabled until mandatory fields are valid (at minimum `questionId` present).
- On successful submit, UI status transitions to terminal state without page reload and form controls become read-only.

### 9.2 Tree and Graph Navigation
- Selecting a tree node must navigate to the selected run route (`#/runs/:runId`) and update:
  - run summary context,
  - graph overlay focus,
  - event/log filters to the selected run.
- Parent/child navigation must preserve browser history and deep links (back/forward returns prior run route context).
- Graph node selection must reveal state metadata and linked transitions.

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
  - feedback option selection and submission.
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
6. `/runs/:runId` renders all six required panels from server data (summary, tree, graph, events, logs, feedback).
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
17. `apps/workflow-web/package.json` declares and uses the stack defined in Sections 7.2-7.4 (`react-router-dom`, `@tanstack/react-query`, `zustand`, `@mui/material`, `reactflow`, `recharts`) unless the spec is updated in the same change set.
18. SSE integration is implemented via a typed `EventSource` adapter that converts payloads to `WorkflowStreamFrame` and reconnects with `cursor=<lastSeenCursor>`.
19. `/runs/:runId` layout satisfies Section 8.1 3-zone architecture at desktop width (`>=1280px`) and Section 8.4 stacked priority order below `1280px`.
20. Awaiting human feedback requests are rendered with higher visual priority than responded/cancelled feedback entries.
21. Route handling uses `HashRouter`, and selecting run list rows or execution-tree nodes always navigates to the selected run route (`#/runs/:runId`) with browser back/forward preserving prior run contexts.
22. Event and log filters support the dimensions in Section 9.3, and log request serialization uses shared `GetRunLogsQuery` field names without local key remapping; panel filters remain independent unless an explicit link mode is enabled.
23. Lifecycle and stream-health visual tokens are consistent across all panels and map to shared `WorkflowLifecycle` statuses plus stream-health states defined in Sections 8.3 and 10.2.
24. Keyboard-only users can complete run list navigation, tree traversal, and feedback response submission with visible focus indicators.
25. FSM graph projection is deterministic: node count equals definition state count, edge count equals definition transition count, and node/edge ids follow Section 8.5.1 formats.
26. Graph layout uses `dagre` with `LR` direction at `>=1280px` and `TB` direction below `1280px`; stream updates do not trigger full graph relayout.
27. Runtime overlay behavior matches Section 8.5.3 event mapping (`state.entered`, `transition.completed`, `transition.failed`) and updates graph state without page reload.
28. Child-workflow launch annotations from definition metadata are visually represented on corresponding nodes/edges.
29. Graph panel enters performance mode when the Section 8.5.5 threshold is exceeded and applies all required behaviors (animation reduction, zoom-gated labels, minimap, search).
30. Runtime references to unknown states/transitions produce a visible graph-panel contract-mismatch indicator rather than being silently ignored.
31. `packages/workflow-api-types` exists in the workspace and exports all transport contracts listed in Section 6.1.
32. `GET /api/v1/workflows/runs/{runId}/feedback-requests` is consumed as a run-scoped discovery API and returns only feedback requests linked to the specified run.
33. FSM contract invariants in Section 6.6 hold for each rendered definition: unique state IDs, stable transition ordering for a given definition version, and runtime state/transition references that resolve against the loaded definition.
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
