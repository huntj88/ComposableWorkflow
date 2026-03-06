# WEB-02 - Run Dashboard Snapshot Boot, Panels, and Actions

## Depends On
- `WEB-00`
- `WEB-01`

## Objective
Implement `/runs/:runId` dashboard snapshot boot sequencing, six required panels, panel isolation/retry behavior, run-not-found handling, and run actions (refresh/cancel) with metadata-complete summary/timeline rendering.

## Fixed Implementation Decisions
- Snapshot calls run in functional order from summary through feedback before stream open.
- Failures remain panel-scoped with explicit per-panel retry controls.
- `404` summary produces dedicated run-not-found state and route-back action.

## Interface/Schema Contracts
- `RunSummaryResponse`, `RunTreeResponse`, `RunEventsResponse`, `RunLogsResponse`, `WorkflowDefinitionResponse`, `ListRunFeedbackRequestsResponse`, `CancelRunResponse`.

## Implementation Tasks
- [x] Implement `/runs/:runId` route composition with six required panels.
- [x] Wire initial snapshot call sequence and post-snapshot stream-open trigger.
- [x] Implement panel-scoped loading/empty/error/retry isolation.
- [x] Implement refresh and cancel action semantics by lifecycle state.
- [x] Render summary and timeline required metadata fields.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx`
- `apps/workflow-web/src/routes/run-detail/useRunDashboardQueries.ts`
- `apps/workflow-web/src/routes/run-detail/components/*.tsx`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx`
- `apps/workflow-web/src/routes/run-detail/useRunDashboardQueries.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/RunSummaryPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx`

## Acceptance Criteria
- Required snapshots are invoked and six panels are rendered.
- Panel failures are isolated/retryable without global blanking.
- Run-summary `404` path renders run-not-found state with navigation back to `#/runs`.
- Refresh/cancel semantics and metadata rendering match spec.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.dashboard.ITX-WEB-002.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.dashboard.ITX-WEB-003.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/routes/itx.web.dashboard.ITX-WEB-004.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-005 | `apps/workflow-web/src/routes/run-detail/useRunDashboardQueries.ts` | Initial snapshot sequence matches required order/scope. |
| B-WEB-006 | `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx` | Six required panels are rendered from server data. |
| B-WEB-007 | `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx` | `404` summary renders dedicated not-found state and back navigation. |
| B-WEB-008 | `apps/workflow-web/src/routes/run-detail/components/*.tsx` | Panel-level failures are isolated with explicit retries. |
| B-WEB-036 | `apps/workflow-web/src/routes/run-detail/RunDetailPage.tsx` | Refresh/cancel actions follow route-safe semantics. |
| B-WEB-037 | `apps/workflow-web/src/routes/run-detail/components/RunSummaryPanel.tsx` | Required summary/timeline metadata fields are visible. |
