# WEB-15 - Transition History and Cross-Panel Coordination

## Depends On
- `WEB-02`
- `WEB-03`
- `WEB-04`
- `WEB-06`
- `WEB-08`

## Objective
Implement the Transition History panel as an ordered execution narrative with nested child histories, persistent expand/collapse state across live updates, and deterministic coordination with the FSM graph, events timeline, and link-filter time-range behavior.

## Fixed Implementation Decisions
- Transition History is derived from `RunEventsResponse` / stream data rather than a separate endpoint.
- Only transition-relevant event types appear in the panel: `state.entered`, `transition.requested`, `transition.completed`, `transition.failed`, `child.started`, `child.completed`, `child.failed`.
- Selection synchronization between history, graph, and timeline uses shared UI state so panel updates stay deterministic across stream events.

## Interface/Schema Contracts
- `RunEventsResponse`
- `WorkflowStreamFrame`
- `RunTreeResponse`
- Link-filter semantics from web spec Section 9.3

## Implementation Tasks
- [ ] Derive ordered transition-history entries from snapshot + stream event sources in strict `sequence ASC`.
- [ ] Render a Transition History panel with iteration counters for repeated state visits.
- [ ] Render inline collapsible child-history sections with recursive nesting and summary rows for collapsed state.
- [ ] Persist child-section expand/collapse state across live stream updates.
- [ ] Coordinate history-entry selection with FSM graph highlighting and events-timeline scrolling.
- [ ] Respect `since`/`until` synchronization only when explicit link-filters mode is enabled.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/components/TransitionHistoryPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/TransitionHistoryChildSection.tsx`
- `apps/workflow-web/src/routes/run-detail/history/buildTransitionHistory.ts`
- `apps/workflow-web/src/routes/run-detail/state/transitionHistoryStore.ts`
- `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/components/TransitionHistoryPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/TransitionHistoryChildSection.tsx`
- `apps/workflow-web/src/routes/run-detail/history/buildTransitionHistory.ts`
- `apps/workflow-web/src/routes/run-detail/state/transitionHistoryStore.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx`
- `apps/workflow-web/src/routes/run-detail/layout/RunDashboardLayout.tsx`
- `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx`

## Acceptance Criteria
- Transition History renders only transition-relevant event types in strict `sequence ASC` order.
- Repeated state visits display iteration counters.
- Child histories appear inline as collapsible sections whose expanded views recurse for nested children.
- Expand/collapse state survives live stream updates.
- Selecting a history entry highlights the corresponding graph node/edge and scrolls the events timeline to the matching event.
- Time-range filter synchronization applies only when explicit link-filters mode is enabled.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/history/itx.web.history.ITX-WEB-049.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/history/itx.web.history.ITX-WEB-050.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-064 | `apps/workflow-web/src/routes/run-detail/history/buildTransitionHistory.ts` | Transition History ordering, event-type coverage, and iteration-counter derivation are deterministic. |
| B-WEB-065 | `apps/workflow-web/src/routes/run-detail/components/TransitionHistoryChildSection.tsx` | Inline child-history nesting and preserved collapse state are implemented. |
| B-WEB-066 | `apps/workflow-web/src/routes/run-detail/state/transitionHistoryStore.ts` | Cross-panel coordination and link-filter-aware time-range synchronization are enforced. |
