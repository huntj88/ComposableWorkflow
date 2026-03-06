# WS-02 - Orchestration Engine Core

## Depends On
- `WL-00`, `WS-00`, `WS-01`

## Objective
Build `workflow-server` execution engine with single-runner semantics, event append flow, and deterministic state progression.

## Implementation Tasks
- [x] Implement run creation pipeline:
  - id generation
  - initial lifecycle/state setup
  - `workflow.started` event append
- [x] Implement orchestrator execution loop:
  - state handler dispatch
  - transition request/completion/failure event flow
  - terminalization handling (`completed|failed|cancelled`)
- [x] Enforce single logical runner per `runId`:
  - lock interface (in-memory + database adapter)
  - loser behavior exits without state mutation
- [x] Implement idempotent start key path to avoid duplicate logical runs.
- [x] Add deterministic crash-safe boundaries for durable append before critical acknowledgment.
- [x] Add unit tests for lock arbitration, idempotent start decision logic, and transition-runner guard paths.
- [x] Add integration tests for runner lock, sequence monotonicity, and idempotent start races.

## Required Artifacts
- `packages/workflow-server/src/orchestrator/*`
- `packages/workflow-server/src/locking/*`
- `packages/workflow-server/test/integration/orchestrator/*`

## Acceptance Criteria
- Exactly one active runner mutates a run at a time.
- Event stream is append-only with strict per-run sequence ordering.
- Critical durability ordering contract is preserved under injected failures.
- Unit tests validate orchestration decision logic independent of DB/network integration paths.

## Spec/Behavior Links
- Spec: sections 4.3, 7.2, 12.
- Behaviors: `B-START-001`, `B-START-003`, `B-TRANS-001`, `B-TRANS-003`, `B-DATA-001`.
- Integration: `ITX-001`, `ITX-002`, `ITX-003`, `ITX-004`.

## Fixed Implementation Decisions
- Orchestrator execution model: single-threaded run loop per `runId` with lease-based lock.
- Lock backend for MVP: Postgres advisory lock + in-memory fallback for unit tests.
- Id generation format: `wr_<ulid>`.
- Workflow/state/action failure retries are never automatic in server orchestration; retry paths are authored in workflow FSM transitions.
- Uncaught state/action errors emit failure events and transition run to terminal `failed`.

## Interface/Schema Contracts
- Lock provider interface:
  - `acquire(runId, ownerId, ttlMs): Promise<boolean>`
  - `renew(runId, ownerId, ttlMs): Promise<void>`
  - `release(runId, ownerId): Promise<void>`
- Orchestrator entrypoints:
  - `startRun(request): Promise<StartRunResponse>`
  - `resumeRun(runId): Promise<void>`
- Idempotency response contract:
  - duplicate request returns existing `runId` and existing run summary.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/orchestrator/orchestrator.ts`
- `packages/workflow-server/src/orchestrator/start-run.ts`
- `packages/workflow-server/src/orchestrator/transition-runner.ts`
- `packages/workflow-server/src/locking/lock-provider.ts`
- `packages/workflow-server/src/locking/postgres-advisory-lock.ts`
- `packages/workflow-server/test/integration/orchestrator/single-runner-lock.spec.ts`
- `packages/workflow-server/test/integration/orchestrator/idempotent-start-race.spec.ts`
- `packages/workflow-server/test/integration/orchestrator/sequence-monotonicity.spec.ts`

### Modify
- `packages/workflow-server/src/bootstrap.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- orchestrator`
  - Expected: exactly one concurrent runner acquires lock; loser does not mutate run state.
- Command: `pnpm --filter workflow-server test -- ITX-001|ITX-004`
  - Expected: durable append-before-ack and idempotent dedupe race tests pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Behavior-B-START-001 | `start-run.ts` | Start returns running metadata and emits `workflow.started`. |
| Behavior-B-START-003 | `idempotent-start-race.spec.ts` | Duplicate idempotency key creates one logical run. |
| Behavior-B-TRANS-003 | `sequence-monotonicity.spec.ts` | Per-run ordering is monotonic under load. |
| Integration-ITX-003 | `single-runner-lock.spec.ts` | One active runner lock per run. |
