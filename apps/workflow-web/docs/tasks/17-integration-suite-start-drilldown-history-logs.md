# WEB-17 - Integration Suite: Start Workflow, Drill-Down, History, Feedback, and Logs Delta

## Depends On
- `WEB-09`
- `WEB-13`
- `WEB-14`
- `WEB-15`
- `WEB-16`

## Objective
Add deterministic integration coverage for the staged spec delta: start workflow flows, child-FSM drill-down and graph relationship behavior, transition-history rendering and coordination, feedback single-select enforcement, and logs windowing/live-update semantics.

## Fixed Implementation Decisions
- Each new `ITX-WEB-*` case gets its own exact spec file.
- Transport is mocked and route rendering remains deterministic; no visual snapshot coupling is introduced.
- Harness extensions belong in this task whenever the new ITX cases require new fixtures, stream scenarios, or transport traces.

## Interface/Schema Contracts
- Shared transport DTO contracts from `@composable-workflow/workflow-api-types`
- Route, graph, history, feedback, and logs semantics from `workflow-web-spec.md` Sections 4, 6, 8.5, 8.6, 8.7, 9.3, and 10.3

## Implementation Tasks
- [ ] Extend integration fixtures/harness support for definitions lists, start-workflow responses, multi-iteration child launches, nested child histories, and windowed log replay.
- [ ] Add `ITX-WEB-044` and `ITX-WEB-045` coverage for start-workflow happy-path, error, and keyboard-only behavior.
- [ ] Add `ITX-WEB-046`, `ITX-WEB-047`, and `ITX-WEB-048` coverage for drill-down routing, graph relationships, and iteration selectors.
- [ ] Add `ITX-WEB-049` and `ITX-WEB-050` coverage for Transition History ordering, nesting, and cross-panel coordination.
- [ ] Add `ITX-WEB-051` and `ITX-WEB-052` coverage for feedback single-select semantics and logs windowing/scroll-state behavior.
- [ ] Execute each targeted integration spec file individually for deterministic triage.

## Required Artifacts
- `apps/workflow-web/test/integration/start/*.spec.ts`
- `apps/workflow-web/test/integration/graph/*.spec.ts`
- `apps/workflow-web/test/integration/history/*.spec.ts`
- `apps/workflow-web/test/integration/feedback/*.spec.ts`
- `apps/workflow-web/test/integration/logs/*.spec.ts`
- `apps/workflow-web/test/integration/fixtures/workflowFixtures.ts`
- `apps/workflow-web/test/integration/fixtures/nestedHistoryFixtures.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/integration/start/itx.web.start.ITX-WEB-044.spec.ts`
- `apps/workflow-web/test/integration/start/itx.web.start.ITX-WEB-045.spec.ts`
- `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-046.spec.ts`
- `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-047.spec.ts`
- `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-048.spec.ts`
- `apps/workflow-web/test/integration/history/itx.web.history.ITX-WEB-049.spec.ts`
- `apps/workflow-web/test/integration/history/itx.web.history.ITX-WEB-050.spec.ts`
- `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-051.spec.ts`
- `apps/workflow-web/test/integration/logs/itx.web.logs.ITX-WEB-052.spec.ts`
- `apps/workflow-web/test/integration/fixtures/nestedHistoryFixtures.ts`

### Modify
- `apps/workflow-web/test/integration/fixtures/workflowFixtures.ts`
- `apps/workflow-web/test/integration/harness/mockTransport.ts`
- `apps/workflow-web/test/integration/harness/streamReplay.ts`

## Acceptance Criteria
- Every new integration case `ITX-WEB-044..052` has a deterministic exact spec file.
- Harness fixtures support start-workflow, drill-down iteration, nested child-history, and log-windowing scenarios without ad-hoc per-test setup drift.
- Graph/history/log assertions are semantic and deterministic rather than screenshot-based.
- Targeted execution commands are documented as exact-file runs.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/start/itx.web.start.ITX-WEB-044.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-047.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/history/itx.web.history.ITX-WEB-049.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-051.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/logs/itx.web.logs.ITX-WEB-052.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| ITX-WEB-044 | `apps/workflow-web/test/integration/start/itx.web.start.ITX-WEB-044.spec.ts` | Start-workflow happy-path transport, definitions loading, and `200`/`201` handling are deterministic. |
| ITX-WEB-045 | `apps/workflow-web/test/integration/start/itx.web.start.ITX-WEB-045.spec.ts` | Start-workflow error handling and keyboard-only completion semantics are enforced. |
| ITX-WEB-046 | `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-046.spec.ts` | Child drill-down routing, breadcrumb, and browser-history behavior are deterministic. |
| ITX-WEB-047 | `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-047.spec.ts` | FSM graph relationship rendering and neighborhood highlighting are enforced. |
| ITX-WEB-048 | `apps/workflow-web/test/integration/graph/itx.web.graph.ITX-WEB-048.spec.ts` | Iteration-aware child drill-down selector ordering and fallback semantics are enforced. |
| ITX-WEB-049 | `apps/workflow-web/test/integration/history/itx.web.history.ITX-WEB-049.spec.ts` | Transition History ordering, iteration cues, nested child sections, and preserved expansion state are enforced. |
| ITX-WEB-050 | `apps/workflow-web/test/integration/history/itx.web.history.ITX-WEB-050.spec.ts` | Transition History cross-panel coordination and link-filter semantics are enforced. |
| ITX-WEB-051 | `apps/workflow-web/test/integration/feedback/itx.web.feedback.ITX-WEB-051.spec.ts` | Feedback single-select controls never emit invalid multi-value option payloads. |
| ITX-WEB-052 | `apps/workflow-web/test/integration/logs/itx.web.logs.ITX-WEB-052.spec.ts` | Logs windowing, scroll-state, live append, and filter-reset behavior are deterministic. |
