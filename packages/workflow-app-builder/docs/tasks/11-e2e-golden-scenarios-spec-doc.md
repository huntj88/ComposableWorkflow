# TSD11 - E2E Golden Scenarios and Production Parity

## Depends On
- `TSD10`

## Objective
Deliver black-box E2E coverage for all documented spec-doc golden scenarios (`GS-SD-001..005`) using the production server process and HTTP-only assertions.

## Implementation Tasks
- [ ] Implement one E2E spec per golden scenario with deterministic fixtures.
- [ ] Validate event-stream state path assertions per scenario.
- [ ] Validate child linkage, terminal outputs, and failure payloads at API boundaries.
- [ ] Add spec-doc waiting-for-feedback cancellation scenario to validate server lifecycle propagation semantics.
- [ ] Ensure production parity by running suites against separately launched server.

## Required Artifacts
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-001-happy-path.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-002-multi-loop.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-004-loop-exceeded.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-005-copilot-failure-propagation.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/spec-doc-feedback-cancellation.spec.ts`
- `docs/testing/coverage-matrix.md`

## Acceptance Criteria
- `GS-SD-001..005` all pass against production server process.
- `GS-SD-002` and `GS-SD-003` scenario IDs are explicitly asserted by test names/metadata (not range-only references).
- Feedback cancellation behavior is verified in black-box spec-doc flow while awaiting human response.
- E2E assertions cover event ordering, state transitions, and output/failure contracts.
- Shared integration/E2E ownership items remain covered in both layers.

## Spec/Behavior Links
- Behaviors document: section 11 (`GS-SD-001..005`), section 13 exit criteria.
- Behaviors document: `B-SD-FAIL-002` (human feedback cancellation lifecycle).
- Integration plan: required commands and black-box parity policy.

## Fixed Implementation Decisions
- E2E suites are HTTP-only and do not introspect in-process state internals.
- Production server must be started externally for black-box tests (no in-test bootstrap bypass).
- Scenario fixtures are deterministic to avoid nondeterministic model behavior.

## Interface/Schema Contracts
- E2E assertions target public run/events/children/feedback API surfaces only.
- Terminal success output and failure payload contracts follow workflow schemas and API envelopes.

## File Plan (Exact)
### Create
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-001-happy-path.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-002-multi-loop.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-004-loop-exceeded.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/gs-sd-005-copilot-failure-propagation.spec.ts`
- `packages/workflow-server/test/e2e/blackbox/spec-doc/spec-doc-feedback-cancellation.spec.ts`

### Modify
- `packages/workflow-server/test/e2e/blackbox/index.spec.ts`
- `docs/testing/coverage-matrix.md`

## Verification
- Command: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox -- spec-doc`
  - Expected: all `GS-SD-001..005` black-box scenarios pass.
- Command: `pnpm --filter @composable-workflow/workflow-server test:e2e:blackbox -- GS-SD-004|GS-SD-005`
  - Expected: loop-failure and child-failure propagation scenarios pass with required diagnostics.

## One-to-One Requirement Mapping
| Requirement ID | Implementation Artifact | Verification Assertion |
|---|---|---|
| SD-E2E-001-HappyPathCompletion | `test/e2e/blackbox/spec-doc/gs-sd-001-happy-path.spec.ts` | single-loop path reaches done with correct terminal output and loops count. |
| SD-E2E-002-MultiLoopCompletion | `test/e2e/blackbox/spec-doc/gs-sd-002-multi-loop.spec.ts` | multi-loop path performs second integration pass with accumulated answers. |
| SD-E2E-003-CustomPromptRoundTrip | `test/e2e/blackbox/spec-doc/gs-sd-003-custom-roundtrip.spec.ts` | both custom intents execute with immediate clarification insertion behavior. |
| SD-E2E-004-LoopExceededFailure | `test/e2e/blackbox/spec-doc/gs-sd-004-loop-exceeded.spec.ts` | max-loop exceedance fails with unresolved-question summary payload. |
| SD-E2E-005-CopilotFailurePropagation | `test/e2e/blackbox/spec-doc/gs-sd-005-copilot-failure-propagation.spec.ts` | child failure event links and stage-context error propagation are observable. |
| SD-E2E-006-FeedbackCancellationLifecycle | `test/e2e/blackbox/spec-doc/spec-doc-feedback-cancellation.spec.ts` | cancellation while awaiting response emits linked cancellation behavior and terminal lifecycle outcome. |

`SD-E2E-006-FeedbackCancellationLifecycle` is the primary black-box ownership artifact for `B-SD-FAIL-002`.
