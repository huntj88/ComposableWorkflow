# TWEB06 - Events/Logs Filters, Correlation, and Realtime List Behavior

## Depends On
- `TWEB02`
- `TWEB03`
- `TWEB04`

## Objective
Implement event timeline and logs panel filtering semantics, explicit link-mode synchronization constraints, and realtime append/auto-follow behavior with scroll preservation and jump-to-latest UX.

## Fixed Implementation Decisions
- Events/logs filters remain independent unless explicit link mode is enabled.
- Link mode default is OFF and synchronizes only `since`/`until` plus available correlation context.
- Realtime append behavior preserves scroll unless auto-follow is on.

## Interface/Schema Contracts
- Event query keys: `eventType`, `since`, `until` (+ text filter local semantics).
- Log query keys: `severity`, `since`, `until`, `correlationId`, `eventId`.
- Event free-text semantics: case-insensitive substring over `eventType`, `state`, `transition.name`, string payload values, and `error.message`; whitespace-only input means no text filter.
- Pagination/ordering semantics: events and logs default `limit=100`, max `500`; events append by `sequence ASC`; logs ordered `timestamp ASC` then `eventId ASC` tie-break.

## Implementation Tasks
- [x] Implement events panel filters and chronological append rendering.
- [x] Implement logs panel filters with exact shared query key serialization.
- [x] Implement explicit link-filters mode and limited synchronization behavior.
- [x] Implement event free-text matching domain exactly per Section 9.3 semantics.
- [x] Enforce event/log default and max limit semantics in transport-bound UI requests.
- [x] Enforce deterministic logs ordering assertions (`timestamp ASC`, tie-break `eventId ASC`).
- [x] Implement auto-follow, scroll preservation, and jump-to-latest interactions.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/state/filterStore.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/state/filterStore.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx`
- `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx`

## Acceptance Criteria
- Event/log filter dimensions and serialization semantics match spec.
- Panel filters are independent except explicit link mode sync behavior.
- Event free-text matching domain and whitespace semantics follow normative rules.
- Event/log defaults/max limits and ordering behavior are deterministic and contract-conformant.
- Realtime append honors auto-follow preference and preserves user scroll context.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/stream/itx.web.stream.ITX-WEB-033.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/transport/itx.web.transport.ITX-WEB-039.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-013.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-024 | `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx` | Event filters and ordered append semantics are implemented. |
| B-WEB-025 | `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx` | Logs filters preserve required query dimensions and correlation semantics. |
| B-WEB-026 | `apps/workflow-web/src/routes/run-detail/state/filterStore.ts` | Filter independence + explicit link-mode behavior is enforced. |
| B-WEB-040 | `apps/workflow-web/src/routes/run-detail/state/filterStore.ts` | Causal navigation chain preserves run-scoped graph/event/log correlation updates. |
| B-WEB-045 | `apps/workflow-web/src/routes/run-detail/components/EventsTimelinePanel.tsx` | Auto-follow/scroll/jump behavior is deterministic and non-blocking. |
| B-WEB-052 | `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx` | Event/log query bounds and key semantics preserve shared contracts. |
