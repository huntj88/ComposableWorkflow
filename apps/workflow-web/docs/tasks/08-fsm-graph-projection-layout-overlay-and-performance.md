# TWEB08 - FSM Graph Projection, Layout, Overlay, and Performance Mode

## Depends On
- `TWEB02`
- `TWEB03`

## Objective
Implement deterministic FSM graph rendering from workflow definitions with stable IDs, role/legend semantics, dagre layout rules, runtime overlay composition, mismatch/invariant surfacing, selection details, and large-graph performance mode behavior.

## Fixed Implementation Decisions
- Graph identities and role classification follow spec-defined deterministic rules.
- Layout engine is `dagre` with direction `LR` desktop and `TB` narrow width.
- Runtime overlay merge order is summary -> event history -> stream increments.

## Interface/Schema Contracts
- `WorkflowDefinitionResponse`, `RunSummaryResponse`, `RunEventsResponse`, `WorkflowStreamFrame`.
- Graph ID formats and overlay mapping semantics from web spec Sections 8.5 and 6.6.

## Implementation Tasks
- [ ] Project definitions into deterministic node/edge arrays with required role semantics.
- [ ] Implement dagre layout keying, viewport preservation, and retryable layout-failure state.
- [ ] Implement runtime overlay mapping for `state.entered`, `transition.completed`, `transition.failed`.
- [ ] Implement mismatch/invariant violation indicators with diagnostics.
- [ ] Implement child-launch annotations, legend, selection details, and time-decayed highlights.
- [ ] Implement large-graph performance mode thresholds and required features.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/graph/projectDefinitionToGraph.ts`
- `apps/workflow-web/src/routes/run-detail/graph/layoutGraph.ts`
- `apps/workflow-web/src/routes/run-detail/graph/applyOverlay.ts`
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/graph/projectDefinitionToGraph.ts`
- `apps/workflow-web/src/routes/run-detail/graph/layoutGraph.ts`
- `apps/workflow-web/src/routes/run-detail/graph/applyOverlay.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx`

## Acceptance Criteria
- Definition projection, IDs, and role semantics are deterministic.
- Layout direction and relayout/viewport rules follow breakpoint and stream update constraints.
- Overlay mappings, mismatch indicators, and invariant handling are visible and deterministic.
- Large-graph mode enables all required performance features without full rebuild patch regressions.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-017.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-021.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/graph/itx.web.graph.ITX-WEB-029.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-030 | `apps/workflow-web/src/routes/run-detail/graph/projectDefinitionToGraph.ts` | Deterministic node/edge projection and ID format rules are enforced. |
| B-WEB-031 | `apps/workflow-web/src/routes/run-detail/graph/layoutGraph.ts` | Dagre direction/relayout and viewport preservation rules are enforced. |
| B-WEB-032 | `apps/workflow-web/src/routes/run-detail/graph/applyOverlay.ts` | Runtime overlay mapping/merge order follows event contract. |
| B-WEB-033 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Contract mismatch and invariant violations are visibly surfaced. |
| B-WEB-034 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Child-launch annotations are preserved and rendered. |
| B-WEB-035 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Large-graph performance mode threshold and features are enforced. |
| B-WEB-041 | `apps/workflow-web/src/routes/run-detail/graph/layoutGraph.ts` | Layout failures surface retryable error state with no silent fallback. |
| B-WEB-042 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Graph legend and required visual encoding semantics are present. |
| B-WEB-043 | `apps/workflow-web/src/routes/run-detail/graph/applyOverlay.ts` | Time-decayed transition highlighting remains deterministic. |
| B-WEB-044 | `apps/workflow-web/src/routes/run-detail/components/FsmGraphPanel.tsx` | Node selection reveals metadata and linked transitions. |
