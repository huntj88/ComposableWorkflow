# TSD05 - NumberedOptionsHumanRequest Queue Processor

## Depends On
- `TSD02`
- `TSD04`

## Objective
Implement deterministic per-question queue execution in `NumberedOptionsHumanRequest` with one feedback child run per item and normalized answer accumulation.

## Implementation Tasks
- [x] Launch exactly one `server.human-feedback.v1` child run per queue item (no batching).
- [x] Pass stable `questionId` through child input and maintain linkage for diagnostics.
- [x] Validate/record accepted responses as normalized answers with timestamps.
- [x] Honor feedback API validation boundaries: invalid `selectedOptionIds` and invalid completion-confirmation cardinality do not record answers and keep the question pending.
- [x] Enforce self-loop semantics while queued items remain and no custom text classification is pending.
- [x] Route to `IntegrateIntoSpec` on queue exhaustion when completion was not confirmed.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/answers.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`

## Acceptance Criteria
- Queue processor asks one question at a time and preserves per-question immutability.
- Answer records include `questionId`, `selectedOptionIds`, optional `text`, `answeredAt`.
- Invalid feedback submissions produce no answer mutation in workflow state.
- Queue exhaustion routes either to `Done` candidate path (handled in `TSD07`) or `IntegrateIntoSpec` updates path.

## Spec/Behavior Links
- Spec: sections 6.2, 6.3, 6.4, 8.
- Behaviors: `B-SD-TRANS-004`, `B-SD-TRANS-006`, `B-SD-HFB-001`, `B-SD-HFB-002`, `B-SD-HFB-003`, `B-SD-HFB-004`, `B-SD-QUEUE-004`.

## Fixed Implementation Decisions
- Queue processor operates on deterministic index pointer in persisted state.
- Normalized answers append-only; existing records are never rewritten.
- Child workflow contract boundary is server-owned and consumed via workflow type + schema shape only.

## Interface/Schema Contracts
- Feedback request envelope includes stable `questionId`.
- Normalized answer record format matches spec section 6.5 answer item.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/answers.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- numbered-options-human-request`
  - Expected: one feedback child run per queue item, self-loop behavior, and answer accumulation pass.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- ITX-SD-002|ITX-SD-007`
  - Expected: queue stability and accumulated answers in second integration pass are validated.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-HRQ-001-OneChildPerQuestion | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | each queue item launches exactly one feedback child run. |
| SD-HRQ-002-StableQuestionLinkage | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | `questionId` remains stable across request/response linkage. |
| SD-HRQ-003-NormalizedAnswerPersistence | `src/workflows/spec-doc/answers.ts` | accepted responses persist normalized answer records with timestamps. |
| SD-HRQ-004-QueueExhaustionToIntegrate | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | non-completion queue exhaustion transitions to `IntegrateIntoSpec`. |
