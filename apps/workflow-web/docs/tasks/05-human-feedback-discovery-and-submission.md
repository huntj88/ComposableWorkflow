# TWEB05 - Human Feedback Discovery, Prioritization, and Submission

## Depends On
- `TWEB02`
- `TWEB03`
- `TWEB04`

## Objective
Implement run-scoped human feedback discovery, awaiting-first prioritization, in-context detail expansion, validation-aware submission UX, and stable pagination/order semantics for feedback requests.

## Fixed Implementation Decisions
- Dashboard feedback discovery uses `GET /api/v1/workflows/runs/{runId}/feedback-requests`.
- Default status query is `awaiting_response,responded`; default limit `50`, max `200`.
- `400` preserves drafts with validation details; `409` terminalizes interaction and shows timestamp metadata.

## Interface/Schema Contracts
- `ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse`, `RunFeedbackRequestSummary`.
- `SubmitHumanFeedbackResponseRequest`, `SubmitHumanFeedbackResponseResponse`, `SubmitHumanFeedbackResponseConflict`.

## Implementation Tasks
- [ ] Render run-scoped feedback list with awaiting-first visual priority.
- [ ] Implement feedback item selection details (prompt/options/form context).
- [ ] Enforce client validity gates and submission transitions.
- [ ] Render `400`/`409` semantics with draft preservation and terminal metadata.
- [ ] Enforce stable pagination and deterministic ordering semantics.

## Required Artifacts
- `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx`
- `apps/workflow-web/src/routes/run-detail/hooks/useFeedbackQueries.ts`
- `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts`

## File Plan (Exact)
### Create
- `apps/workflow-web/src/routes/run-detail/hooks/useFeedbackQueries.ts`
- `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts`

### Modify
- `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx`

## Acceptance Criteria
- Feedback discovery is run-scoped and awaiting items are prioritized.
- Selection reveals full in-context response details.
- Submit behavior matches success/`400`/`409` semantics with draft preservation.
- Pagination/defaults/order stability conform to shared/server contract.

## Verification
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-011.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-012.spec.ts`
- `pnpm --filter @composable-workflow/workflow-web exec vitest run test/integration/feedback/itx.web.feedback.ITX-WEB-038.spec.ts`

## One-to-One Requirement Mapping
| Requirement ID | Primary Artifact | Verification Assertion |
|---|---|---|
| B-WEB-020 | `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx` | Awaiting requests are prioritized above terminal statuses. |
| B-WEB-021 | `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts` | Valid submit transitions to terminal state without full reload. |
| B-WEB-022 | `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts` | `400` response preserves draft and shows validation details. |
| B-WEB-023 | `apps/workflow-web/src/routes/run-detail/hooks/useSubmitFeedback.ts` | `409` conflict shows terminal metadata and disables resubmit. |
| B-WEB-038 | `apps/workflow-web/src/routes/run-detail/components/HumanFeedbackPanel.tsx` | Feedback selection reveals full prompt/options/form context. |
| B-WEB-051 | `apps/workflow-web/src/routes/run-detail/hooks/useFeedbackQueries.ts` | Run-feedback pagination/default ordering semantics are contract-conformant. |
