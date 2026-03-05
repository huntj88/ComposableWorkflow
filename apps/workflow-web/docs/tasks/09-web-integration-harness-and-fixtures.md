# TWEB09 - Web Integration Harness and Deterministic Fixtures

## Depends On
- `TWEB00`
- `TWEB03`
- `TWEB04`
- `TWEB05`
- `TWEB06`
- `TWEB07`
- `TWEB08`

## Objective
Create deterministic integration harness capabilities for route rendering, typed transport mocking, stream frame injection with cursor control, fake-timer-driven reconnect/stale transitions, and reusable fixture factories for covered transport payloads.

## Fixed Implementation Decisions
- Integration runtime mounts route-level app with `HashRouter`.
- Stream injection supports ordered replay and reconnect overlap windows.
- Assertions are semantic (not snapshots) for graph and overlay behavior.

## Interface/Schema Contracts
- Fixture contracts sourced from `@composable-workflow/workflow-api-types`.
- Harness supports observability over query-cache and local UI store transitions.

## Implementation Tasks
- [x] Build route-level integration renderer and test utilities.
- [x] Implement typed transport mock boundary and call tracing.
- [x] Implement stream replay injector with sequence/cursor controls.
- [x] Implement fake-timer controls for reconnect backoff and stale transitions.
- [x] Add fixture factories for summary/tree/events/logs/definition/feedback/stream payloads.
- [x] Add deterministic viewport/resize controls for layout and graph direction assertions.
- [x] Add panel-local state probes for filter-store and query-cache transition assertions.
- [x] Add fixture helpers for malformed graph definitions and unknown runtime overlay references.

## Required Artifacts
- `apps/workflow-web/test/integration/harness/renderWebApp.tsx`
- `apps/workflow-web/test/integration/harness/mockTransport.ts`
- `apps/workflow-web/test/integration/harness/streamReplay.ts`
- `apps/workflow-web/test/integration/fixtures/*.ts`
- `apps/workflow-web/test/integration/harness/fakeViewport.ts`
- `apps/workflow-web/test/integration/fixtures/graphInvariantFixtures.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/test/integration/harness/renderWebApp.tsx`
- `apps/workflow-web/test/integration/harness/mockTransport.ts`
- `apps/workflow-web/test/integration/harness/streamReplay.ts`
- `apps/workflow-web/test/integration/fixtures/workflowFixtures.ts`
- `apps/workflow-web/test/integration/harness/fakeViewport.ts`
- `apps/workflow-web/test/integration/fixtures/graphInvariantFixtures.ts`

## Acceptance Criteria
- Harness supports deterministic route, transport, and stream behavior assertions.
- Fake-timer controls enable precise reconnect/stale-time tests.
- Shared-contract fixture factories cover all dashboard transport surfaces.
- Harness supports deterministic viewport permutation and graph invariant violation fixture injection.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/harness`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| ITX-WEB-005 | `apps/workflow-web/test/integration/harness/streamReplay.ts` | Ordered stream replay supports deterministic incremental patch assertions. |
| ITX-WEB-006 | `apps/workflow-web/test/integration/harness/streamReplay.ts` | Reconnect overlap and dedup windows are controllable and testable. |
| ITX-WEB-027 | `apps/workflow-web/test/integration/harness/streamReplay.ts` | Backoff timing behavior is testable via fake timers and scheduling hooks. |
