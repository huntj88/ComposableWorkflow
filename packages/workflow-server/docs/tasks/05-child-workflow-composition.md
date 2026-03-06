# WS-05 - Child Workflow Composition and Run Tree Lineage

## Depends On
- `WS-02`, `WS-03`

## Objective
Implement parent/child launch, linkage persistence, await semantics, failure propagation defaults, and tree visibility.

## Implementation Tasks
- [x] Implement `launchChild` orchestration path:
  - child run creation linked with `parentRunId`
  - parent wait/resume mechanics
- [x] Emit child lifecycle events (`child.started|completed|failed`) with linkage fields.
- [x] Implement default child failure propagation to parent.
- [x] Persist parent-child relation materialization (event + required `workflow_run_children` table).
- [x] Enforce no new child launch during restricted lifecycles (`pausing|paused|resuming|cancelling|recovering`).
- [x] Ensure run tree endpoint includes recursive descendants and depth filtering.
- [x] Add unit tests for child lifecycle restriction guards and lineage projection utilities.
- [x] Integration tests for launch, await result, failure propagation, and tree consistency.

## Required Artifacts
- `packages/workflow-server/src/orchestrator/child/*`
- `packages/workflow-server/test/integration/child/*`

## Acceptance Criteria
- Parent-child linkage is queryable and consistent across summary/tree/events.
- Parent resumes with child output for successful child runs.
- Active descendants receive parent cancellation requests.
- Unit tests cover lineage and lifecycle guard logic independent of full integration orchestration.

## Spec/Behavior Links
- Spec: sections 4.4, 6.3, 8.3, 11.
- Behaviors: `B-CHILD-001..004`, `B-DATA-003`, `B-LIFE-005`.
- Integration: `ITX-008`, `ITX-009`, `ITX-014`.

## Fixed Implementation Decisions
- Parent launch mode for MVP: synchronous await only.
- Default child failure policy: propagate failure to parent.
- Child linkage persistence: event lineage is source-of-truth, and `workflow_run_children` is a required query projection kept consistent with events.

## Interface/Schema Contracts
- Child launch request contract:
  - `{ workflowType: string, input: unknown, correlationId?: string, idempotencyKey?: string }`.
- Parent-linked child event payload:
  - `{ childRunId: string, childWorkflowType: string, lifecycle: WorkflowLifecycle }`.
- Forbidden lifecycle child launch error:
  - `{ code: "CHILD_LAUNCH_FORBIDDEN_LIFECYCLE", lifecycle: WorkflowLifecycle }`.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `packages/workflow-server/src/orchestrator/child/await-child.ts`
- `packages/workflow-server/src/orchestrator/child/child-lineage.ts`
- `packages/workflow-server/test/integration/child/launch-and-await.spec.ts`
- `packages/workflow-server/test/integration/child/failure-propagation.spec.ts`
- `packages/workflow-server/test/integration/child/forbidden-lifecycle-launch.spec.ts`

### Modify
- `packages/workflow-server/src/read-models/run-tree-projection.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- child`
  - Expected: child launch/await, failure propagation, and lineage visibility pass.
- Command: `pnpm --filter workflow-server test -- ITX-008|ITX-009`
  - Expected: cancellation traversal and forbidden lifecycle rejection tests pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-CHILD-001 | `launch-and-await.spec.ts` | Parent launches child and resumes with child output. |
| Behavior-B-CHILD-002 | `failure-propagation.spec.ts` | Child failure propagates to parent by default. |
| Behavior-B-LIFE-005 | `forbidden-lifecycle-launch.spec.ts` | Child launch blocked in controlled transitional lifecycles. |
| Integration-ITX-014 | `child-lineage.ts` | Trace/linkage integrity preserved for parent-child nesting. |
