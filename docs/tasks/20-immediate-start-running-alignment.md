# T20 - Immediate Start Execution and `running` Lifecycle Alignment

## Depends On
- `T19`

## Objective
Align runtime and API start semantics with the lifecycle decision that `POST /api/v1/workflows/start` begins execution immediately, with no operational `pending` queue state, and with `workflow.started` emitted at execution-start checkpoint.

## Implementation Tasks
- [ ] Remove operational `pending` lifecycle handling from start-path orchestration and state transitions.
- [ ] Ensure start acceptance performs immediate execution stepping (or immediate equivalent handoff) in the same start path.
- [ ] Keep `running` semantics strict: `running` means actively executing only.
- [ ] Preserve control transitional lifecycle semantics (`pausing|paused|resuming|recovering|cancelling`).
- [ ] Ensure child launch paths and run-linkage behavior remain consistent when parent execution starts immediately.
- [ ] Update route/start response mapping so accepted starts surface active execution semantics.
- [ ] Add/adjust tests to prove no pending-queue behavior is required/assumed.

## Required Artifacts
- `packages/workflow-server/src/orchestrator/start-run.ts`
- `packages/workflow-server/src/orchestrator/orchestrator.ts`
- `packages/workflow-server/src/api/routes/workflows.ts`
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `packages/workflow-server/test/integration/**`
- `packages/workflow-server/test/e2e/**`

## Acceptance Criteria
- Start acceptance implies immediate execution semantics and run lifecycle `running`.
- `workflow.started` is emitted at the execution-start checkpoint (not as queued intent).
- No operational `pending` queue lifecycle is required by runtime behavior, API behavior, or tests.
- Transitional lifecycle controls (`pausing|paused|resuming|recovering|cancelling`) remain unchanged.
- Parent/child launch behavior still preserves linkage/event ordering invariants under immediate start semantics.

## Spec/Behavior Links
- Spec: sections 4.2, 6.2, 8.1, 11.1.
- Behaviors: `B-START-001`, `B-START-003`, `B-LIFE-001`, `B-LIFE-003`, `B-EVT-002`.

## Fixed Implementation Decisions
- There is no operational run queue lifecycle state between accepted start and execution.
- Start path ownership is orchestrator-level; API layer delegates and does not simulate lifecycle transitions.
- `workflow.started` is an execution-start checkpoint event, not an enqueue/intent event.
- Lifecycle transitions for pause/resume/recovery/cancel remain backward-compatible.

## Interface/Schema Contracts
- Start endpoint contract:
  - `POST /api/v1/workflows/start` response lifecycle is `running` when accepted.
  - response shape remains `{ runId, workflowType, workflowVersion, lifecycle, startedAt }`.
- Event contract:
  - first lifecycle checkpoint event for successful start is `workflow.started` at execution-start boundary.
- Lifecycle transition contract:
  - allowed transitions exclude `pending -> running` and retain existing control transitions.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/orchestrator/start-immediate-execution.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/start-immediate-running.spec.ts`

### Modify
- `packages/workflow-server/src/orchestrator/start-run.ts`
- `packages/workflow-server/src/orchestrator/orchestrator.ts`
- `packages/workflow-server/src/api/routes/workflows.ts`
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- start-immediate-execution`
  - Expected: accepted start triggers immediate execution stepping without pending lifecycle usage.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- start-immediate-running`
  - Expected: start API returns lifecycle `running` and event stream includes `workflow.started` at execution start.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- lifecycle`
  - Expected: pause/resume/recovery/cancel transitional lifecycle behaviors remain valid.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| LifecycleStart-001-NoPendingQueue | `src/orchestrator/start-run.ts` | accepted start does not transition through operational `pending`. |
| LifecycleStart-002-ImmediateStepHandoff | `src/orchestrator/orchestrator.ts` | start path performs immediate execution stepping/handoff. |
| LifecycleStart-003-StartRouteRunningContract | `src/api/routes/workflows.ts` | start response lifecycle is `running` with unchanged response shape. |
| LifecycleStart-004-ExecutionStartCheckpoint | `src/orchestrator/start-run.ts` | `workflow.started` emitted at execution-start checkpoint. |
| LifecycleStart-005-ChildLaunchCompatibility | `src/orchestrator/child/launch-child.ts` | child linkage/order invariants hold under immediate-start semantics. |
