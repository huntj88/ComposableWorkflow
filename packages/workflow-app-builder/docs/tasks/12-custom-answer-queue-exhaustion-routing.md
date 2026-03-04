# TSD12 - NumberedOptionsHumanRequest Queue-Exhaustion on Re-Entry

## Depends On
- `TSD05`
- `TSD06`

## Objective
Fix a bug where `NumberedOptionsHumanRequest` hard-fails when re-entered with an already-exhausted queue. After `ClassifyCustomPrompt` (custom-answer) buffers the supplementary answer and transitions back to `NumberedOptionsHumanRequest`, the handler's bounds-check guard (`queueIndex >= queue.length`) must evaluate queue-exhaustion transitions (Done / IntegrateIntoSpec) instead of calling `ctx.fail()`.

## Root Cause

When `NumberedOptionsHumanRequest` receives a response with custom text for the last (or only) question in the queue, it:
1. Records the answer (including the custom text) and advances `queueIndex` past the answered item.
2. Transitions to `ClassifyCustomPrompt` with the advanced `queueIndex`.

`ClassifyCustomPrompt` classifies intent as `custom-answer`, appends a supplementary normalized answer with the classification's `customAnswerText`, and correctly transitions back to `NumberedOptionsHumanRequest`. However, `NumberedOptionsHumanRequest` treats `queueIndex >= queue.length` as a hard failure instead of evaluating queue-exhaustion routing.

This was observed in production run `wr_01KJWQGTZR2CQSTWWCK67QS7Y4` where a `completion-confirmation` question was answered with option 2 + custom text. The classification returned `custom-answer`, and the re-entry to `NumberedOptionsHumanRequest` failed with:
```
[NumberedOptionsHumanRequest] Queue is empty or index 1 is out of bounds (queue size: 1)
```

## Implementation Tasks
- [ ] In `NumberedOptionsHumanRequest`: change the `queueIndex >= queue.length` guard from a hard fail to queue-exhaustion evaluation.
  - If any answered item is the completion-confirmation question with the done option (option 1) selected → transition to `Done`.
  - Otherwise → transition to `IntegrateIntoSpec` with accumulated normalized answers.
- [ ] Keep `queue.length === 0` as a hard fail (truly empty queue is still an error).
- [ ] Add unit tests for the re-entry routing branches in `numbered-options-human-request.test.ts`.
- [ ] Verify existing tests still pass (no changes to `ClassifyCustomPrompt`).

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts` (modify)
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts` (modify)

## Acceptance Criteria
- `NumberedOptionsHumanRequest` re-entered with exhausted queue (all items answered, no completion-confirmation done) transitions to `IntegrateIntoSpec`.
- `NumberedOptionsHumanRequest` re-entered with exhausted queue where completion-confirmation with done option was selected transitions to `Done`.
- `NumberedOptionsHumanRequest` with truly empty queue (`queue.length === 0`) still hard-fails.
- `NumberedOptionsHumanRequest` with remaining queue items continues to launch feedback children (existing behavior preserved).
- No changes to `ClassifyCustomPrompt` — it continues to always route to `NumberedOptionsHumanRequest` on custom-answer.
- No regressions in existing test suites.

## Spec/Behavior Links
- Spec: section 6.4 (re-entry with exhausted queue).
- Behaviors: `B-SD-TRANS-012` (new), `B-SD-TRANS-006`, `B-SD-TRANS-007`.

## Fixed Implementation Decisions
- The fix is in `NumberedOptionsHumanRequest`, not `ClassifyCustomPrompt`. `ClassifyCustomPrompt` should only classify and buffer — routing decisions on queue exhaustion belong to `NumberedOptionsHumanRequest` which owns all queue-processing logic.
- `queue.length === 0` remains a hard fail. Only `queueIndex >= queue.length` with `queue.length > 0` triggers exhaustion evaluation.
- Completion-confirmation detection uses the `COMPLETION_CONFIRMATION_QUESTION_ID` constant from `queue.ts` and inspects the last answer for that question in `normalizedAnswers`.

## Interface/Schema Contracts
- No schema changes required.
- State data shape (`SpecDocStateData`) is unchanged.
- Transition targets are existing states (`Done`, `IntegrateIntoSpec`).

## File Plan (Exact)
### Create
(none)

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/states/numbered-options-human-request.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/numbered-options-human-request.test.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- numbered-options-human-request`
  - Expected: all tests pass including new re-entry queue-exhaustion tests.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- classify-custom-prompt`
  - Expected: no regressions; existing tests still pass unchanged.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test`
  - Expected: full suite passes.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| B-SD-TRANS-012-ExhaustedQueueReEntry | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | re-entry with exhausted queue routes to IntegrateIntoSpec or Done, not ctx.fail(). |
| B-SD-TRANS-012-EmptyQueueStillFails | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | truly empty queue (length 0) still hard-fails. |
| B-SD-TRANS-012-CompletionDoneRouting | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | exhausted queue with completion-confirmation done option routes to Done. |
| B-SD-TRANS-012-IntegrateRouting | `src/workflows/spec-doc/states/numbered-options-human-request.ts` | exhausted queue without completion-confirmation done routes to IntegrateIntoSpec. |
