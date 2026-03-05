# T06 - Lifecycle Controls: Pause, Resume, Cancel, Recovery

## Depends On
- `T04`, `T05`

## Objective
Implement exact lifecycle machine transitions and control endpoints with cooperative safe-point semantics and startup/manual reconciliation.

## Implementation Tasks
- [x] Implement lifecycle transition guards exactly as spec section 11.1.
- [x] Implement control endpoints:
  - `POST /api/v1/workflows/runs/{runId}/pause`
  - `POST /api/v1/workflows/runs/{runId}/resume`
  - `POST /api/v1/workflows/runs/{runId}/cancel`
  - `POST /api/v1/workflows/recovery/reconcile`
- [x] Enforce 409 behavior for invalid pause/resume states.
- [x] Implement cooperative safe points:
  - between transitions
  - before/after child launch (**moved to `T08`**)
  - before/after command execution (**moved to `T08`**)
- [x] Implement startup reconciliation before accepting new execution work.
- [x] Ensure recovery is idempotent and lock-protected.
- [x] Emit exact lifecycle checkpoint events:
  - `workflow.pausing`, `workflow.paused`, `workflow.resuming`, `workflow.resumed`,
  - `workflow.recovering`, `workflow.recovered`, `workflow.cancelling`, `workflow.cancelled`.
- [x] Add unit tests for lifecycle transition matrix and guard evaluation logic.

## Required Artifacts
- `packages/workflow-server/src/lifecycle/*`
- `packages/workflow-server/src/recovery/*`
- `packages/workflow-server/test/integration/lifecycle/*`

## Acceptance Criteria
- Lifecycle transitions are legal only along specified state machine edges.
- Pause/resume invalid requests return 409 with current lifecycle details.
- Reconcile endpoint and startup reconcile are idempotent and deterministic.
- Unit tests validate lifecycle transition legality independently from API transport concerns.

## Spec/Behavior Links
- Spec: section 11, section 12.
- Behaviors: `B-LIFE-001..008`, `B-CHILD-004` (cancel propagation dependency).
- Integration: `ITX-005`, `ITX-006`, `ITX-007`, `ITX-008`, `ITX-009`.

## Fixed Implementation Decisions
- Lifecycle state transitions enforced through a single transition function with explicit state matrix.
- Pause/resume invalid operations return HTTP `409` with current lifecycle payload.
- Reconcile endpoint performs bounded scan default `limit=100`.
- Startup gating: server does not accept new start requests until initial reconcile completes.

## Interface/Schema Contracts
- Pause response schema:
  - `{ runId: string, lifecycle: "pausing", acceptedAt: string }`.
- Resume response schema:
  - `{ runId: string, lifecycle: "resuming", acceptedAt: string }`.
- Reconcile response schema:
  - `{ scanned: number, recovered: number, skipped: number, failed: number, startedAt: string, completedAt: string }`.
- 409 error detail schema:
  - `{ code: "INVALID_LIFECYCLE", currentLifecycle: WorkflowLifecycle }`.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/lifecycle/lifecycle-machine.ts`
- `packages/workflow-server/src/lifecycle/control-routes.ts`
- `packages/workflow-server/src/recovery/reconcile-service.ts`
- `packages/workflow-server/src/recovery/startup-reconcile.ts`
- `packages/workflow-server/test/integration/lifecycle/pause-resume-guards.spec.ts`
- `packages/workflow-server/test/integration/lifecycle/recovery-idempotent.spec.ts`
- `packages/workflow-server/test/integration/lifecycle/cancel-propagation.spec.ts`

### Modify
- `packages/workflow-server/src/api/routes/runs.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- lifecycle`
  - Expected: legal lifecycle transitions pass and illegal pause/resume return 409.
- Command: `pnpm --filter workflow-server test -- ITX-005|ITX-007`
  - Expected: safe-point pause and reconcile idempotence are deterministic.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-LIFE-001 | `pause-resume-guards.spec.ts` | Pause accepted only from `running`. |
| Behavior-B-LIFE-003 | `pause-resume-guards.spec.ts` | Resume accepted only from `paused`. |
| Behavior-B-LIFE-007 | `reconcile-service.ts`, `recovery-idempotent.spec.ts` | Reconcile idempotent + lock-protected counts reported. |
| Integration-ITX-006 | `pause-resume-guards.spec.ts` | Duplicate resume race yields one logical resume progression. |
