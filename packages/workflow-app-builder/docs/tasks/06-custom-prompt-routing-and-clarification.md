# TSD06 - Custom Prompt Routing and Clarification Expansion

## Depends On
- `TSD02`
- `TSD05`

## Objective
Implement `ClassifyCustomPrompt` and `ExpandQuestionWithClarification` routing, including intent-priority handling and immediate-next queue insertion.

## Implementation Tasks
- [x] Route any response with custom text to `ClassifyCustomPrompt` before queue continuation.
- [x] Delegate classification via `spec-doc.classify-custom-prompt.v1` and validate intent schema.
- [x] For `custom-answer`, buffer custom text with current question answer and resume queue.
- [x] For `clarifying-question`, delegate follow-up generation via `spec-doc.expand-clarification.v1`.
- [x] Insert follow-up as immediate next queue item with new deterministic `questionId` and `kind: issue-resolution`.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/classify-custom-prompt.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/expand-question-with-clarification.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/classify-custom-prompt.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/expand-question-with-clarification.test.ts`

## Acceptance Criteria
- Custom text classification takes precedence over direct self-loop logic.
- Clarification follow-up inserts immediately after current question, ahead of older unresolved items.
- Original asked question payload remains immutable.
- Clarification follow-up option `description` fields include `Pros:` and `Cons:` content per spec section 7.2.4.

## Spec/Behavior Links
- Spec: sections 6.2, 6.3, 6.4, 7.1, 7.2.3, 7.2.4.
- Behaviors: `B-SD-TRANS-005`, `B-SD-TRANS-008`, `B-SD-TRANS-009`, `B-SD-TRANS-010`, `B-SD-QUEUE-002`, `B-SD-QUEUE-003`, `B-SD-QUEUE-005`, `B-SD-SCHEMA-005`.

## Fixed Implementation Decisions
- Intent routing authority is only `structuredOutput.intent` from validated classification output.
- Clarification expansion creates new queue item; no mutation of previously asked questions.
- Insert position for clarification follow-up is `currentIndex + 1`.
- Follow-up `questionId` authority is the schema-validated delegated output; workflow enforces that it is both new (distinct from source) and deterministic for identical inputs (using `sourceQuestionId` + `nextQuestionOrdinalHint` prompt context).

## Interface/Schema Contracts
- Classification schema: `custom-prompt-classification-output.schema.json`.
- Clarification follow-up schema: `clarification-follow-up-output.schema.json` with base numbered-question conformance.
- Clarification follow-up must include a new deterministic `questionId` and workflow-assigned `kind: "issue-resolution"` prior to queue insertion.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/states/classify-custom-prompt.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/states/expand-question-with-clarification.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/classify-custom-prompt.test.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/expand-question-with-clarification.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/queue.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- classify-custom-prompt`
  - Expected: both intents route correctly and custom-answer buffering is preserved.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- expand-question-with-clarification`
  - Expected: follow-up insertion is immediate-next and immutable-question guarantees hold.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-CUSTOM-001-PriorityClassificationRoute | `src/workflows/spec-doc/states/classify-custom-prompt.ts` | responses with custom text route to classification first. |
| SD-CUSTOM-002-IntentAsSingleTruth | `src/workflows/spec-doc/states/classify-custom-prompt.ts` | routing depends only on validated `structuredOutput.intent`. |
| SD-CUSTOM-003-CustomAnswerBuffering | `src/workflows/spec-doc/states/classify-custom-prompt.ts` | custom-answer text is buffered with the current answer set. |
| SD-CUSTOM-004-ImmediateClarificationInsertion | `src/workflows/spec-doc/states/expand-question-with-clarification.ts` | generated follow-up inserts as immediate next queue item. |
| SD-CUSTOM-005-QuestionImmutability | `src/workflows/spec-doc/queue.ts` | original asked question records are never mutated. |
| SD-CUSTOM-006-ClarificationProsConsContent | `test/workflows/spec-doc/expand-question-with-clarification.test.ts` | clarification follow-up option descriptions include `Pros:` and `Cons:` guidance text. |
