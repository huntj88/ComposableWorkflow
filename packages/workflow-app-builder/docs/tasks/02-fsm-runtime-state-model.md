# SDB-02 - FSM Runtime Skeleton and State Data Model

## Depends On
- `SDB-00`
- `SDB-01`

## Objective
Create `app-builder.spec-doc.v1` as a declarative FSM workflow with canonical states, transition guards, and persistent state data structures.

## Implementation Tasks
- [x] Register workflow identity/version in package manifest and exports.
- [x] Implement FSM state enum and transition map for canonical flow.
- [x] Define state data model for queue, normalized answers, counters, and artifacts.
- [x] Add transition tests for core state reachability and invariant edges.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`
- `packages/workflow-app-builder/src/manifest.ts`
- `packages/workflow-app-builder/src/index.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/fsm-core.test.ts`

## Acceptance Criteria
- Workflow type/version match section 4 exactly.
- Canonical state set includes all six states from section 6.2.
- Transition map prevents direct non-allowed edges by construction.

## Spec/Behavior Links
- Spec: sections 4, 6.1, 6.2, 6.3, 10.1.
- Behaviors: `B-SD-TRANS-001`, `B-SD-TRANS-002`, `B-SD-DONE-001`.

## Fixed Implementation Decisions
- FSM graph is declared in code metadata first, then handlers bind per state.
- State data stores deterministic queue and answer history in workflow context.
- Guard evaluation is explicit and unit-tested at each edge.

## Interface/Schema Contracts
- State identifiers:
  - `IntegrateIntoSpec`
  - `LogicalConsistencyCheckCreateFollowUpQuestions`
  - `NumberedOptionsHumanRequest`
  - `ClassifyCustomPrompt`
  - `ExpandQuestionWithClarification`
  - `Done`.
- Persisted counters include `integrationPasses`, `consistencyCheckPasses`.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/fsm-core.test.ts`

### Modify
- `packages/workflow-app-builder/src/manifest.ts`
- `packages/workflow-app-builder/src/index.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- fsm-core`
  - Expected: canonical state graph and forbidden transitions are enforced.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- workflows/spec-doc`
  - Expected: workflow registration and identity contracts pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-FSM-001-WorkflowIdentity | `src/manifest.ts` | workflowType/version exported as `app-builder.spec-doc.v1`/`1.0.0`. |
| SD-FSM-002-CanonicalStateSet | `src/workflows/spec-doc/workflow.ts` | all six states from section 6.2 are declared. |
| SD-FSM-003-GuardedTransitions | `src/workflows/spec-doc/workflow.ts` | transition graph permits only section 6.3 edges. |
| SD-FSM-004-StateDataBackbone | `src/workflows/spec-doc/state-data.ts` | queue/answers/counters/artifacts are persisted across transitions. |
