# T22 - Server-Owned Human Feedback Runtime and Projection

## Depends On
- `T02`
- `T04`
- `T05`
- `T07`

## Objective
Implement the locked MVP server-owned human-feedback workflow contract (`server.human-feedback.v1`), canonical event lifecycle, and transactional projection materialization in `human_feedback_requests`.

## Implementation Tasks
- [ ] Implement and auto-register internal package workflow `server.human-feedback.v1` at server bootstrap as required startup behavior.
- [ ] Enforce request contract for numbered options:
  - `options` required,
  - option `id` values are unique contiguous integers starting at `1`,
  - `questionId` required and stable for run lifecycle.
- [ ] Emit feedback lifecycle events using generic `payload` envelope only (`human-feedback.requested|received|cancelled`), with no typed `humanFeedback` field additions.
- [ ] Materialize `human_feedback_requests` projection with required columns/indexes/constraints and same-transaction writes with feedback event appends (Postgres MVP requirement).
- [ ] Enforce first terminal outcome wins (`responded` or `cancelled`) with no-op behavior for competing terminalization attempts.
- [ ] Keep canonical source-of-truth in `workflow_events`; ensure projection derivation matches event progression.

## Required Artifacts
- `packages/workflow-server/src/internal-workflows/human-feedback/*`
- `packages/workflow-server/src/bootstrap/register-internal-workflows.ts`
- `packages/workflow-server/migrations/*`
- `packages/workflow-server/src/persistence/human-feedback-projection-repository.ts`
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `packages/workflow-server/test/integration/human-feedback/*`

## Acceptance Criteria
- `server.human-feedback.v1` is server-owned, auto-registered, and non-overrideable in MVP startup flow.
- Feedback request issuance rejects invalid numbering before run/event/projection creation.
- `human_feedback_requests` rows include required schema and indexes, with idempotent write behavior across retries/recovery.
- Canonical event progression and projection status remain consistent:
  - `requested -> awaiting_response`
  - `received -> responded`
  - `cancelled -> cancelled`.

## Spec/Behavior Links
- Spec: sections 6.4, 6.8, 7.3, 8.11, 11.3, 12.
- Behaviors: `B-HFB-001`, `B-HFB-005`, `B-HFB-008`, `B-HFB-009`, `B-HFB-010`, `B-DATA-004`.
- Integration: `ITX-021`, `ITX-025`, `ITX-027`, `ITX-028`.

## Fixed Implementation Decisions
- Default human feedback workflow is a first-class internal monorepo package and required for startup.
- Runtime replacement of `server.human-feedback.v1` is disallowed in MVP and enforced by dual guards (bootstrap reservation/registration plus registry collision rejection).
- Feedback metadata remains in `WorkflowEvent.payload` for MVP; no dedicated typed event field is introduced.

## Interface/Schema Contracts
- `HumanFeedbackRequestInput` contract:
  - `{ prompt, options: Array<{ id: number; label; description? }>, constraints?, questionId, correlationId?, requestedByRunId, requestedByWorkflowType, requestedByState? }`.
- `HumanFeedbackRequestOutput` contract:
  - `{ status: "responded" | "cancelled", response?: { questionId, selectedOptionIds?, text? }, respondedAt?, cancelledAt? }`.
- Projection schema contract:
  - `human_feedback_requests` includes required columns and unique `request_event_id` guard.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/internal-workflows/human-feedback/workflow.ts`
- `packages/workflow-server/src/internal-workflows/human-feedback/contracts.ts`
- `packages/workflow-server/migrations/004_add_human_feedback_requests.ts`
- `packages/workflow-server/src/persistence/human-feedback-projection-repository.ts`
- `packages/workflow-server/test/integration/human-feedback/projection-transactionality.spec.ts`
- `packages/workflow-server/test/integration/human-feedback/numbering-contract.spec.ts`

### Modify
- `packages/workflow-server/src/bootstrap/register-internal-workflows.ts`
- `packages/workflow-server/src/orchestrator/child/launch-child.ts`
- `packages/workflow-server/src/persistence/event-store.ts`
- `packages/workflow-server/src/persistence/workflow-runs-repository.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- human-feedback/projection-transactionality`
  - Expected: projection writes are transactionally aligned with feedback event appends and remain idempotent.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- human-feedback/numbering-contract`
  - Expected: invalid numbering is rejected pre-creation; valid numbering persists pending request state.
- Command: `pnpm --filter @composable-workflow/workflow-server test -- ITX-021|ITX-027|ITX-028`
  - Expected: integration semantics pass for transactionality, numbering, and immutable clarification behavior.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| HFB-Core-001-ServerOwnedRegistration | `src/bootstrap/register-internal-workflows.ts` | internal default feedback workflow auto-registers and is required at startup. |
| HFB-Core-002-NumberedRequestContract | `src/internal-workflows/human-feedback/contracts.ts` | options are required and numbering is contiguous from `1`. |
| HFB-Core-003-PayloadEnvelopeStability | `src/internal-workflows/human-feedback/workflow.ts` | feedback lifecycle metadata is emitted through `payload` envelope only. |
| HFB-Core-004-ProjectionTransactionalWrite | `src/persistence/human-feedback-projection-repository.ts` | projection writes occur with corresponding feedback event append transaction boundary. |
| HFB-Core-005-FirstTerminalOutcomeWins | `src/persistence/human-feedback-projection-repository.ts` | competing terminal writes are no-ops after first terminalization. |
