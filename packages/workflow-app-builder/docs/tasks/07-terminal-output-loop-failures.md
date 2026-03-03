# TSD07 - Terminal Output, Loop Enforcement, and Failure Propagation

## Depends On
- `TSD03`
- `TSD04`
- `TSD05`
- `TSD06`

## Objective
Implement terminal semantics (`Done` and `failed`) including completion confirmation cardinality, output contract emission, loop-limit failure, and child failure propagation with stage context.

## Implementation Tasks
- [ ] Enforce `Done` reachability only from `NumberedOptionsHumanRequest`.
- [ ] Validate completion-confirmation semantics (exactly one selected option).
- [ ] Emit terminal payload conforming to `spec-doc-generation-output.schema.json`.
- [ ] Enforce `maxClarificationLoops` and fail with unresolved-question summary when exceeded.
- [ ] Propagate delegated child workflow failures with explicit state context.

## Required Artifacts
- `packages/workflow-app-builder/src/workflows/spec-doc/states/done.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/failure.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/done-and-failures.test.ts`

## Acceptance Criteria
- Completed runs emit `status: completed`, `.md` `specPath`, zero unresolved questions.
- Loop overrun yields terminal `failed` with unresolved-question details.
- Copilot child failure includes originating FSM state in error context.

## Spec/Behavior Links
- Spec: sections 10, 10.1, 11.
- Behaviors: `B-SD-TRANS-007`, `B-SD-DONE-001`, `B-SD-DONE-002`, `B-SD-DONE-003`, `B-SD-LOOP-001`, `B-SD-LOOP-002`, `B-SD-FAIL-001`, `B-SD-COPILOT-002`.

## Fixed Implementation Decisions
- Completion confirmation validation is evaluated before terminalization.
- Completion intent is interpreted from the authored completion-confirmation question/option selected for that question; canonical global completion option IDs are not required.
- Loop counter increments only on `NumberedOptionsHumanRequest` self-loop.
- Failure payload schema includes unresolved question IDs/prompts for diagnostics.

## Interface/Schema Contracts
- Terminal success schema: `spec-doc-generation-output.schema.json`.
- Failure payload shape includes `{ state, reason, unresolvedQuestions[] }`.
- Completion-confirmation contract requires exactly one selected option before transition to `Done`.

## File Plan (Exact)
### Create
- `packages/workflow-app-builder/src/workflows/spec-doc/states/done.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/failure.ts`
- `packages/workflow-app-builder/test/workflows/spec-doc/done-and-failures.test.ts`

### Modify
- `packages/workflow-app-builder/src/workflows/spec-doc/workflow.ts`
- `packages/workflow-app-builder/src/workflows/spec-doc/state-data.ts`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- done-and-failures`
  - Expected: done invariants and loop/failure semantics are enforced.
- Command: `pnpm --filter @composable-workflow/workflow-app-builder test -- ITX-SD-004|ITX-SD-014`
  - Expected: loop boundary and terminal invariants pass through integration paths.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-TERM-001-DoneOnlyFromHumanRequest | `src/workflows/spec-doc/workflow.ts` | no state other than `NumberedOptionsHumanRequest` can transition to `Done`. |
| SD-TERM-002-CompletionCardinality | `src/workflows/spec-doc/states/done.ts` | completion confirmation requires exactly one selected option. |
| SD-TERM-003-TerminalOutputContract | `src/workflows/spec-doc/states/done.ts` | completed payload satisfies output schema contract. |
| SD-TERM-004-LoopLimitFailure | `src/workflows/spec-doc/failure.ts` | loop overrun fails with unresolved-question summary details. |
| SD-TERM-005-ChildFailureContext | `src/workflows/spec-doc/failure.ts` | copilot child failures propagate with originating FSM state context. |
