# WS-22 - Golden Scenarios: Human Feedback E2E

## Depends On
- `REF-00`
- `WS-17`
- `WS-18`
- `WS-19`

## Objective
Implement the two remaining E2E golden scenarios for human feedback: GS-006 (request-response round trip) and GS-007 (feedback cancellation propagation). These scenarios validate multiple behavior families at once and require the run-scoped feedback endpoint (B-API-009) from WS-19.

## Fixed Implementation Decisions
- Golden scenarios use the same harness infrastructure as GS-001 through GS-005.
- GS-006 requires the `reference.human-feedback-roundtrip.v1` workflow from `packages/workflow-package-reference`.
- GS-006 step 4 requires `GET /api/v1/workflows/runs/{runId}/feedback-requests` (B-API-009, implemented in WS-19).
- GS-007 tests cancellation propagation to feedback child runs using the same reference workflow.
- Both scenarios assert all required dimensions: API contract, persistence, event stream, and parent/child linkage.

## Interface/Schema Contracts
- GS-006 validates: `human-feedback.requested`, `human-feedback.received` events; `human_feedback_requests` projection transitions; parent-child event linkage; duplicate response `409`; invalid option `400`.
- GS-007 validates: `human-feedback.cancelled` event; feedback projection `cancelled` status; no response acceptance after cancellation; terminal states across summary/tree/events.

## Implementation Tasks
- [x] Implement GS-006: Human feedback request-response round trip.
  1. Start parent workflow that reaches a state requiring human feedback.
  2. Parent launches `server.human-feedback.v1` child with prompt/options.
  3. Verify feedback child run is `running` and `human_feedback_requests` status is `awaiting_response`.
  4. Verify `GET /api/v1/workflows/runs/{runId}/feedback-requests` returns the pending feedback request.
  5. Submit valid response via feedback response endpoint.
  6. Verify feedback child completes with `status: "responded"`.
  7. Verify parent resumes and eventually completes.
  8. Assert: events emitted with correct linkage; projection transitions; duplicate response returns `409`; invalid options return `400`; run tree shows feedback child.
- [x] Implement GS-007: Feedback cancellation propagation.
  1. Start parent workflow that launches a feedback child.
  2. Cancel parent while feedback is pending.
  3. Verify cancellation propagates to feedback child.
  4. Verify both runs reach terminal `cancelled` state.
  5. Assert: `human-feedback.cancelled` event emitted; projection status `cancelled`; no response acceptance after cancellation; terminal states consistent.
- [x] Update coverage matrix with new entries.

## Required Artifacts
- `packages/workflow-server/test/e2e/golden/GS-006.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-007.spec.ts`

## File Plan (Exact)
### Create
- `packages/workflow-server/test/e2e/golden/GS-006.spec.ts`
- `packages/workflow-server/test/e2e/golden/GS-007.spec.ts`

### Modify
- `docs/testing/coverage-matrix.md`

## Acceptance Criteria
- GS-006 executes full feedback round trip: start → feedback request → validate pending discovery → respond → child complete → parent complete.
- GS-007 executes cancellation propagation: start → feedback request → cancel parent → both cancelled.
- Both scenarios assert API contract, persistence, event stream, and linkage correctness.
- Both scenarios pass deterministically in CI.

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- GS-006`
  - Expected: human feedback round-trip golden scenario passes with all assertion dimensions.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- GS-007`
  - Expected: feedback cancellation propagation golden scenario passes with all assertion dimensions.

## Spec/Behavior Links
- Spec: sections 6.7, 8.10, 8.11, 11.3, 14.
- Behaviors: `B-HFB-001`, `B-HFB-002`, `B-HFB-003`, `B-HFB-004`, `B-HFB-008`, `B-API-007`, `B-API-008`, `B-API-009`, `B-CHILD-001`, `B-CHILD-004`.
- Golden scenarios: `GS-006`, `GS-007`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| GS-006 | `test/e2e/golden/GS-006.spec.ts` | Full feedback round trip: request-response lifecycle, projection transitions, linkage events, duplicate `409`, invalid `400`, run tree hierarchy. |
| GS-007 | `test/e2e/golden/GS-007.spec.ts` | Cancellation propagates to feedback child; `human-feedback.cancelled` emitted; projection `cancelled`; no post-cancel response acceptance; terminal states consistent. |
