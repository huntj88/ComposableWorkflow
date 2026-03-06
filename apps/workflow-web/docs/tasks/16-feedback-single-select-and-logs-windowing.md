# WEB-16 - Feedback Single-Select and Logs Windowing

## Depends On
- `WEB-05`
- `WEB-06`

## Objective
Tighten feedback option selection to single-select semantics and upgrade the logs panel to use a bounded initial window, incremental loading, independent scrolling, new-log indicators, auto-follow behavior, and deterministic filter-reset handling.

## Fixed Implementation Decisions
- Feedback options use radio-style single-select controls; the UI never emits a multi-value `selectedOptionIds` payload.
- Logs keep existing query/filter semantics but move to windowed rendering so the full corpus is not painted at once.
- Applying or clearing log filters resets both the window and scroll position before new log results are rendered.

## Interface/Schema Contracts
- `SubmitHumanFeedbackResponseRequest`
- `GetRunLogsQuery`
- `RunLogsResponse`
- `WorkflowStreamFrame`

## Implementation Tasks
- [ ] Replace multi-select feedback option affordances with single-select controls and required-option submit gating.
- [ ] Ensure feedback submission payloads never contain more than one `selectedOptionIds` element.
- [ ] Add bounded initial log rendering using the default `GetRunLogsQuery.limit` window and incremental load-more behavior.
- [ ] Preserve logs-panel independent scrolling and show a non-blocking "new logs" indicator plus jump-to-latest behavior when the user is away from the bottom.
- [ ] Auto-follow new `log` stream events only when the user is already at the bottom of the log list.
- [ ] Re-fetch logs on filter changes and reset the log window plus scroll position deterministically.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts`
- `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/hooks/useLogsWindowing.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/hooks/useLogsWindowing.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts`
- `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx`

## Acceptance Criteria
- Feedback option controls are single-select and never allow multi-value `selectedOptionIds` emission.
- Feedback submit remains disabled until exactly one required option is selected.
- Logs render a bounded initial window and load additional entries incrementally rather than rendering the full corpus at once.
- Logs scrolling remains independent from other dashboard panels.
- A non-blocking "new logs" indicator appears when the user is away from the latest entries; jump-to-latest and auto-follow semantics remain deterministic.
- Applying or clearing log filters re-fetches with updated `GetRunLogsQuery` values and resets both the log window and scroll position.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-051.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/logs/itx.web.logs.ITX-WEB-052.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-067 | `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx` | Human feedback option controls enforce single-select semantics and valid payload emission. |
| B-WEB-068 | `apps/workflow-web/src/routes/run-detail/components/LogsPanel.tsx` | Logs windowing, independent scrolling, live append, and filter-reset semantics are enforced. |
