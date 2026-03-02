# T21 - Recovery Reconcile Progress-Gating Semantics

## Depends On
- `T06`
- `T20`

## Objective
Align reconciliation behavior to allow repeat recovery only when new workflow progression occurred after the latest recovery boundary, while preserving idempotence and duplicate-side-effect prevention.

## Implementation Tasks
- [ ] Persist and evaluate per-run recovery boundary metadata keyed to the latest emitted `workflow.recovered` checkpoint.
- [ ] Gate repeat reconciliation for `running` runs using progression evidence (at least one `transition.completed` after latest recovery boundary).
- [ ] Skip reconciliation side effects when no progression occurred since latest recovery boundary.
- [ ] Preserve lock-protected single-runner semantics and deterministic reconcile counters (`scanned|recovered|skipped|failed`).
- [ ] Add integration coverage for repeated reconcile passes with and without post-recovery progression.

## Required Artifacts
- `packages/workflow-server/src/recovery/reconcile-service.ts`
- `packages/workflow-server/src/recovery/recovery-state.ts`
- `packages/workflow-server/src/lifecycle/lifecycle-events.ts`
- `packages/workflow-server/test/integration/lifecycle/recovery-progress-gating.spec.ts`

## Acceptance Criteria
- A `running` run can be recovered again only when at least one `transition.completed` occurred after the latest `workflow.recovered`.
- Reconcile re-runs with no post-recovery progression produce no duplicate recovery side effects.
- Recovery remains idempotent, lock-protected, and operationally observable through reconcile counters.

## Spec/Behavior Links
- Spec: sections 11.1, 11.2.
- Behaviors: `B-LIFE-007`.
- Integration: `ITX-007`.

## Fixed Implementation Decisions
- Progress detection source-of-truth is persisted workflow events, not ephemeral runner memory.
- Recovery boundary reference event is latest `workflow.recovered` for the run.
- Reconcile skip-path emits deterministic diagnostics without mutating lifecycle state.

## Interface/Schema Contracts
- Reconcile endpoint response contract remains unchanged:
  - `{ scanned, recovered, skipped, failed, startedAt, completedAt }`.
- Internal recovery gate contract:
  - `hasProgressSinceRecoveryBoundary(runId)` is true only when a `transition.completed` sequence exists after latest `workflow.recovered` sequence.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/lifecycle/recovery-progress-gating.spec.ts`

### Modify
- `packages/workflow-server/src/recovery/reconcile-service.ts`
- `packages/workflow-server/src/recovery/recovery-state.ts`
- `packages/workflow-server/src/lifecycle/lifecycle-events.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- recovery-progress-gating`
  - Expected: reconcile re-runs recover only when post-boundary transition progression exists.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- recovery-idempotent`
  - Expected: idempotent behavior remains stable across repeated reconcile passes.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Recovery-Repeat-001-ProgressGate | `src/recovery/reconcile-service.ts` | repeat recover requires post-boundary `transition.completed`. |
| Recovery-Repeat-002-SkipNoProgress | `src/recovery/reconcile-service.ts` | no-progression reconcile pass skips duplicate side effects. |
| Recovery-Repeat-003-BoundarySource | `src/recovery/recovery-state.ts` | latest `workflow.recovered` boundary drives gate evaluation. |
| Recovery-Repeat-004-LifecycleEventIntegrity | `src/lifecycle/lifecycle-events.ts` | recovery checkpoint events remain consistent with lifecycle transitions. |
