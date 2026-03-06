# WS-12 - E2E Suite and Golden Scenario Validation

## Depends On
- `WS-04`, `WS-05`, `WS-06`, `CLI-00`, `REF-00`

## Objective
Implement E2E acceptance suite that validates externally visible contracts and full-stack behavior across API, persistence, events, and observability outputs.

## Implementation Tasks
- [x] Implement E2E tests for behavior families:
  - loading/registry (`B-LOAD-*`)
  - start/idempotency (`B-START-*`)
  - event integrity (`B-EVT-*`)
  - transitions (`B-TRANS-*`)
  - child composition (`B-CHILD-*`)
  - command execution (`B-CMD-*`)
  - lifecycle controls (`B-LIFE-*`)
  - API reads/queries (`B-API-*`)
  - persistence and observability (`B-DATA-*`, `B-OBS-*`)
- [x] Implement golden scenarios:
  - `GS-001` happy path with child + command
  - `GS-002` child failure propagation
  - `GS-003` pause/resume then completion
  - `GS-004` cancellation propagation
  - `GS-005` crash recovery reconciliation
- [x] Ensure tests assert all four dimensions from `behaviors.md` section 1.2:
  - API contract
  - persistence
  - event stream correctness
  - observability outputs
- [x] Add CLI E2E checks for `B-CLI-001..004` against running server.

## Required Artifacts
- `packages/workflow-server/test/e2e/*`
- `apps/workflow-cli/test/e2e/*`

## Acceptance Criteria
- Golden scenarios pass reliably in CI.
- Every critical `B-*` behavior in sections 2-10 is covered by at least one E2E test.
- Shared integration/E2E coverage behaviors (`ITX` section 5.2) have E2E happy-path proofs.

## Spec/Behavior Links
- Behaviors: `B-*` entire document, `GS-001..005`.
- Spec: `docs/architecture.md` (testing strategy & acceptance criteria).

## Fixed Implementation Decisions
- E2E runner: `vitest` with server process launched per suite and isolated test DB schema.
- Golden scenarios execute against real Postgres and loaded reference package.
- Each E2E test must assert API + persistence + events + observability dimensions.

## Interface/Schema Contracts
- E2E fixture contract:
  - starts server with `DATABASE_URL`, package path config, and deterministic reference fixtures.
- Assertion contract per test:
  - API response semantics
  - DB row/state check
  - event stream ordering check
  - log/trace/metric presence check.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/e2e/behaviors/load.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/start.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/events-integrity.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/transitions.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/child.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/command.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/lifecycle.spec.ts`
- `packages/workflow-server/test/e2e/behaviors/api-read.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-001.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-002.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-003.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-004.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-005.spec.ts`
- `apps/workflow-cli/test/e2e/cli-behaviors.spec.ts`

### Modify
- `packages/workflow-server/test/e2e/setup.ts`

## Verification
- Command: `pnpm --filter workflow-server test:e2e`
  - Expected: all `B-*` families and `GS-001..005` pass with 4-dimension assertions.
- Command: `pnpm --filter workflow-cli test:e2e`
  - Expected: `B-CLI-001..004` behavior checks pass.

## One-to-One Requirement Mapping
Authoritative per-ID mapping for all `B-*` and `GS-*` requirements is maintained in:
- `docs/testing/coverage-matrix.md`

| Requirement ID | Test File | Expected Assertion |
|---|---|---|
| GS-001 | `golden/GS-001.spec.ts` | Happy path parent+child+command completes with linked telemetry. |
| GS-002 | `golden/GS-002.spec.ts` | Child failure propagates and parent fails by default policy. |
| GS-003 | `golden/GS-003.spec.ts` | Pause/resume lifecycle checkpoints and invalid 409 paths verified. |
| GS-004 | `golden/GS-004.spec.ts` | Cancellation propagates through active descendants. |
| GS-005 | `golden/GS-005.spec.ts` | Crash recovery reconcile is idempotent and ordered before new work. |
