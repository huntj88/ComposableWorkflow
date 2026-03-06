# T02 - Postgres Persistence and Migration Baseline

## Depends On
- `T00`

## Objective
Implement durable persistence for workflow definitions, runs, events, and optional snapshot optimization tables with migration safety.

## Implementation Tasks
- [x] Choose migration tool and wire startup migration execution.
- [x] Create schema:
  - `workflow_definitions`
  - `workflow_runs`
  - `workflow_events`
  - `workflow_run_children` (required)
  - `workflow_snapshots` (optional optimization)
  - migration `001_init_workflow_tables.ts` must mirror the `workflow_run_children` DDL contract in `docs/typescript-server-workflow-spec.md` section 3 (columns, PK/FK/unique, and indexes)
- [x] Add indexes for:
  - event query path (`runId`, `sequence`, `eventType`, `timestamp`)
  - run listing filters (`lifecycle`, `workflowType`, time fields)
- [x] Implement transactional repository interfaces:
  - append event with sequence allocation
  - upsert run summary projection
  - idempotent start key storage/query
- [x] Add unit tests for repository-level pure logic (query builders, row mapping, and transaction boundary helpers).
- [x] Add storage invariants tests against real Postgres container.

## Required Artifacts
- `packages/workflow-server/src/persistence/*`
- `packages/workflow-server/migrations/*`
- `packages/workflow-server/test/integration/persistence/*`

## Acceptance Criteria
- Migrations are repeatable and safe across clean and existing DB states.
- Event append and run projection update are atomic under transaction boundaries.
- Unit tests cover repository helper logic and transaction contracts; integration tests cover real DB invariants.
- Data model supports all required API reads without schema changes later.

## Spec/Behavior Links
- Spec: sections 7.3, 8.4, 9, 12.
- Behaviors: `B-DATA-001`, `B-DATA-002`, `B-DATA-003`, `B-API-002`.

## Fixed Implementation Decisions
- Migration tool: `node-pg-migrate`.
- DB client: `pg` with pooled connections.
- Sequence monotonicity strategy: transactional `SELECT COALESCE(MAX(sequence),0)+1 FOR UPDATE` per run row lock.
- Idempotency: dedicated table keyed by `(workflow_type, idempotency_key)` with unique index.

## Interface/Schema Contracts
- Tables (minimum columns):
  - `workflow_runs(run_id PK, workflow_type, workflow_version, lifecycle, current_state, parent_run_id, started_at, ended_at)`
  - `workflow_events(event_id PK, run_id FK, sequence, event_type, timestamp, payload_jsonb, error_jsonb)`
  - `workflow_definitions(workflow_type PK, workflow_version, metadata_jsonb, registered_at)`
  - `workflow_idempotency(workflow_type, idempotency_key, run_id, created_at, PRIMARY KEY(workflow_type, idempotency_key))`
- Transaction contract:
  - append event + update run projection execute within one transaction for critical transitions.

## File Plan (Exact)
### Create
- `packages/workflow-server/migrations/001_init_workflow_tables.ts`
- `packages/workflow-server/migrations/002_add_indexes.ts`
- `packages/workflow-server/src/persistence/db.ts`
- `packages/workflow-server/src/persistence/run-repository.ts`
- `packages/workflow-server/src/persistence/event-repository.ts`
- `packages/workflow-server/src/persistence/definition-repository.ts`
- `packages/workflow-server/src/persistence/idempotency-repository.ts`
- `packages/workflow-server/test/integration/persistence/atomic-append.spec.ts`
- `packages/workflow-server/test/integration/persistence/idempotency.spec.ts`

### Modify
- `packages/workflow-server/package.json`

## Verification
- Command: `pnpm --filter workflow-server migrate:up`
  - Expected: migrations apply cleanly on empty DB and no-op when already applied.
- Command: `pnpm --filter workflow-server test -- persistence`
  - Expected: atomic append/projection and idempotency uniqueness tests pass.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| Spec-7.3-PersistenceModel | `001_init_workflow_tables.ts` | Required entities exist in schema. |
| Spec-12-DurableAppendBeforeAck | `event-repository.ts` | Critical transition append occurs before ack path completion. |
| Behavior-B-DATA-001 | `atomic-append.spec.ts` | Durable append ordering proven under injected fault window. |
| Behavior-B-API-002 | `002_add_indexes.ts` | Event query path supports ordered, filtered pagination. |
