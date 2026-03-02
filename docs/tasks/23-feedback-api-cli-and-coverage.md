# T23 - Human Feedback API, CLI Commands, and Coverage Expansion

## Depends On
- `T11`
- `T13`
- `T22`

## Sequencing Gate
- Begin implementation only after `T22` is complete and merged, because API/CLI behavior depends on the server-owned feedback runtime contract and projection persistence introduced in `T22`.

## Objective
Implement strict feedback response/status API semantics and minimal operator CLI support (`feedback list`, `feedback respond`) with complete integration/E2E coverage for validation, idempotency, and wait/resume behavior.

## Implementation Tasks
- [ ] Implement `POST /api/v1/human-feedback/requests/{feedbackRunId}/respond` with strict validation:
  - missing `questionId` returns `400`,
  - invalid `selectedOptionIds` returns `400` and does not terminalize,
  - completion-confirmation requests require exactly one selected option (including workflow-synthesized completion questions when upstream follow-up queue is empty),
  - first accepted response wins; all subsequent responses return `409` with terminal timestamp metadata.
- [ ] Implement `GET /api/v1/human-feedback/requests/{feedbackRunId}` status endpoint returning prompt/options metadata, linkage fields, and response payload.
- [ ] Ensure unresolved feedback has no timeout semantics in MVP and remains `awaiting_response` until response/cancellation.
- [ ] Implement CLI commands:
  - `workflow feedback list --status awaiting_response`
  - `workflow feedback respond --feedback-run-id <id> --response '<json>' --responded-by <id>`.
- [ ] Expand integration and black-box tests for concurrent response races, invalid options, pause/cancel while waiting, and recovery of interrupted feedback waits.
- [ ] Ensure completion-confirmation cardinality tests include workflow-logic synthesized completion prompts (not only model-authored prompts).

## Required Artifacts
- `packages/workflow-server/src/api/routes/human-feedback.ts`
- `packages/workflow-server/src/api/schemas/human-feedback.ts`
- `packages/workflow-server/test/integration/human-feedback/*`
- `packages/workflow-server/test/e2e/blackbox/human-feedback/*`
- `apps/workflow-cli/src/commands/feedback-list.ts`
- `apps/workflow-cli/src/commands/feedback-respond.ts`
- `apps/workflow-cli/src/http/client.ts`
- `apps/workflow-cli/test/contract/feedback-*.spec.ts`

## Acceptance Criteria
- Response endpoint enforces strict `400/409` semantics and preserves first-response-wins guarantees.
- Status endpoint payload aligns with projection and canonical event lifecycle.
- Pending feedback requests remain open indefinitely in MVP without timeout terminalization.
- CLI feedback commands operate via server APIs and surface acceptance/rejection details.
- Integration/E2E coverage includes required feedback-specific behaviors and race/fault cases.

## Spec/Behavior Links
- Spec: sections 6.7, 8.10, 8.11, 11.3, 14.
- Behaviors: `B-API-007`, `B-API-008`, `B-HFB-002`, `B-HFB-003`, `B-HFB-004`, `B-HFB-006`, `B-HFB-007`, `B-HFB-011`, `B-HFB-012`, `B-CLI-005`, `B-CLI-006`.
- Integration: `ITX-020`, `ITX-022`, `ITX-023`, `ITX-024`, `ITX-026`, `ITX-029`.

## Fixed Implementation Decisions
- Feedback duplicate submissions are strict conflicts (`409`) after first accepted terminal outcome.
- API validation runs schema and option-ID checks before any terminalization side effects.
- CLI feedback scope is intentionally minimal for MVP (no watch mode, no bulk workflows).

## Interface/Schema Contracts
- Respond endpoint request:
  - `{ response: { questionId: string, selectedOptionIds?: number[], text?: string }, respondedBy: string }`.
- Respond endpoint conflict response includes terminal metadata:
  - `{ feedbackRunId, status, respondedAt?, cancelledAt? }`.
- Status endpoint response includes:
  - request status,
  - prompt/options metadata,
  - response payload,
  - parent run linkage.

## File Plan (Exact)
### Create
- `packages/workflow-server/src/api/routes/human-feedback.ts`
- `packages/workflow-server/src/api/schemas/human-feedback.ts`
- `packages/workflow-server/test/integration/human-feedback/first-wins-concurrency.spec.ts`
- `packages/workflow-server/test/integration/human-feedback/invalid-option-validation.spec.ts`
- `packages/workflow-server/test/integration/human-feedback/wait-safe-point-lifecycle.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/human-feedback/roundtrip.spec.ts`
- `apps/workflow-cli/src/commands/feedback-list.ts`
- `apps/workflow-cli/src/commands/feedback-respond.ts`
- `apps/workflow-cli/test/contract/feedback-list.spec.ts`
- `apps/workflow-cli/test/contract/feedback-respond.spec.ts`

### Modify
- `packages/workflow-server/src/api/server.ts`
- `packages/workflow-server/src/api/routes/runs.ts`
- `packages/workflow-server/src/orchestrator/transition-runner.ts`
- `apps/workflow-cli/src/index.ts`
- `apps/workflow-cli/src/http/client.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test -- human-feedback`
  - Expected: response/status endpoints satisfy strict validation/conflict semantics and wait-state behavior.
- Command: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox -- human-feedback`
  - Expected: black-box feedback round-trip/cancellation/recovery scenarios pass.
- Command: `pnpm --filter @composable-workflow/workflow-cli test -- feedback`
  - Expected: CLI feedback list/respond contract tests pass against expected API payloads.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| HFB-API-001-QuestionIdRequired | `src/api/routes/human-feedback.ts` | missing `questionId` returns `400` without terminalization. |
| HFB-API-002-OptionValidation | `src/api/routes/human-feedback.ts` | invalid `selectedOptionIds` returns `400` and status remains `awaiting_response`. |
| HFB-API-003-StrictConflictModel | `src/api/routes/human-feedback.ts` | post-terminal submissions return `409` with terminal timestamp metadata. |
| HFB-API-004-CompletionConfirmationCardinality | `src/api/routes/human-feedback.ts` | completion-confirmation responses require exactly one selected option. |
| HFB-API-004a-WorkflowSynthesizedCompletion | `src/api/routes/human-feedback.ts` | exactly-one selection rule applies equally to workflow-synthesized completion questions. |
| HFB-API-005-NoTimeoutPendingWait | `src/orchestrator/transition-runner.ts` | unresolved feedback remains pending until explicit response/cancellation. |
| HFB-CLI-001-ListPendingRequests | `apps/workflow-cli/src/commands/feedback-list.ts` | CLI lists pending feedback with status/linkage metadata. |
| HFB-CLI-002-SubmitResponse | `apps/workflow-cli/src/commands/feedback-respond.ts` | CLI submits response and surfaces accepted/400/409 outcomes. |
