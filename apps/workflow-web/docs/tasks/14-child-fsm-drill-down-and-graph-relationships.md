# WEB-14 - Child FSM Drill-Down and Graph Relationships

## Depends On
- `WEB-02`
- `WEB-03`
- `WEB-07`
- `WEB-08`

## Objective
Extend the FSM graph with child-run drill-down, ancestor breadcrumbs, browser-history restoration, iteration-aware launch selection for looping state machines, and structural relationship rendering for orphan, unreachable, parallel, and neighborhood-highlight graph states.

## Fixed Implementation Decisions
- Child-run drill-down resolves from definition child-launch annotations plus `RunTreeResponse`; manual child-run ID entry is never required.
- When no matching child run exists, drill-down falls back to the static definition route for the annotated `childWorkflowType`.
- Graph relationship semantics (orphan grouping, unreachable styling, parallel-edge distinction, neighborhood highlighting, and summary counts) are rendered inside the FSM graph surface rather than a separate analysis panel.

## Interface/Schema Contracts
- `WorkflowDefinitionResponse`
- `RunTreeResponse`
- `RunEventsResponse`
- `RunSummaryResponse`

## Implementation Tasks
- [ ] Add child-launch affordances to graph nodes/edges with keyboard-accessible activation targets.
- [ ] Resolve drill-down targets to runtime child runs or static definitions using definition annotations + `RunTreeResponse`.
- [ ] Render ancestor breadcrumbs above the graph and push browser-history entries so back/forward restores prior graph context.
- [ ] Add iteration selection for repeated child-launch visits using matching `child.started` events ordered by `sequence ASC`.
- [ ] Render full transition-edge parity with distinct visual handling for orphan states, unreachable states, and parallel transitions.
- [ ] Highlight directly connected neighborhoods on state selection and surface graph summary counts for states, transitions, unreachable states, and terminal states.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphBreadcrumbs.tsx`
- `apps/workflow-web/src/routes/run-detail/components/IterationSelectorDialog.tsx`
- `apps/workflow-web/src/routes/run-detail/graph/projectDefinitionToGraph.ts`
- `apps/workflow-web/src/routes/run-detail/graph/resolveChildDrilldownTarget.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphBreadcrumbs.tsx`
- `apps/workflow-web/src/routes/run-detail/components/IterationSelectorDialog.tsx`
- `apps/workflow-web/src/routes/run-detail/graph/resolveChildDrilldownTarget.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/graph/projectDefinitionToGraph.ts`
- `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx`

## Acceptance Criteria
- Child-launch affordances navigate to `#/runs/:childRunId` when a matching child run exists and to `#/definitions/:childWorkflowType` otherwise.
- Breadcrumbs appear above the graph for drilled child contexts and support clickable ancestor navigation.
- Browser back/forward restores prior graph context after drill-down.
- Multi-visit child-launch states show an iteration selector ordered by matching `child.started` events in `sequence ASC`; single-visit states skip the selector.
- Graph rendering preserves exact transition count, arrowheads, orphan grouping, unreachable styling, parallel-edge distinction, neighborhood highlighting, and graph summary counts.
- Keyboard-only users can activate drill-down affordances with visible focus indicators.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-046.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-047.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-048.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-061 | `apps/workflow-web/src/routes/run-detail/graph/resolveChildDrilldownTarget.ts` | Child drill-down resolves runtime/static targets with breadcrumb/history semantics. |
| B-WEB-062 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Structural graph relationship rendering and neighborhood highlighting follow the required semantics. |
| B-WEB-063 | `apps/workflow-web/src/routes/run-detail/components/IterationSelectorDialog.tsx` | Iteration-aware child drill-down remains keyboard-accessible and sequence-ordered. |
