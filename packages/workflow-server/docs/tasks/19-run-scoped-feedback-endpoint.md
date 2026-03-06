# WS-19 - Run-Scoped Feedback Requests Endpoint

## Depends On
- `API-00`
- `WS-17`
- `WS-18`

## Objective
Implement `GET /api/v1/workflows/runs/{runId}/feedback-requests` as a run-scoped, paginated, filterable endpoint that returns feedback requests associated with a specific run lineage. Reads from the `human_feedback_requests` projection keyed by `parent_run_id`. This endpoint is required for deterministic feedback discovery in run dashboards without prior `feedbackRunId` knowledge.

## Fixed Implementation Decisions
- Source is the `human_feedback_requests` projection table (no event-stream replay on read path).
- Run-scoping is enforced: only feedback requests where `parent_run_id` matches the path `runId` are returned.
- Endpoint transport query/response contracts must be imported from `@composable-workflow/workflow-api-types` (`ListRunFeedbackRequestsQuery`, `ListRunFeedbackRequestsResponse`, `RunFeedbackRequestSummary`) with no local DTO redefinition at route handler/service boundaries.
- Default status filter: `awaiting_response,responded` (matches B-API-009 contract).
- Default limit: `50`, max: `200`.
- Sort order: `requested_at DESC`, tie-break by `feedback_run_id ASC`.
- Pagination cursor is opaque and stable across reconnect/retry.
- Response contract: `ListRunFeedbackRequestsResponse` with `items: RunFeedbackRequestSummary[]` and `nextCursor?: string`.
- Endpoint is registered under the runs route prefix since it is run-scoped.

## Interface/Schema Contracts
- Request/query/response contract ownership is `@composable-workflow/workflow-api-types` (spec Sections 6.9/6.9.2); server route parsing may adapt transport input but must not redefine covered transport DTOs.
- Query parameters:
  - `status`: optional CSV of `awaiting_response|responded|cancelled` (default: `awaiting_response,responded`).
  - `limit`: optional integer (default `50`, max `200`).
  - `cursor`: optional opaque pagination cursor string.
- Response body: `{ items: RunFeedbackRequestSummary[], nextCursor?: string }`.
- `RunFeedbackRequestSummary` fields (per spec Section 4.12): `feedbackRunId`, `parentRunId`, `questionId`, `status`, `requestedAt`, `respondedAt?`, `cancelledAt?`, `respondedBy?`, `prompt`, `options`, `constraints`.

## Implementation Tasks
- [x] Use shared transport contracts from `@composable-workflow/workflow-api-types` for query/response typing in route handler/service boundaries; avoid local DTO declarations for covered endpoint contracts.
- [x] If runtime validation schemas are required for this endpoint, source/re-export canonical schemas from `workflow-api-types` rather than defining divergent server-local transport schemas.
- [x] Implement route handler in `packages/workflow-server/src/api/routes/run-feedback-requests.ts`.
- [x] Add run-scoped query to persistence layer: `SELECT ... FROM human_feedback_requests WHERE parent_run_id = $1` with status filter, sort, limit, and cursor pagination.
- [x] Register route in `packages/workflow-server/src/api/server.ts`.
- [x] Add E2E behavior test `B-API-009` in `packages/workflow-server/test/e2e/behaviors/api-feedback-requests.spec.ts`.
- [x] Add black-box parity test in `packages/workflow-server/test/e2e-blackbox/human-feedback/run-feedback-requests.spec.ts`.
- [x] Add CLI command `workflow feedback list --run-id <runId>` variant that calls the run-scoped endpoint.
- [x] Verify run-scoping: unrelated feedback requests from other runs are never returned.
- [x] Verify default status filter excludes `cancelled` unless explicitly requested.
- [x] Update coverage matrix.

## Required Artifacts
- `packages/workflow-server/src/api/routes/run-feedback-requests.ts`
- `packages/workflow-server/test/e2e/behaviors/api-feedback-requests.spec.ts`
- `packages/workflow-server/test/e2e-blackbox/human-feedback/run-feedback-requests.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/src/api/routes/run-feedback-requests.ts`
- `packages/workflow-server/test/e2e/behaviors/api-feedback-requests.spec.ts`
- `packages/workflow-server/test/e2e-blackbox/human-feedback/run-feedback-requests.spec.ts`

### Modify
- `packages/workflow-server/src/api/server.ts` (register new route)
- `packages/workflow-server/src/api/routes/run-feedback-requests.ts` (import endpoint transport contracts from `@composable-workflow/workflow-api-types`)
- `apps/workflow-cli/src/commands/feedback-list.ts` (add `--run-id` option for run-scoped listing)
- `apps/workflow-cli/src/http/client.ts` (add run-scoped feedback list method)
- `docs/testing/coverage-matrix.md`

## Acceptance Criteria
- `GET /api/v1/workflows/runs/{runId}/feedback-requests` returns only feedback requests for the specified run.
- Default status filter is `awaiting_response,responded`.
- Pagination with `cursor` is stable (no duplicates/omissions).
- Results are sorted by `requested_at DESC`, tie-break by `feedback_run_id ASC`.
- Unrelated feedback requests from other runs are never returned.
- `limit` is capped at `200`.
- Non-existent `runId` returns empty result set (not 404).
- Route handler/service transport types for this endpoint come from `@composable-workflow/workflow-api-types` with no local duplicate DTO definitions.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- api-feedback-requests`
  - Expected: run-scoped feedback listing, filtering, pagination, and isolation tests pass.
- Command: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox -- run-feedback-requests`
  - Expected: black-box parity test passes.
- Command: `pnpm --filter @composable-workflow/workflow-cli test -- feedback-list`
  - Expected: CLI run-scoped feedback list contract test passes.

## Spec/Behavior Links
- Spec: sections 6.9, 6.9.1, 6.9.2, 8.
- Behaviors: `B-API-009`, `B-CONTRACT-001`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-API-009 | `src/api/routes/run-feedback-requests.ts` | Endpoint returns run-scoped paginated feedback requests with status filter, default behavior, and sort contract as specified. |
| B-CONTRACT-001 | `src/api/routes/run-feedback-requests.ts` | Endpoint handler/service boundaries for run-scoped feedback requests import transport contracts from `@composable-workflow/workflow-api-types` without local duplicate DTOs. |
