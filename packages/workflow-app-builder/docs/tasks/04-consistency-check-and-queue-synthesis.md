# TSD04 - Consistency Check and Queue Synthesis

## Depends On
- `TSD02`
- `TSD03`

## Objective
Implement `LogicalConsistencyCheckCreateFollowUpQuestions` with deterministic output validation, queue ordering, and completion-confirmation synthesis.

## Implementation Tasks
- [x] Delegate consistency check via `spec-doc.consistency-check.v1` with required schema.
- [x] Supply `{{remainingQuestionIdsJson}}` template variable from persisted integration output `remainingQuestionIds`.
- [x] Validate `followUpQuestions` against schema and numbered item rules.
- [x] Validate that generated option `description` fields include concise `Pros:` and `Cons:` content per spec section 6.4.
- [x] Deterministically sort queue by `questionId`.
- [x] Synthesize exactly one completion-confirmation question when follow-up list is empty, with an explicit "spec is done" option.
- [x] Force transition target to `NumberedOptionsHumanRequest` regardless of model output content.
- [x] Increment `consistencyCheckPasses` counter on successful schema-valid delegation.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/queue.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`

## Acceptance Criteria
- Direct transition from this state to `Done` is impossible.
- Empty follow-up output synthesizes one completion question with explicit done option.
- Queue ordering is deterministic and stable across retries.
- `consistencyCheckPasses` is incremented on each successful consistency-check pass.
- `{{remainingQuestionIdsJson}}` is sourced from persisted integration output in state data.
- Generated option `description` fields include `Pros:` and `Cons:` content.

## Spec/Behavior Links
- Spec: sections 6.2, 6.3, 6.4, 7.1, 7.2.2, 10.1.
- Behaviors: `B-SD-TRANS-003`, `B-SD-TRANS-011`, `B-SD-QUEUE-001`, `B-SD-SCHEMA-004`, `B-SD-SCHEMA-006`.

## Fixed Implementation Decisions
- Transition target from consistency check is hardcoded to `NumberedOptionsHumanRequest`.
- Completion-confirmation queue item is workflow-authored, never model-authored.
- Completion-confirmation option IDs are question-local only (no canonical global completion option ID requirement).
- Queue ordering is deterministic by generated `questionId` and must remain stable across retries/recovery.

## Interface/Schema Contracts
- Consistency-check output schema: `consistency-check-output.schema.json`.
- Queue item contract includes `questionId`, `kind`, `prompt`, `options[]` with contiguous integer IDs.
- Completion-confirmation queue item contract includes explicit "spec is done" option text and valid numbered options envelope.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/states/logical-consistency-check.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/queue.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/logical-consistency-check.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- logical-consistency-check`
  - Expected: fixed routing and queue synthesis semantics pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- ITX-SD-013`
  - Expected: all output variants route only to `NumberedOptionsHumanRequest`.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-CHECK-001-FixedRouteToHumanRequest | `src/workflows/spec-doc/states/logical-consistency-check.ts` | transition target is always `NumberedOptionsHumanRequest`. |
| SD-CHECK-002-DeterministicQueueOrder | `src/workflows/spec-doc/queue.ts` | queue order is deterministic by `questionId`. |
| SD-CHECK-003-CompletionSynthesis | `src/workflows/spec-doc/queue.ts` | empty follow-up list synthesizes exactly one completion-confirmation question. |
| SD-CHECK-004-QuestionItemSchema | `src/workflows/spec-doc/states/logical-consistency-check.ts` | all generated issue-resolution items satisfy numbered question schema constraints. |
| SD-CHECK-005-ConsistencyPassCounter | `src/workflows/spec-doc/states/logical-consistency-check.ts` | `consistencyCheckPasses` increments on each successful pass. |
| SD-CHECK-006-RemainingQuestionIdsInterpolation | `src/workflows/spec-doc/states/logical-consistency-check.ts` | `{{remainingQuestionIdsJson}}` is sourced from persisted integration output. |
| SD-CHECK-007-OptionDescriptionProsConsContent | `test/workflows/spec-doc/logical-consistency-check.test.ts` | generated option descriptions include `Pros:` and `Cons:` guidance text. |
