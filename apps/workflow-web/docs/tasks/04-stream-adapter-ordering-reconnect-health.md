# TWEB04 - SSE Stream Adapter, Ordering, Reconnect, and Health

## Depends On
- `TWEB02`
- `TWEB03`

## Objective
Implement typed SSE streaming for run dashboards with deterministic incremental updates, strict dedup/non-regression ordering, cursor resume semantics, reconnect policy constants, and visible non-blocking stream health.

## Fixed Implementation Decisions
- SSE wire contract uses `event: workflow-event`, `id` cursor, and `data` frame JSON.
- Dedup/non-regression uses `(runId, sequence)` and highest-accepted watermark.
- Reconnect policy constants are fixed (`500ms`, `2x`, full-jitter, `30s` cap, `45s` stale).

## Interface/Schema Contracts
- `WorkflowStreamFrame`, `WorkflowStreamEvent`, `EventCursor`.
- Stream/ordering semantics from spec sections 5.3, 5.4, 5.5, 6.9.

## Implementation Tasks
- [ ] Implement typed EventSource adapter and run stream abstraction.
- [ ] Persist `lastSeenCursor` from accepted frame IDs and reconnect with cursor query.
- [ ] Enforce sequence-driven ordering, dedup, and strict non-regression rules.
- [ ] Implement health states (`connected`, `reconnecting`, `stale`) with non-blocking UX.
- [ ] Enforce stream query `eventType` handling so unsupported values surface explicit request error state.
- [ ] Surface unsupported stream variants visibly in dev/test.

## Required Artifacts
- `apps/workflow-web/src/stream/openRunStream.ts`
- `apps/workflow-web/src/stream/reconnectPolicy.ts`
- `apps/workflow-web/src/stream/applyStreamFrame.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/stream/openRunStream.ts`
- `apps/workflow-web/src/stream/reconnectPolicy.ts`
- `apps/workflow-web/src/stream/applyStreamFrame.ts`
- `apps/workflow-web/test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx`

## Acceptance Criteria
- Snapshot + stream updates are incremental and sequence-ordered.
- Reconnect uses opaque cursor semantics and deduplicates overlaps.
- Health state transitions are visible and non-blocking to in-progress drafts.
- Unsupported stream `eventType` query filters surface explicit request error state.
- Unknown stream variants fail visibly in development/test builds.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.ITX-WEB-005.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.ITX-WEB-006.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.ITX-WEB-040.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.unsupported-eventType-filter.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-015 | `apps/workflow-web/src/stream/openRunStream.ts` | SSE adapter parses/dispatches typed `WorkflowStreamFrame` payloads. |
| B-WEB-016 | `apps/workflow-web/src/stream/applyStreamFrame.ts` | Incremental ordered patching updates dashboard state without full reload. |
| B-WEB-017 | `apps/workflow-web/src/stream/openRunStream.ts` | Cursor resume + dedup semantics enforce strict greater-than boundary. |
| B-WEB-018 | `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx` | Stream health state is visible and non-blocking during reconnect. |
| B-WEB-019 | `apps/workflow-web/src/stream/applyStreamFrame.ts` | Unsupported variants fail visibly in dev/test. |
| B-WEB-039 | `apps/workflow-web/src/stream/reconnectPolicy.ts` | Reconnect uses exponential backoff with visible non-blocking status. |
| B-WEB-049 | `apps/workflow-web/src/stream/openRunStream.ts` | Cursor persistence uses accepted SSE `id` with opaque-token handling. |
| B-WEB-050 | `apps/workflow-web/src/stream/applyStreamFrame.ts` | Duplicate/out-of-order events never regress rendered state. |
| B-WEB-053 | `apps/workflow-web/src/stream/reconnectPolicy.ts` | Backoff constants and stale threshold are deterministic and enforced. |
