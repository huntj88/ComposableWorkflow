# WS-10 - Integration Suite A: Atomicity, Ordering, Concurrency

## Depends On
- `WS-04`, `WS-05`, `WS-06`, `WS-09`

## Objective
Implement integration-primary tests focused on transactional correctness and concurrency races.

## Implementation Tasks
- [x] Add test files using naming convention `itx.<domain>.<behavior-id>.spec.ts`.
- [x] Implement test coverage for:
  - `ITX-001` event append atomicity around ack boundary
  - `ITX-002` per-run sequence monotonicity under concurrent writers
  - `ITX-003` single active runner lock per run
  - `ITX-004` idempotency dedupe race
  - `ITX-016` cursor pagination stability under concurrent appends
  - `ITX-017` snapshot consistency (when snapshots enabled)
  - `ITX-018` child-linkage transactional/idempotent write semantics
- [x] Include fault injection checkpoints before/after DB append and lock acquisition.
- [x] Assert no duplicate logical progression on retry/restart paths.

## Required Artifacts
- `packages/workflow-server/test/integration/itx.persistence.*`
- `packages/workflow-server/test/integration/itx.concurrency.*`
- `packages/workflow-server/test/integration/itx.api.*`

## Acceptance Criteria
- All included ITX tests pass deterministically in CI.
- No flaky sleep-based synchronization in race tests.

## Spec/Behavior Links
- Integration: `ITX-001`, `ITX-002`, `ITX-003`, `ITX-004`, `ITX-016`, `ITX-017`, `ITX-018`.
- Behaviors: `B-DATA-001`, `B-TRANS-003`, `B-START-003`, `B-API-002`, `B-DATA-002`, `B-DATA-003`.

## Fixed Implementation Decisions
- All tests run against real Postgres container (no in-memory fallback for this suite).
- Synchronization uses barriers/latches only; sleep-based timing is prohibited.
- Test naming contract: `itx.<domain>.ITX-###.spec.ts` exactly.

## Interface/Schema Contracts
- Fault checkpoint names (mandatory):
  - `before_event_append`, `after_event_append_before_ack`, `before_lock_acquire`, `after_lock_acquire`.
- Pagination cursor contract under test:
  - opaque cursor from last seen sequence; stable ordering by `sequence` ascending.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/integration/itx.persistence.ITX-001.spec.ts`
- `packages/workflow-server/test/integration/itx.concurrency.ITX-002.spec.ts`
- `packages/workflow-server/test/integration/itx.concurrency.ITX-003.spec.ts`
- `packages/workflow-server/test/integration/itx.start.ITX-004.spec.ts`
- `packages/workflow-server/test/integration/itx.api.ITX-016.spec.ts`
- `packages/workflow-server/test/integration/itx.persistence.ITX-017.spec.ts`
- `packages/workflow-server/test/integration/itx.persistence.ITX-018.spec.ts`

### Modify
- `packages/workflow-server/test/integration/setup.ts`

## Verification
- Command: `pnpm --filter workflow-server test -- ITX-001|ITX-002|ITX-003|ITX-004|ITX-016|ITX-017|ITX-018`
  - Expected: all tests pass deterministically with no retries due to timing flake.

## One-to-One Requirement Mapping
| Requirement ID | Test File | Expected Assertion |
|---|---|---|
| ITX-001 | `itx.persistence.ITX-001.spec.ts` | No duplicate completion across crash window around ack boundary. |
| ITX-002 | `itx.concurrency.ITX-002.spec.ts` | Sequence monotonic + gap-free under contention. |
| ITX-003 | `itx.concurrency.ITX-003.spec.ts` | Exactly one runner acquires lease per run. |
| ITX-004 | `itx.start.ITX-004.spec.ts` | Exactly one logical run created for duplicate idempotency key race. |
| ITX-016 | `itx.api.ITX-016.spec.ts` | Cursor pagination yields no duplicates/omissions with concurrent append. |
| ITX-017 | `itx.persistence.ITX-017.spec.ts` | Snapshot state equals replay-derived state when snapshots enabled. |
| ITX-018 | `itx.persistence.ITX-018.spec.ts` | Child linkage write is transactional with lineage event append and remains duplicate-safe across retries/recovery. |
