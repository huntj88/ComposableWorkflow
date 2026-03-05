# Workflow Web SPA Behaviors

This document defines testable web behaviors for the Workflow Web SPA in `apps/workflow-web`.

It is intended to be used as:
- an executable acceptance checklist,
- a source for web integration and E2E test implementation,
- a contract between `apps/workflow-web`, `workflow-server`, and shared transport contracts.

Primary source: `apps/workflow-web/docs/workflow-web-spec.md`.
Cross-spec alignment source: `docs/typescript-server-workflow-spec.md`.

---

## 1) Test Conventions

## 1.1 Environment Baseline
- Workflow server is reachable and exposes `/api/v1` endpoints.
- `packages/workflow-api-types` is built and importable by web/server/CLI.
- Web app is built from `apps/workflow-web` (Vite + React + TypeScript strict mode).
- At least one parent-child workflow and one human-feedback workflow are available.

## 1.2 Assertion Types
Each behavior should validate all relevant dimensions:
1. Route/navigation behavior (`HashRouter`, deep links, back/forward).
2. API transport contract conformance (`@composable-workflow/workflow-api-types`).
3. Live synchronization correctness (snapshot + SSE ordering/resume/dedup).
4. Panel UX behavior (loading/empty/error/retry isolation).
5. Accessibility and keyboard operation of required flows.

---

## 2) Foundation and Routing Behaviors

## B-WEB-001: SPA foundation and dependency stack is present
**Given** the web package at `apps/workflow-web`
**When** dependencies and build configuration are validated
**Then** the app uses Vite + React + TypeScript strict mode
**And** required stack libraries are declared and used: `react-router-dom`, `@tanstack/react-query`, `zustand`, `@mui/material`, `reactflow`, `recharts`

## B-WEB-002: Routing uses HashRouter canonical routes
**Given** the SPA router is initialized
**When** route config is inspected and runtime navigation is exercised
**Then** routing uses `HashRouter`
**And** canonical forms are `#/runs`, `#/runs/:runId`, `#/definitions/:workflowType`

## B-WEB-003: Run list and execution tree selection navigates to run route with history
**Given** a user selects a run row or execution-tree node
**When** selection is activated by mouse or keyboard
**Then** navigation targets `#/runs/:runId`
**And** browser back/forward returns prior run contexts

---

## 3) Run List and Run Dashboard Behaviors

## B-WEB-004: `/runs` lists server-backed runs with lifecycle/workflowType filters
Endpoint: `GET /api/v1/workflows/runs`
- Default view renders active runs.
- Lifecycle and workflow type filters are supported.
- Selecting a row navigates to `#/runs/:runId`.

## B-WEB-005: `/runs/:runId` initializes required snapshot sequence
**Given** route `#/runs/:runId` is opened
**When** initial load executes
**Then** required snapshot calls are made in functional scope order:
1. `GET /api/v1/workflows/runs/{runId}`
2. `GET /api/v1/workflows/runs/{runId}/tree`
3. `GET /api/v1/workflows/runs/{runId}/events?limit=<N>`
4. `GET /api/v1/workflows/runs/{runId}/logs`
5. `GET /api/v1/workflows/definitions/{workflowType}`
6. `GET /api/v1/workflows/runs/{runId}/feedback-requests?...`
7. `GET /api/v1/workflows/runs/{runId}/stream` (SSE open)

## B-WEB-006: Run dashboard renders six required panels
**Given** summary load succeeds
**When** dashboard UI renders
**Then** panel set includes: Run Summary, Execution Tree, FSM Graph, Events Timeline, Logs, Human Feedback

## B-WEB-007: Run summary not-found state for 404
**Given** `GET /api/v1/workflows/runs/{runId}` returns `404`
**When** dashboard resolves summary
**Then** a dedicated run-not-found state is shown
**And** UI provides navigation back to `#/runs`

## B-WEB-008: Panel failures are isolated and retryable
**Given** one panel request fails
**When** other panel requests succeed
**Then** only failing panel shows error state
**And** dashboard is not globally blanked
**And** explicit panel-level retry is available

---

## 4) Transport Contract and Endpoint Behaviors

## B-WEB-009: Covered transport DTOs are imported from shared package
**Given** web transport code for covered endpoints
**When** request/query/response/event typing is validated
**Then** endpoint DTOs come from `@composable-workflow/workflow-api-types`
**And** local duplicate DTO definitions are absent for covered surfaces

## B-WEB-010: Covered endpoint paths are absolute `/api/v1` paths
**Given** web transport URL construction for covered capabilities
**When** paths are inspected
**Then** all calls are absolute and `/api/v1`-prefixed exactly per web spec matrix

## B-WEB-011: Transport signatures are strictly typed with shared contracts
**Given** the normative transport API surface
**When** exported function signatures are typechecked
**Then** signatures use shared contract types directly
**And** signatures do not expose `any`/`unknown` where shared types exist

## B-WEB-012: Logs filter serialization uses exact `GetRunLogsQuery` keys
Endpoint: `GET /api/v1/workflows/runs/{runId}/logs`
- Query serialization keys are exactly: `severity`, `since`, `until`, `correlationId`, `eventId`.
- No remapped local request keys are used.

## B-WEB-013: Feedback discovery uses run-scoped endpoint only
Endpoint: `GET /api/v1/workflows/runs/{runId}/feedback-requests`
- Dashboard feedback discovery depends on run-scoped API.
- Returned requests are linked to specified run lineage.
- Global feedback listing endpoints are not required for dashboard discovery.

## B-WEB-014: Server and web endpoint/contract tables remain lockstep
**Given** server spec Section 6.9.1 + 8 and web spec Section 6.2
**When** compared in CI
**Then** method/path/shared contract entries match exactly
**And** drift is treated as contract failure

---

## 5) Live Stream and Synchronization Behaviors

## B-WEB-015: SSE adapter parses `WorkflowStreamFrame` from EventSource
Endpoint: `GET /api/v1/workflows/runs/{runId}/stream`
- Browser `EventSource` is wrapped by typed adapter.
- SSE payloads are mapped to `WorkflowStreamFrame`.
- Typed dispatch does not leak untyped payload surfaces.
- SSE wire framing follows server contract: `event: workflow-event`, `id: <cursor>`, `data: <WorkflowStreamFrame JSON>`.

## B-WEB-016: Incremental updates are ordered and no full reload is required
**Given** live stream frames are received
**When** UI applies updates
**Then** updates are applied incrementally to summary/tree/graph/timeline/feedback
**And** sequence ordering is preserved
**And** full page reload is not required

## B-WEB-017: Reconnect uses `lastSeenCursor` and deduplicates by `(runId, sequence)`
**Given** stream disconnect/reconnect cycle
**When** adapter reconnects
**Then** reconnect query includes `cursor=<lastSeenCursor>`
**And** duplicate stream frames are not re-rendered
**And** resume processing accepts only events with `sequence` strictly greater than cursor boundary
**And** cursor advancement is monotonic (never moves backward)

## B-WEB-018: Stream health state is visible and non-blocking
**Given** connected/reconnecting/stale stream conditions
**When** health changes occur
**Then** top summary strip displays health badge states (`connected`, `reconnecting`, `stale`)
**And** reconnect flow is non-blocking to in-progress user input

## B-WEB-019: Unsupported stream variants fail visibly in dev/test
**Given** a server-emitted stream event variant not handled by dashboard mapping
**When** frame is processed in development/test builds
**Then** unsupported variant is surfaced visibly
**And** variant is not silently dropped

---

## 6) Human Feedback Behaviors

## B-WEB-020: Awaiting requests are visually prioritized
**Given** feedback panel contains mixed statuses
**When** list is rendered
**Then** `awaiting_response` items are prioritized above terminal statuses

## B-WEB-021: Feedback form validity and submit behavior
**Given** selected feedback request is actionable
**When** response form is edited
**Then** submit stays disabled until required fields are valid (at minimum `questionId`)
**And** successful submit transitions item to terminal/responded without full reload
**And** controls become read-only after success

## B-WEB-022: Feedback submit `400` preserves user input
**Given** response submit returns `400`
**When** validation details are returned by server
**Then** validation details are shown
**And** previously entered form values remain intact
**And** request status remains non-terminal (`awaiting_response`) until a valid terminal action is accepted

## B-WEB-023: Feedback submit `409` terminalizes request interaction
**Given** response submit returns `409`
**When** terminal status metadata is returned
**Then** terminal status is shown to user
**And** additional submissions for that request are disabled
**And** terminal timestamp metadata (`respondedAt` or `cancelledAt`) is shown when provided

---

## 7) Events, Logs, and Filter Behaviors

## B-WEB-024: Event timeline supports required filters and ordered append
- Filters include `eventType`, `since`, `until`, and free-text search.
- Timeline maintains chronological append semantics.
- If user is away from bottom and new events arrive, non-blocking new-updates indicator is shown.

## B-WEB-025: Logs panel supports `GetRunLogsQuery` dimensions
- Filters include `severity`, `since`, `until`, `correlationId`, `eventId`.
- Returned logs preserve event/transition correlation when identifiers exist.

## B-WEB-026: Panel filters remain independent unless explicit link mode enabled
**Given** event and log filter controls
**When** user applies panel-specific filter changes
**Then** unrelated panel filters are unchanged unless explicit "link filters" mode is on

---

## 8) Layout, Visual Tokens, and Accessibility Behaviors

## B-WEB-027: `/runs/:runId` uses required 3-zone information architecture
At desktop width (`>=1280px`):
1. Top summary strip (always visible)
2. Primary analysis area (tree + graph)
3. Operational details area (events/logs/feedback)

At narrow width (`<1280px`):
- Panels stack by required priority order: summary -> tree/graph -> events/logs -> feedback.

## B-WEB-028: Lifecycle and stream health visual tokens are consistent
**Given** lifecycle or stream health is rendered in multiple panels
**When** style tokens are compared
**Then** `WorkflowLifecycle` statuses map to consistent tokens across summary/tree/timeline/feedback
**And** stream-health tokens are consistent with health badge states

## B-WEB-029: Keyboard-only completion for required interactions
Keyboard users can complete:
- run list row navigation and activation,
- execution tree traversal and run navigation,
- feedback option selection and response submission,
with visible focus indicators.

---

## 9) FSM Graph Behaviors

## B-WEB-030: Deterministic definition projection to React Flow nodes and edges
**Given** `WorkflowDefinitionResponse`
**When** graph is projected
**Then** node count equals definition state count
**And** edge count equals definition transition count
**And** deterministic IDs follow formats:
- Node: `{workflowType}::state::{stateId}`
- Edge: `{workflowType}::edge::{fromState}::{toState}::{transitionOrdinal}`

## B-WEB-031: Graph layout determinism and relayout rules
**Given** graph render with dagre layout
**When** viewport width changes or stream updates arrive
**Then** direction is `LR` at `>=1280px` and `TB` below `1280px`
**And** stream overlay updates do not trigger full relayout
**And** pan/zoom viewport state is preserved

## B-WEB-032: Runtime overlay mapping follows event contract
Overlay merge order:
1. `RunSummaryResponse.currentState`
2. `RunEventsResponse.events`
3. `WorkflowStreamFrame` increments

Required mappings:
- `state.entered` -> active node update
- `transition.completed` -> traversed edge metadata update
- `transition.failed` -> failed edge metadata + tooltip

## B-WEB-033: Graph panel surfaces contract mismatches and invariant violations
**Given** runtime references unknown state/edge or definition invariant violations
**When** graph validation executes
**Then** visible contract-mismatch indicator is shown
**And** diagnostics are logged in development/test builds
**And** mismatch indicators are not silently suppressed in production builds

## B-WEB-034: Child-launch annotations are preserved and rendered
**Given** child workflow launch metadata in definition
**When** graph node/edge data is mapped
**Then** child-launch annotation metadata is preserved in mapped data
**And** corresponding visual affordance is rendered

## B-WEB-035: Large graph performance mode is enforced at threshold
Threshold: `>120` nodes or `>200` edges.

At/above threshold:
- non-essential animations are disabled,
- edge labels are hidden below zoom `0.85`,
- minimap remains enabled,
- state search/filter is available,
- active-path focus toggle scopes to active node and two-hop neighbors,
- incoming overlay updates patch affected nodes/edges without full graph rebuild.

---

## 10) Additional Spec-Behavior Coverage

## B-WEB-036: Run dashboard supports explicit refresh and cancel actions
- User can refresh run snapshot data without full route reload.
- User can cancel an active run via `POST /api/v1/workflows/runs/{runId}/cancel`.
- Cancel action is disabled/hidden for non-active terminal lifecycle states.

## B-WEB-037: Run summary and timeline expose required metadata fields
- Run Summary presents: run id, workflow type/version, lifecycle, current state, parent reference, timestamps, and progress counters.
- Events timeline entries include sequence and cursor metadata alongside event details.

## B-WEB-038: Feedback request selection opens full in-context response details
- Selecting a feedback request reveals full prompt, available options, and response form context.
- `selectedOptionIds` validation errors from server are surfaced to user without clearing draft inputs.

## B-WEB-039: Stream reconnect uses exponential backoff with visible non-blocking status
- Stream retry delay follows exponential backoff progression.
- Reconnect state remains visible and does not block navigation or in-progress form edits.

## B-WEB-040: Causal navigation chain remains observable
- Navigation priority remains summary -> execution tree -> active graph state/transition -> correlated event/log records.
- Selecting tree node updates run context, graph focus, and run-scoped event/log correlation.

## B-WEB-041: Graph panel layout failures surface retryable error state
- If `dagre` layout computation fails, graph panel renders visible error state.
- Graph panel exposes explicit retry action; no silent fallback to arbitrary/manual coordinates.

## B-WEB-042: Graph visual encoding includes required legend and node/edge semantics
- Graph legend is always available and explains node/edge semantics.
- Node shape semantics match role rules (initial/decision/terminal/standard).
- Edge style semantics match state (default/traversed/failed/child-launch).

## B-WEB-043: Runtime overlay transition highlighting is time-decayed and deterministic
- Recently traversed transitions use time-decayed emphasis with newest strongest.
- Overlay updates patch affected graph entities deterministically from ordered runtime events.

## B-WEB-044: Graph selection reveals state metadata and linked transitions
- Selecting a graph node reveals state metadata panel/details.
- Linked inbound/outbound transitions for selected state are surfaced.

## B-WEB-045: Realtime timeline append honors scroll mode and auto-follow preference
- New records append chronologically.
- Scroll position is preserved unless auto-follow is enabled.
- If user is away from latest, non-blocking "new updates" indicator provides jump-to-latest action.

## B-WEB-046: Theme and token rules satisfy observability design constraints
- UI defaults to dark observability theme with light-theme parity support.
- Centralized design tokens are used for spacing/typography/status styles (no panel-local drift).

## B-WEB-047: Error token semantics distinguish validation, conflict, and transport failures
- Visual treatment distinguishes request validation (`400`), terminal conflict (`409`), and network/transport failures.
- Error state rendering preserves user context and provides recoverable actions where applicable.

## B-WEB-048: Accessibility includes SSE critical-status announcements and task-oriented empty/loading states
- Critical SSE lifecycle changes (for example transition to `failed`) are announced accessibly.
- Empty-state copy is task-oriented.
- Loading indicators are panel-scoped and do not globally block dashboard interactions after initial load.

## B-WEB-049: SSE wire protocol and cursor persistence semantics are enforced
Endpoint: `GET /api/v1/workflows/runs/{runId}/stream`
- Stream frames are consumed from SSE `data` as `WorkflowStreamFrame` JSON.
- `lastSeenCursor` is persisted from accepted SSE `id` values.
- Client does not synthesize/parse cursor internals; cursor is treated as opaque transport token.

## B-WEB-050: Event dedup/out-of-order handling is deterministic and non-regressive
- UI ordering and overlay updates are driven by event `sequence`, not wall-clock timestamps.
- Duplicate `(runId, sequence)` deliveries are ignored after first acceptance.
- Frames/events with `sequence <= highestAcceptedSequence(runId)` are treated as duplicate/out-of-order and must not regress rendered state.

## B-WEB-051: Run-feedback discovery query semantics match shared/server contract
Endpoint: `GET /api/v1/workflows/runs/{runId}/feedback-requests`
- Default status query is `awaiting_response,responded`.
- Pagination defaults/limits are `limit=50` default and max `200`.
- Result ordering is stable: `requestedAt DESC`, tie-break `feedbackRunId ASC`.
- Pagination is stable across retry/reconnect.

## B-WEB-052: Log and event query semantics preserve shared contract bounds
- Logs query semantics use `GetRunLogsQuery` rules: `since` inclusive, `until` exclusive, filters AND-combined.
- Event timeline transport requests preserve shared keys `eventType`, `since`, and `until` without alias remapping.

## B-WEB-053: Stream reconnect policy constants and stale threshold are deterministic
- Reconnect backoff starts at `500ms` and grows by `2x` per retry.
- Retry delay uses `full-jitter` with a hard cap of `30s`.
- Stream health transitions to `stale` after `45s` without an accepted frame.

## B-WEB-054: Shared error contracts are used for covered panel failures
- Covered `400/404` panel errors are parsed/rendered from `ErrorEnvelope` (`code`, `message`, `requestId`, optional `details`).
- Feedback submit `409` is handled via `SubmitHumanFeedbackResponseConflict` with status + terminal timestamp metadata.
- Error handling remains panel-scoped and preserves draft input unless submission succeeds.

## B-WEB-055: Accessibility live-region and focus-return rules are deterministic
- Non-terminal status announcements use `aria-live="polite"`; critical terminal failures use `aria-live="assertive"`.
- Panel retry actions return focus to the originating retry trigger.
- Successful feedback submit moves focus to the updated feedback status region.
- Run-not-found navigation returns focus to primary heading/action region in `/runs`.

## B-WEB-056: Field-level DTO semantics are sourced from shared API types
- Required/optional/nullability semantics for covered endpoint/event DTOs are sourced from `@composable-workflow/workflow-api-types`.
- Timestamp/cursor/enum serialization semantics are sourced from shared contracts.
- Covered transport mapping does not introduce local DTO duplication or ad-hoc request/response field remapping.

---

## 11) Coverage Matrix (Web Spec Acceptance Criteria -> Behaviors)

1. Builds as Vite React SPA -> `B-WEB-001`.
2. Feature changes scoped to `apps/workflow-web` (+ allowed server spec docs) -> doc/process gate for web change set, validated alongside this catalog.
3. Shared DTO ownership/no duplicate local DTOs -> `B-WEB-009`.
4. Absolute `/api/v1` endpoint usage -> `B-WEB-010`.
5. `/runs` server data + lifecycle/type filters -> `B-WEB-004`.
6. `/runs/:runId` six required panels -> `B-WEB-006`.
7. SSE incremental ordered updates -> `B-WEB-016`.
8. Cursor resume + dedup -> `B-WEB-017`.
9. Panel-scoped failure isolation -> `B-WEB-008`.
10. `404` run-not-found state -> `B-WEB-007`.
11. Feedback `400` details + input preserved -> `B-WEB-022`.
12. Feedback `409` terminal + disable resubmit -> `B-WEB-023`.
13. Successful feedback submit updates status without reload -> `B-WEB-021`.
14. Server/web spec path-contract consistency -> `B-WEB-014`.
15. Typed transport signatures from shared contracts -> `B-WEB-011`.
16. Stream variant handling exhaustive/visible failure in dev-test -> `B-WEB-019`.
17. Required web stack declared and used -> `B-WEB-001`.
18. Typed EventSource adapter + cursor reconnect -> `B-WEB-015`, `B-WEB-017`.
19. Desktop 3-zone + stacked responsive order -> `B-WEB-027`.
20. Awaiting feedback visual priority -> `B-WEB-020`.
21. HashRouter + run/tree navigation history semantics -> `B-WEB-002`, `B-WEB-003`.
22. Event/log filters + independent panel filtering + exact log keys -> `B-WEB-024`, `B-WEB-025`, `B-WEB-026`, `B-WEB-012`.
23. Consistent lifecycle + stream-health tokens -> `B-WEB-028`, `B-WEB-018`.
24. Keyboard-only required interactions + visible focus -> `B-WEB-029`.
25. Deterministic graph projection and ID format -> `B-WEB-030`.
26. Dagre LR/TB rule + no stream-triggered relayout -> `B-WEB-031`.
27. Overlay event mapping behavior -> `B-WEB-032`.
28. Child-launch metadata visually represented -> `B-WEB-034`.
29. Performance mode threshold and required features -> `B-WEB-035`.
30. Unknown runtime references produce visible mismatch indicator -> `B-WEB-033`.
31. Shared API-types package provides required exports -> `B-WEB-009`, `B-WEB-011`.
32. Run-scoped feedback endpoint consumed/enforced -> `B-WEB-013`.
33. FSM invariants and runtime reference integrity -> `B-WEB-033`.
34. SSE wire semantics and cursor persistence from accepted frame IDs -> `B-WEB-015`, `B-WEB-049`.
35. Strict greater-than resume boundary + duplicate/out-of-order non-regression -> `B-WEB-017`, `B-WEB-050`.
36. Run-feedback discovery pagination defaults/limits and stable ordering -> `B-WEB-051`.
37. Feedback `400/409` detailed handling (including terminal timestamps) + draft preservation -> `B-WEB-022`, `B-WEB-023`.
38. Stream reconnect policy constants (`500ms`, `2x`, full-jitter, `30s` cap, `45s` stale) -> `B-WEB-053`.
39. Closed stream variant set handling + visible unsupported variants in dev/test -> `B-WEB-019`.
40. Events/logs default/max pagination and deterministic ordering -> `B-WEB-052`.
41. Case-insensitive event free-text semantics across defined fields -> `B-WEB-024`.
42. Link-filters explicit-toggle semantics with limited synchronization -> `B-WEB-026`.
43. Shared error contracts for covered panel errors (`ErrorEnvelope`, feedback conflict contract) -> `B-WEB-054`.
44. Accessibility live-region levels and deterministic post-action focus targets -> `B-WEB-055`.
45. Field-level DTO semantics sourced from shared API types with no local transport-shape duplication/remapping -> `B-WEB-056`.

---

## 12) Exit Criteria

Web behavior coverage is complete when:
- behaviors `B-WEB-001` through `B-WEB-056` have automated test ownership,
- all acceptance criteria mappings in Section 11 are covered by passing tests,
- no unresolved drift exists between web spec and server spec endpoint/contract tables.
