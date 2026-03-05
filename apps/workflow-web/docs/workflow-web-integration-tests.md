# Workflow Web Integration Test Plan

This document defines integration-focused test coverage for `apps/workflow-web` behaviors that should not rely solely on black-box browser E2E tests.

Use this with:
- `apps/workflow-web/docs/workflow-web-spec.md`
- `apps/workflow-web/docs/workflow-web-behaviors.md`
- `docs/typescript-server-workflow-spec.md`

---

## 1) Purpose

Web E2E flows validate user-visible outcomes, but integration tests are needed for:
- deterministic stream ordering/reconnect windows,
- transport serialization/type conformance,
- graph projection and overlay determinism,
- contract mismatch/error surfacing,
- panel isolation and filter-state invariants.

---

## 2) Integration Harness Requirements

## 2.1 Web Integration Runtime
- Route-level rendering harness with `HashRouter`.
- Mockable typed transport adapter boundaries.
- Deterministic stream-frame injector with cursor/reconnect controls.
- State-store observability for query cache and local UI store transitions.

## 2.2 Determinism Controls
- Fake timers for reconnect backoff and stale-state transitions.
- Ordered stream replay fixture support (`sequence`, `cursor`, `eventType`).
- Fixture factories for run summary/tree/events/logs/definition/feedback payloads using shared contracts.

## 2.3 Validation Strategy
- Compile-time contract conformance checks for transport signatures/imports.
- Runtime UI assertions for panel-specific loading/error/empty states.
- Snapshot-free semantic assertions for graph node/edge identity and overlay deltas.

---

## 3) Integration Test Catalog

## ITX-WEB-001: HashRouter canonical route behavior
**Why not E2E-only:** route semantics and history-state edge cases are easier to deterministically verify in component/integration harness.

**Setup**
- Mount app with `HashRouter` and seed run-list fixtures.

**Assertions**
- Canonical routes resolve: `#/runs`, `#/runs/:runId`, `#/definitions/:workflowType`.
- Row/tree selection navigates to `#/runs/:runId`.
- Back/forward preserves prior run context.

**Related behaviors:** `B-WEB-002`, `B-WEB-003`.

## ITX-WEB-002: Run dashboard boot sequence and panel wiring
**Why not E2E-only:** startup sequencing and per-panel dependency wiring are easier to assert via mocked transport calls.

**Setup**
- Open `#/runs/:runId` with mocked transport functions and call tracing.

**Assertions**
- Snapshot endpoints are called for summary/tree/events/logs/definition/feedback.
- Six required panels render from those sources.
- SSE stream open call occurs after snapshot initialization.

**Related behaviors:** `B-WEB-005`, `B-WEB-006`.

## ITX-WEB-003: Panel failure isolation and retry actions
**Why not E2E-only:** deterministic multi-panel failure permutations are expensive in browser-only black-box runs.

**Setup**
- Force one panel query to fail while others succeed.

**Assertions**
- Only failing panel enters error state.
- Other panels remain usable.
- Retry action re-issues only that panel query.

**Related behaviors:** `B-WEB-008`.

## ITX-WEB-004: Run summary 404 not-found route behavior
**Why not E2E-only:** deterministic `404` handling and route-level fallback assertions are simpler in integration harness.

**Setup**
- Mock run-summary endpoint as `404`.

**Assertions**
- Dedicated run-not-found state renders.
- Navigation action returns user to `#/runs`.

**Related behaviors:** `B-WEB-007`.

## ITX-WEB-005: SSE ordered incremental patching
**Why not E2E-only:** sequence-order and cross-panel incremental-patch assertions require exact frame control.

**Setup**
- Seed snapshots and replay ordered `WorkflowStreamFrame` fixtures.

**Assertions**
- Summary/tree/graph/timeline/feedback update incrementally.
- Event ordering is preserved by `sequence`.
- No full-page reset occurs while applying frames.

**Related behaviors:** `B-WEB-016`.

## ITX-WEB-006: Reconnect cursor resume and dedup
**Why not E2E-only:** reconnect race windows and duplicate-frame suppression are flaky in browser-only tests.

**Setup**
- Disconnect stream, reconnect with last cursor, replay overlapping frames.

**Assertions**
- Reconnect uses `cursor=<lastSeenCursor>`.
- Duplicate `(runId, sequence)` frames are not re-applied.
- New frames beyond cursor are applied exactly once.
- Resume boundary is strict (`sequence` must be greater than cursor boundary).
- Cursor tracking remains monotonic and does not regress on out-of-order input.

**Related behaviors:** `B-WEB-017`.

## ITX-WEB-007: Stream health state transitions and non-blocking drafts
**Why not E2E-only:** health-state timing and input-preservation checks need deterministic timer control.

**Setup**
- Drive connected -> reconnecting -> stale transitions with fake timers.
- Keep feedback draft text in progress during reconnect.

**Assertions**
- Health badge reflects expected state.
- Reconnect status is visible and non-blocking.
- In-progress draft input is preserved.

**Related behaviors:** `B-WEB-018`.

## ITX-WEB-008: Unsupported stream event variant surfacing in dev/test
**Why not E2E-only:** intentionally injecting unsupported variants is an integration concern.

**Setup**
- Inject unknown/unhandled stream event variant in dev/test mode.

**Assertions**
- UI surfaces visible unsupported-variant failure.
- Variant is not silently ignored.

**Related behaviors:** `B-WEB-019`.

## ITX-WEB-009: Shared DTO import and transport signature conformance
**Why not E2E-only:** this is primarily static/type-level verification.

**Setup**
- Run type-level assertions against transport function signatures/import origins.

**Assertions**
- Covered request/query/response/event types come from `@composable-workflow/workflow-api-types`.
- No local duplicate DTO declarations for covered endpoints.
- Public transport signatures avoid `any`/`unknown` where shared types exist.

**Related behaviors:** `B-WEB-009`, `B-WEB-011`.

## ITX-WEB-010: Absolute endpoint path and query key serialization contract
**Why not E2E-only:** request construction correctness is easier to assert with direct transport adapter inspection.

**Setup**
- Intercept outgoing URLs and query strings for covered operations.

**Assertions**
- Paths are absolute and `/api/v1`-prefixed.
- Logs query uses exact keys: `severity`, `since`, `until`, `correlationId`, `eventId`.
- Logs query semantics preserve inclusive/exclusive bounds (`since` inclusive, `until` exclusive).
- No remapped transport query keys are used.

**Related behaviors:** `B-WEB-010`, `B-WEB-012`.

## ITX-WEB-011: Run-scoped feedback discovery and filtering
**Why not E2E-only:** scoping correctness with mixed-run fixtures is easier to validate deterministically in integration.

**Setup**
- Provide feedback fixtures across multiple run lineages.

**Assertions**
- Dashboard uses run-scoped feedback endpoint.
- Only requests linked to selected run lineage are displayed.
- Awaiting items are prioritized over terminal items.

**Related behaviors:** `B-WEB-013`, `B-WEB-020`.

## ITX-WEB-012: Feedback submit validation and terminal-conflict handling
**Why not E2E-only:** edge permutations (`400`, `409`, success) are more reliable with controlled mocked responses.

**Setup**
- Submit feedback with server responses forced to `400`, then `409`, then success.

**Assertions**
- `400` shows validation details and preserves user input.
- `400` preserves pending status until valid terminal acceptance.
- `409` shows terminal status, terminal timestamp metadata (`respondedAt|cancelledAt`), and disables further submits.
- Success transitions UI to responded terminal state without reload.

**Related behaviors:** `B-WEB-021`, `B-WEB-022`, `B-WEB-023`.

## ITX-WEB-013: Event and log filter independence behavior
**Why not E2E-only:** state coupling bugs across panel stores are easier to catch with integration-level store assertions.

**Setup**
- Apply filters in events and logs panels with and without link mode enabled.

**Assertions**
- Events panel supports `eventType`, `since`, `until`, free-text.
- Logs panel supports `severity`, `since`, `until`, `correlationId`, `eventId`.
- Filters remain independent unless explicit link mode is enabled.

**Related behaviors:** `B-WEB-024`, `B-WEB-025`, `B-WEB-026`.

## ITX-WEB-014: Layout architecture and responsive panel order
**Why not E2E-only:** deterministic viewport permutation testing is faster and less flaky at integration level.

**Setup**
- Render dashboard at `>=1280px` and `<1280px` widths.

**Assertions**
- Desktop uses required 3-zone structure.
- Narrow layouts stack in required priority order.
- Essential run status information remains visible.

**Related behaviors:** `B-WEB-027`.

## ITX-WEB-015: Lifecycle and stream-health token consistency
**Why not E2E-only:** cross-panel token drift is primarily a composition consistency check.

**Setup**
- Render lifecycle states and stream health badges across summary/tree/timeline/feedback contexts.

**Assertions**
- Lifecycle token mapping is consistent across panels.
- Stream-health token mapping is consistent with health badge states.

**Related behaviors:** `B-WEB-028`.

## ITX-WEB-016: Keyboard-only interaction path coverage
**Why not E2E-only:** deterministic focus traversal and control activation are easier to verify with integration tooling.

**Setup**
- Execute keyboard navigation for run list, tree, and feedback form.

**Assertions**
- Required interactions are completable without pointer input.
- Focus indicators remain visible and meaningful.

**Related behaviors:** `B-WEB-029`.

## ITX-WEB-017: Graph definition projection determinism
**Why not E2E-only:** node/edge ID and count assertions need direct graph model inspection.

**Setup**
- Load workflow definition fixtures with deterministic state/transition ordering.

**Assertions**
- Node/edge counts match definition counts exactly.
- IDs follow deterministic node/edge formats.
- Role classification and label precedence rules are honored.

**Related behaviors:** `B-WEB-030`.

## ITX-WEB-018: Graph layout determinism and viewport preservation
**Why not E2E-only:** relayout/no-relayout assertions under stream updates require direct layout invocation checks.

**Setup**
- Render graph at desktop/mobile widths; apply stream updates while preserving viewport state.

**Assertions**
- Dagre direction is `LR` at desktop and `TB` at narrow width.
- Stream updates do not trigger full relayout.
- Pan/zoom viewport is preserved across overlays.

**Related behaviors:** `B-WEB-031`.

## ITX-WEB-019: Overlay mapping and mismatch indicator behavior
**Why not E2E-only:** missing-state/edge mismatch permutations are deterministic integration cases.

**Setup**
- Apply summary/events/stream overlays including valid and invalid state/edge references.

**Assertions**
- Overlay merge order follows summary -> event history -> stream increments.
- `state.entered`, `transition.completed`, and `transition.failed` map correctly.
- Unknown references show visible graph mismatch indicator and diagnostics.

**Related behaviors:** `B-WEB-032`, `B-WEB-033`.

## ITX-WEB-020: Child-launch annotation visualization
**Why not E2E-only:** metadata-preservation validation is a deterministic mapping check.

**Setup**
- Provide definition fixtures with child-launch annotations.

**Assertions**
- Annotation metadata is preserved in node/edge graph data.
- Child-launch affordance is visibly rendered.

**Related behaviors:** `B-WEB-034`.

## ITX-WEB-021: Large-graph performance mode behavior
**Why not E2E-only:** threshold transitions and patch-vs-rebuild behavior are difficult to assert via black-box UI alone.

**Setup**
- Render graph fixtures above threshold (`>120` nodes or `>200` edges).
- Apply incremental overlay stream updates.

**Assertions**
- Performance mode toggles on threshold.
- Required performance-mode features are active (animation reduction, zoom-gated labels, minimap, search, active-path focus).
- Overlay updates patch affected nodes/edges without full graph rebuild.

**Related behaviors:** `B-WEB-035`.

## ITX-WEB-022: FSM invariant violation surfacing
**Why not E2E-only:** malformed-definition permutations are easier to execute via direct fixture injection.

**Setup**
- Inject definitions with duplicate state IDs, unstable transition identity/order, and unresolved runtime references.

**Assertions**
- Graph panel displays visible contract/invariant violation state.
- Development/test diagnostics include violation details.

**Related behaviors:** `B-WEB-033`.

## ITX-WEB-023: Web-server spec endpoint matrix drift gate
**Why not E2E-only:** this is static/spec conformance validation.

**Setup**
- Parse endpoint matrix in `apps/workflow-web/docs/workflow-web-spec.md` Section 6.2.
- Parse matching server-spec endpoint matrix sections.

**Assertions**
- Method/path/shared contract names match exactly.
- CI fails on any drift.

**Related behaviors:** `B-WEB-014`.

## ITX-WEB-024: Run refresh and cancel action semantics
**Why not E2E-only:** action enablement and request targeting are easier to verify deterministically with controlled lifecycle fixtures.

**Setup**
- Render run dashboard across active and terminal lifecycle fixtures.

**Assertions**
- Refresh action re-issues snapshot data requests without full route reload.
- Cancel action targets `POST /api/v1/workflows/runs/{runId}/cancel` for active runs.
- Cancel is unavailable for terminal lifecycle states.

**Related behaviors:** `B-WEB-036`.

## ITX-WEB-025: Run summary and timeline metadata completeness
**Why not E2E-only:** field-completeness and metadata rendering are stable integration assertions.

**Setup**
- Provide summary and events fixtures with full metadata fields.

**Assertions**
- Summary renders required identity/lifecycle/state/parent/timestamp/progress fields.
- Timeline entries expose sequence/cursor metadata.

**Related behaviors:** `B-WEB-037`.

## ITX-WEB-026: Feedback detail expansion and option-validation surfacing
**Why not E2E-only:** controlled response permutations are more reliable with mocked responses.

**Setup**
- Select actionable feedback items and submit invalid option selections.

**Assertions**
- Selection opens full prompt/options/form context in panel.
- Server option-validation errors are displayed while preserving draft values.

**Related behaviors:** `B-WEB-038`.

## ITX-WEB-027: Exponential reconnect backoff behavior
**Why not E2E-only:** backoff timing verification requires deterministic fake-timer control.

**Setup**
- Force repeated stream disconnects and capture retry scheduling.

**Assertions**
- Retry delays follow exponential backoff progression.
- Reconnect status remains visible and non-blocking.

**Related behaviors:** `B-WEB-039`.

## ITX-WEB-028: Causal navigation chain and cross-panel correlation
**Why not E2E-only:** chain-level state coupling is easier to assert through integration store/state inspection.

**Setup**
- Navigate run summary -> tree selection -> graph focus and inspect panel state updates.

**Assertions**
- Tree selection updates run context and graph focus.
- Correlated event/log context updates with selected run and causal navigation path.

**Related behaviors:** `B-WEB-040`.

## ITX-WEB-029: Graph layout failure state and retry handling
**Why not E2E-only:** forcing `dagre` failure paths is an integration concern.

**Setup**
- Inject layout-engine failure during graph computation.

**Assertions**
- Graph panel renders visible layout error state.
- Retry action re-attempts layout; no silent arbitrary-coordinate fallback is used.

**Related behaviors:** `B-WEB-041`.

## ITX-WEB-030: Graph legend and visual encoding semantics
**Why not E2E-only:** node/edge semantic encoding checks are deterministic with direct model/DOM assertions.

**Setup**
- Render graph fixture containing each node role and edge outcome type.

**Assertions**
- Legend is present and available in graph panel.
- Node roles map to required shape semantics.
- Edge outcomes map to required style semantics.

**Related behaviors:** `B-WEB-042`.

## ITX-WEB-031: Time-decayed transition highlighting behavior
**Why not E2E-only:** decay progression and deterministic ordering are easier to verify with controlled clocks.

**Setup**
- Replay traversed-transition events with timestamp deltas.

**Assertions**
- Newest traversed transitions receive strongest highlight.
- Highlight intensity decays over time while preserving deterministic ordering.

**Related behaviors:** `B-WEB-043`.

## ITX-WEB-032: Graph node selection detail reveal
**Why not E2E-only:** metadata-panel coupling is deterministic in integration harness.

**Setup**
- Select graph nodes with multiple linked transitions.

**Assertions**
- State metadata is revealed for selected node.
- Linked transitions are displayed for selected state.

**Related behaviors:** `B-WEB-044`.

## ITX-WEB-033: Auto-follow, scroll preservation, and jump-to-latest behavior
**Why not E2E-only:** scroll-state and follow-mode transitions are less flaky in integration harness.

**Setup**
- Replay incoming timeline/log updates with user both near latest and scrolled away.

**Assertions**
- Chronological append is preserved.
- Scroll position remains stable when auto-follow is off.
- New-updates indicator and jump action appear when user is behind latest.

**Related behaviors:** `B-WEB-045`.

## ITX-WEB-034: Theme defaults and error-token differentiation
**Why not E2E-only:** token consistency and status-style mapping are composition checks.

**Setup**
- Render dark-default and light-theme contexts across status/error surfaces.

**Assertions**
- Dark theme is default and light parity exists.
- Token usage is centralized/consistent across panels.
- Error styling differentiates `400`, `409`, and transport failures.

**Related behaviors:** `B-WEB-046`, `B-WEB-047`.

## ITX-WEB-035: Accessible critical-status announcements and panel-scoped empty/loading states
**Why not E2E-only:** aria-live and scoped loading-state assertions are deterministic integration checks.

**Setup**
- Trigger critical lifecycle changes and panel-level empty/loading states.

**Assertions**
- Critical status transitions emit accessible announcements.
- Empty-state copy is task-oriented.
- Loading states remain panel-scoped after initial route load.

**Related behaviors:** `B-WEB-048`.

## ITX-WEB-036: SSE wire-frame contract handling
**Why not E2E-only:** SSE `event/id/data` framing and cursor persistence are transport-adapter integration concerns.

**Setup**
- Feed adapter with SSE frames containing `event`, `id`, and `data` fields.

**Assertions**
- Adapter accepts only `workflow-event` frames for run stream processing.
- SSE `data` JSON is parsed as `WorkflowStreamFrame`.
- Accepted frame `id` values persist as `lastSeenCursor`.
- Cursor is treated as opaque token (no client parsing logic required for correctness).

**Related behaviors:** `B-WEB-015`, `B-WEB-049`.

## ITX-WEB-037: Duplicate/out-of-order non-regression behavior
**Why not E2E-only:** deterministic non-regression checks under overlapping replay require controlled sequence fixtures.

**Setup**
- Replay mixed ordered, duplicate, and out-of-order frames for one `runId`.

**Assertions**
- First-seen `(runId, sequence)` frame wins.
- Frames with `sequence <= highestAcceptedSequence(runId)` do not regress rendered summary/graph/timeline state.
- Highest accepted sequence and cursor watermark remain monotonic.

**Related behaviors:** `B-WEB-050`.

## ITX-WEB-038: Run-feedback pagination/default ordering contract
**Why not E2E-only:** default query and stable pagination behavior are best validated at transport + panel integration boundaries.

**Setup**
- Intercept run-feedback request URLs and inject multi-page fixtures with stable timestamps/tie values.

**Assertions**
- Default request includes status equivalent to `awaiting_response,responded` when not explicitly overridden.
- Limit handling uses default `50` and respects max `200` constraints.
- Render order is stable (`requestedAt DESC`, tie-break `feedbackRunId ASC`) across retries/reconnects.

**Related behaviors:** `B-WEB-051`.

## ITX-WEB-039: Event/log query semantics and key preservation
**Why not E2E-only:** key-level serialization and temporal bound semantics are transport-level conformance checks.

**Setup**
- Apply event/log filters through UI controls while capturing outgoing transport requests.

**Assertions**
- Event queries preserve shared keys `eventType`, `since`, `until` with no alias remapping.
- Log queries preserve `GetRunLogsQuery` keys and semantics (`since` inclusive, `until` exclusive, AND-combined filters).

**Related behaviors:** `B-WEB-052`, `B-WEB-024`, `B-WEB-025`.

## ITX-WEB-040: Reconnect constants and stale-threshold timing contract
**Why not E2E-only:** retry-delay progression and stale-state timing are deterministic timer assertions best handled in integration.

**Setup**
- Simulate repeated disconnects with fake timers while capturing scheduled retry delays and stream-health transitions.

**Assertions**
- Retry policy starts at `500ms`, grows at `2x`, applies full-jitter, and caps at `30s`.
- Stream health transitions to `stale` after `45s` without accepted frames.

**Related behaviors:** `B-WEB-053`.

## ITX-WEB-041: Shared error-envelope and feedback-conflict contract rendering
**Why not E2E-only:** contract-shape parsing and UI-mapping of structured error payloads are integration-level concerns.

**Setup**
- Inject covered panel failures with `ErrorEnvelope` payloads and feedback `409` conflict payloads.

**Assertions**
- `400/404` surfaces render `code`, `message`, and `requestId`, preserving optional `details` context.
- Feedback `409` renders conflict status and terminal timestamp metadata from `SubmitHumanFeedbackResponseConflict`.
- Error handling remains panel-scoped and preserves draft input unless submission is accepted.

**Related behaviors:** `B-WEB-054`.

## ITX-WEB-042: Accessibility announcement levels and focus-return targets
**Why not E2E-only:** aria-live politeness and deterministic focus-target assertions are more reliable in integration harness.

**Setup**
- Trigger non-terminal and terminal status updates; execute panel retry, feedback submit success, and run-not-found navigation actions.

**Assertions**
- Non-terminal updates announce via `aria-live="polite"`; terminal failures via `aria-live="assertive"`.
- Retry returns focus to panel retry trigger.
- Feedback submit success moves focus to updated feedback status region.
- Run-not-found navigation sets focus to `/runs` primary heading/action region.

**Related behaviors:** `B-WEB-055`.

## ITX-WEB-043: Field-level shared DTO authority conformance
**Why not E2E-only:** field-level type/source-of-truth conformance is static/integration contract validation.

**Setup**
- Validate transport mappings and request/response parse surfaces for covered endpoints/events against shared `workflow-api-types` contracts.

**Assertions**
- Required/optional/nullability and serialization semantics derive from shared exports.
- No local duplicate covered transport DTOs are introduced.
- No ad-hoc field remapping rewrites covered transport shapes.

**Related behaviors:** `B-WEB-056`, `B-WEB-009`, `B-WEB-011`.

---

## 4) Integration vs E2E Ownership Matrix

## 4.1 Integration-Primary
- `ITX-WEB-005`, `ITX-WEB-006`, `ITX-WEB-008`, `ITX-WEB-009`, `ITX-WEB-010`, `ITX-WEB-017`, `ITX-WEB-018`, `ITX-WEB-019`, `ITX-WEB-021`, `ITX-WEB-022`, `ITX-WEB-023`, `ITX-WEB-027`, `ITX-WEB-029`, `ITX-WEB-031`, `ITX-WEB-034`, `ITX-WEB-036`, `ITX-WEB-037`, `ITX-WEB-038`, `ITX-WEB-039`, `ITX-WEB-040`, `ITX-WEB-041`, `ITX-WEB-043`.

## 4.2 Shared Coverage (Integration + E2E)
- `ITX-WEB-001`, `ITX-WEB-002`, `ITX-WEB-003`, `ITX-WEB-004`, `ITX-WEB-007`, `ITX-WEB-011`, `ITX-WEB-012`, `ITX-WEB-013`, `ITX-WEB-014`, `ITX-WEB-015`, `ITX-WEB-016`, `ITX-WEB-020`, `ITX-WEB-024`, `ITX-WEB-025`, `ITX-WEB-026`, `ITX-WEB-028`, `ITX-WEB-030`, `ITX-WEB-032`, `ITX-WEB-033`, `ITX-WEB-035`, `ITX-WEB-042`.

Guideline:
- Keep one representative happy-path proof in browser E2E.
- Keep race/mismatch/contract and high-permutation coverage in integration.

---

## 5) Recommended Test Structure

- `apps/workflow-web/test/integration/routes/...`
- `apps/workflow-web/test/integration/transport/...`
- `apps/workflow-web/test/integration/stream/...`
- `apps/workflow-web/test/integration/graph/...`
- `apps/workflow-web/test/integration/feedback/...`
- `apps/workflow-web/test/integration/accessibility/...`
- `apps/workflow-web/test/integration/spec-lock/...`

Naming convention:
- `itx.web.<domain>.<id>.spec.ts`
- Example: `itx.web.stream.ITX-WEB-006.spec.ts`

---

## 6) Exit Criteria

Integration coverage is complete when:
1. All integration-primary tests pass deterministically in CI.
2. Every behavior in `workflow-web-behaviors.md` maps to at least one automated test owner.
3. Stream ordering/reconnect/dedup logic has deterministic tests.
4. Graph projection/layout/overlay/mismatch/performance mode invariants are all covered.
5. Contract conformance and spec drift gates pass without exceptions.
